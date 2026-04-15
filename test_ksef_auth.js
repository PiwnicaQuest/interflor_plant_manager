const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");

const API = "https://api-test.ksef.mf.gov.pl/api/v2";
const pool = new Pool({ user: "plantmanager", password: "plantmanager123", host: "localhost", database: "plantmanager" });

async function test() {
  const r = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'ksef_token'");
  const token = r.rows[0]?.setting_value || "";
  console.log("Token:", token);
  console.log("Token length:", token.length);

  // Challenge
  const ch = await axios.post(API + "/auth/challenge");
  console.log("\nChallenge:", ch.data.challenge);
  console.log("TimestampMs:", ch.data.timestampMs);

  // Public key
  const certs = await axios.get(API + "/security/public-key-certificates");
  const x509 = new crypto.X509Certificate(Buffer.from(certs.data[0].certificate, "base64"));
  const pubPem = x509.publicKey.export({ type: "spki", format: "pem" });

  // Encrypt: token|timestampMs
  const plaintext = token + "|" + ch.data.timestampMs;
  console.log("\nPlaintext (first 60):", plaintext.substring(0, 60) + "...");
  const enc = crypto.publicEncrypt(
    { key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(plaintext, "utf-8")
  );

  const nip = "8321995551";

  try {
    console.log("\nPOST /auth/ksef-token...");
    const auth = await axios.post(API + "/auth/ksef-token", {
      challenge: ch.data.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken: enc.toString("base64"),
    });
    console.log("Auth status:", auth.status);
    console.log("Auth data:", JSON.stringify(auth.data, null, 2).substring(0, 600));

    const authToken = auth.data.authenticationToken?.token;
    const ref = auth.data.referenceNumber;

    if (!ref) {
      console.log("No referenceNumber returned!");
      await pool.end();
      return;
    }

    // Poll
    console.log("\nPolling GET /auth/" + ref + " ...");
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const st = await axios.get(API + "/auth/" + ref, {
          headers: { Authorization: "Bearer " + authToken }
        });
        console.log("Poll", i + 1, ":", JSON.stringify(st.data).substring(0, 250));
        if (st.data.processingCode === 200) {
          console.log("AUTH READY!");
          break;
        }
      } catch (e) {
        console.log("Poll", i + 1, ": HTTP", e.response?.status);
        console.log("  ", JSON.stringify(e.response?.data || {}).substring(0, 300));
      }
    }
  } catch (e) {
    console.log("\nAuth ERROR:", e.response?.status);
    console.log("Response:", JSON.stringify(e.response?.data, null, 2).substring(0, 1000));
  }

  await pool.end();
}

test().catch(e => { console.error(e); pool.end(); });
