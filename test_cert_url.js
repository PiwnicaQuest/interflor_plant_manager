const crypto = require('crypto');
const { Pool } = require('pg');
const pool = new Pool({ user: 'plantmanager', password: 'plantmanager123', host: 'localhost', database: 'plantmanager' });

(async () => {
  const xmlRes = await pool.query("SELECT ksef_xml FROM invoices WHERE id = 41");
  const xml = xmlRes.rows[0].ksef_xml;
  const xmlHash = crypto.createHash("sha256").update(xml, "utf-8").digest("base64url");

  const keyRes = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'ksef_cert_key_pem'");
  const certKeyPem = keyRes.rows[0].setting_value;

  const sellerNip = "8321995551";
  const certSerial = "02A7E15C955B0E37";
  const typ = "Nip";
  const qrHost = "qr-test.ksef.mf.gov.pl";
  const pathToSign = `${qrHost}/certificate/${typ}/${sellerNip}/${sellerNip}/${certSerial}/${xmlHash}`;

  const keyObj = crypto.createPrivateKey(certKeyPem);
  console.log("Key type:", keyObj.asymmetricKeyType);

  const signer = crypto.createSign("SHA256");
  signer.update(pathToSign, "utf8");
  signer.end();
  const sig = signer.sign({ key: keyObj, dsaEncoding: "ieee-p1363" });
  const sigB64Url = sig.toString("base64url");

  console.log("xmlHash:", xmlHash);
  console.log("pathToSign:", pathToSign);
  console.log("sig base64url:", sigB64Url);
  console.log("Full URL:");
  console.log(`https://${pathToSign}/${sigB64Url}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
