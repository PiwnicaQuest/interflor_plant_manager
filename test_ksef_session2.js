const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");

const API = "https://api-test.ksef.mf.gov.pl/api/v2";
const pool = new Pool({ user: "plantmanager", password: "plantmanager123", host: "localhost", database: "plantmanager" });

async function getPublicKey(certs, usage) {
  const now = new Date();
  const cert = certs.find(c => {
    const match = Array.isArray(c.usage) ? c.usage.includes(usage) : c.usage === usage;
    return match && new Date(c.validFrom) <= now && now <= new Date(c.validTo);
  }) || certs.find(c => Array.isArray(c.usage) ? c.usage.includes(usage) : c.usage === usage);

  if (!cert) throw new Error("No cert for " + usage);
  const x509 = new crypto.X509Certificate(Buffer.from(cert.certificate, "base64"));
  return x509.publicKey.export({ type: "spki", format: "pem" });
}

async function test() {
  try {
    const r = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'ksef_token'");
    const token = r.rows[0]?.setting_value || "";
    const nip = "8321995551";

    // Get certs
    const certsResp = await axios.get(API + "/security/public-key-certificates");
    const certs = certsResp.data;
    console.log("Certificates:");
    certs.forEach((c, i) => console.log("  Cert", i, ":", c.usage));

    const tokenKey = await getPublicKey(certs, "KsefTokenEncryption");
    const symKey = await getPublicKey(certs, "SymmetricKeyEncryption");
    console.log("TokenKey and SymKey are DIFFERENT:", tokenKey !== symKey);

    // 1. Challenge + Auth
    const ch = await axios.post(API + "/auth/challenge");
    const plain = token + "|" + ch.data.timestampMs;
    const enc = crypto.publicEncrypt({ key: tokenKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(plain));

    const auth = await axios.post(API + "/auth/ksef-token", {
      challenge: ch.data.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken: enc.toString("base64"),
    });
    const authToken = auth.data.authenticationToken?.token;
    const authRef = auth.data.referenceNumber;
    console.log("\nAuth OK, ref:", authRef);

    // 2. Poll
    await new Promise(r => setTimeout(r, 1500));
    const st = await axios.get(API + "/auth/" + authRef, { headers: { Authorization: "Bearer " + authToken } });
    console.log("Auth status:", st.data.status?.code, st.data.status?.description);

    // 3. Redeem
    const redeem = await axios.post(API + "/auth/token/redeem", {}, { headers: { Authorization: "Bearer " + authToken } });
    const accessToken = redeem.data.accessToken?.token;
    console.log("Access token OK, length:", accessToken?.length);

    // 4. Open session with SymmetricKeyEncryption cert
    const aesKey = crypto.randomBytes(32);
    const aesIV = crypto.randomBytes(16);
    const encAesKey = crypto.publicEncrypt({ key: symKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey);

    console.log("\nOpening session with SymmetricKeyEncryption cert...");
    const sess = await axios.post(API + "/sessions/online", {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: encAesKey.toString("base64"),
        initializationVector: aesIV.toString("base64"),
      },
    }, { headers: { Authorization: "Bearer " + accessToken } });

    const sessRef = sess.data.referenceNumber;
    console.log("Session created:", sessRef);

    // 5. Poll session
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await axios.get(API + "/sessions/" + sessRef, { headers: { Authorization: "Bearer " + accessToken } });
      const code = s.data.status?.code || s.data.processingCode;
      console.log("Session poll", i+1, ": code=" + code, s.data.status?.description || "");
      if (code === 200 || code === 315) { console.log("SESSION ACTIVE!"); break; }
      if (code >= 400) { console.log("SESSION FAILED!"); break; }
    }

    // 6. Close
    try {
      await axios.post(API + "/sessions/online/" + sessRef + "/close", {}, { headers: { Authorization: "Bearer " + accessToken } });
      console.log("Session closed OK");
    } catch(e) {
      console.log("Close:", e.response?.status, JSON.stringify(e.response?.data || {}).substring(0, 200));
    }

    console.log("\nSUCCESS!");
  } catch (err) {
    console.error("\nERROR:", err.config?.url);
    console.error("Status:", err.response?.status);
    console.error("Data:", JSON.stringify(err.response?.data, null, 2)?.substring(0, 600));
  }
  await pool.end();
}
test();
