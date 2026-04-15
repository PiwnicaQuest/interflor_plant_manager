const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");

const API = "https://api-test.ksef.mf.gov.pl/api/v2";
const pool = new Pool({ user: "plantmanager", password: "plantmanager123", host: "localhost", database: "plantmanager" });

async function test() {
  try {
    const r = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'ksef_token'");
    const token = r.rows[0]?.setting_value || "";
    const nip = "8321995551";

    // 1. Challenge
    console.log("=== Step 1: Challenge ===");
    const ch = await axios.post(API + "/auth/challenge");
    console.log("OK:", ch.data.challenge.substring(0, 30));

    // 2. Public key
    console.log("\n=== Step 2: Public Key ===");
    const certs = await axios.get(API + "/security/public-key-certificates");
    const x509 = new crypto.X509Certificate(Buffer.from(certs.data[0].certificate, "base64"));
    const pubPem = x509.publicKey.export({ type: "spki", format: "pem" });
    console.log("OK: RSA key extracted");

    // 3. Auth
    console.log("\n=== Step 3: POST /auth/ksef-token ===");
    const plain = token + "|" + ch.data.timestampMs;
    const enc = crypto.publicEncrypt({ key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(plain));

    const auth = await axios.post(API + "/auth/ksef-token", {
      challenge: ch.data.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken: enc.toString("base64"),
    });
    const authToken = auth.data.authenticationToken?.token;
    const authRef = auth.data.referenceNumber;
    console.log("OK: authRef=" + authRef);

    // 4. Poll auth
    console.log("\n=== Step 4: Poll auth ===");
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const st = await axios.get(API + "/auth/" + authRef, { headers: { Authorization: "Bearer " + authToken } });
      const code = st.data.status?.code;
      console.log("Poll", i+1, ": code=" + code, st.data.status?.description || "");
      if (code === 200) break;
    }

    // 5. Redeem
    console.log("\n=== Step 5: POST /auth/token/redeem ===");
    const redeem = await axios.post(API + "/auth/token/redeem", {}, { headers: { Authorization: "Bearer " + authToken } });
    const accessToken = redeem.data.accessToken?.token;
    console.log("OK: accessToken length=" + (accessToken?.length || 0));
    console.log("Redeem response keys:", Object.keys(redeem.data));

    // 6. Open session
    console.log("\n=== Step 6: POST /sessions/online ===");
    const aesKey = crypto.randomBytes(32);
    const aesIV = crypto.randomBytes(16);
    const encKey = crypto.publicEncrypt({ key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey);

    const sessionBody = {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: encKey.toString("base64"),
        initializationVector: aesIV.toString("base64")
      },
    };
    console.log("Session request body:", JSON.stringify(sessionBody, null, 2));

    const sess = await axios.post(API + "/sessions/online", sessionBody, {
      headers: { Authorization: "Bearer " + accessToken }
    });
    console.log("Session response status:", sess.status);
    console.log("Session response:", JSON.stringify(sess.data, null, 2).substring(0, 800));

    const sessRef = sess.data.referenceNumber;

    // 7. Poll session status
    console.log("\n=== Step 7: Poll session status ===");
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const st = await axios.get(API + "/sessions/" + sessRef, { headers: { Authorization: "Bearer " + accessToken } });
        console.log("Session poll", i+1, ":", JSON.stringify(st.data).substring(0, 300));
        const code = st.data.processingCode || st.data.status?.code;
        if (code === 200 || code === 315) {
          console.log("SESSION ACTIVE!");
          break;
        }
        if (code >= 400) {
          console.log("SESSION FAILED with code:", code);
          break;
        }
      } catch(e) {
        console.log("Session poll", i+1, ": HTTP", e.response?.status, JSON.stringify(e.response?.data || {}).substring(0, 300));
      }
    }

    // 8. Close session
    console.log("\n=== Step 8: Close session ===");
    try {
      await axios.post(API + "/sessions/online/" + sessRef + "/close", {}, { headers: { Authorization: "Bearer " + accessToken } });
      console.log("Session closed OK");
    } catch(e) {
      console.log("Close error:", e.response?.status, JSON.stringify(e.response?.data || {}).substring(0, 300));
    }

  } catch (err) {
    console.error("\n!!! ERROR !!!");
    console.error("URL:", err.config?.url);
    console.error("Method:", err.config?.method);
    console.error("Status:", err.response?.status);
    console.error("Response:", JSON.stringify(err.response?.data, null, 2)?.substring(0, 1000));
  }

  await pool.end();
}

test();
