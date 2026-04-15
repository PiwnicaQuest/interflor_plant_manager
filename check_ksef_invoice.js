const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");

const API = "https://api-test.ksef.mf.gov.pl/api/v2";
const pool = new Pool({ user: "plantmanager", password: "plantmanager123", host: "localhost", database: "plantmanager" });

async function getAccessToken() {
  const r = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'ksef_token'");
  const token = r.rows[0]?.setting_value || "";
  const nip = "8321995551";

  const certs = await axios.get(API + "/security/public-key-certificates");
  const tokenCert = certs.data.find(c => c.usage?.includes("KsefTokenEncryption"));
  const x509 = new crypto.X509Certificate(Buffer.from(tokenCert.certificate, "base64"));
  const pubPem = x509.publicKey.export({ type: "spki", format: "pem" });

  const ch = await axios.post(API + "/auth/challenge");
  const enc = crypto.publicEncrypt({ key: pubPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(token + "|" + ch.data.timestampMs));

  const auth = await axios.post(API + "/auth/ksef-token", {
    challenge: ch.data.challenge,
    contextIdentifier: { type: "Nip", value: nip },
    encryptedToken: enc.toString("base64"),
  });

  const authToken = auth.data.authenticationToken.token;
  await new Promise(r => setTimeout(r, 2000));
  const redeem = await axios.post(API + "/auth/token/redeem", {}, { headers: { Authorization: "Bearer " + authToken } });
  return redeem.data.accessToken.token;
}

async function main() {
  try {
    const accessToken = await getAccessToken();
    console.log("Got access token");

    // Get all KSeF refs from DB
    const inv = await pool.query("SELECT id, invoice_number, ksef_reference_number, ksef_status FROM invoices WHERE ksef_reference_number IS NOT NULL ORDER BY ksef_sent_at DESC LIMIT 5");
    console.log("\nInvoices with KSeF ref:", inv.rows);

    for (const row of inv.rows) {
      const ref = row.ksef_reference_number;
      console.log("\n=== Checking", ref, "===");

      // Try multiple endpoints
      try {
        const r = await axios.get(API + "/invoices/ksef/" + ref, { headers: { Authorization: "Bearer " + accessToken } });
        console.log("Invoice details:", JSON.stringify(r.data, null, 2).substring(0, 1500));
      } catch(e) {
        console.log("GET /invoices/ksef/:", e.response?.status, JSON.stringify(e.response?.data)?.substring(0, 500));
      }

      // Try element reference format
      try {
        const r2 = await axios.get(API + "/invoices/" + ref, { headers: { Authorization: "Bearer " + accessToken } });
        console.log("Invoice /invoices/:", JSON.stringify(r2.data, null, 2).substring(0, 1500));
      } catch(e) {
        console.log("GET /invoices/:", e.response?.status, JSON.stringify(e.response?.data)?.substring(0, 500));
      }
    }
  } catch(e) {
    console.error("ERROR:", e.response?.status, JSON.stringify(e.response?.data)?.substring(0, 500) || e.message);
  }
  await pool.end();
}
main();
