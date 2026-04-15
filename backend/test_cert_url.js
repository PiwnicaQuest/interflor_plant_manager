const crypto = require('crypto');
const https = require('https');
const { Pool } = require('pg');
const pool = new Pool({ user: 'plantmanager', password: 'plantmanager123', host: 'localhost', database: 'plantmanager' });
(async () => {
  const x = await pool.query("SELECT ksef_xml FROM invoices WHERE id=41");
  const xml = x.rows[0].ksef_xml;
  const hash = crypto.createHash('sha256').update(xml,'utf-8').digest('base64url');
  const k = await pool.query("SELECT setting_value FROM settings WHERE setting_key='ksef_cert_key_pem'");
  const s = await pool.query("SELECT setting_value FROM settings WHERE setting_key='ksef_cert_serial'");
  const serial = s.rows[0].setting_value.toUpperCase();
  const nip = '8321995551';
  const qrHost = 'qr.ksef.mf.gov.pl';
  const path = qrHost + '/certificate/Nip/' + nip + '/' + nip + '/' + serial + '/' + hash;
  const key = crypto.createPrivateKey(k.rows[0].setting_value);
  console.log('KeyType:', key.asymmetricKeyType, 'Serial:', serial);
  let sig;
  if (key.asymmetricKeyType === 'ec') {
    const sr = crypto.createSign('SHA256'); sr.update(path,'utf8'); sr.end();
    sig = sr.sign({key, dsaEncoding:'ieee-p1363'});
  } else {
    sig = crypto.sign('SHA256', Buffer.from(path,'utf8'), {key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32});
  }
  const url = 'https://' + path + '/' + sig.toString('base64url');
  console.log('URL:', url);
  https.get(url, r => {
    console.log('HTTP', r.statusCode);
    let b=''; r.on('data',c=>b+=c); r.on('end',()=>{
      const m = b.match(/Weryfikacja[^<]{0,120}/i) || b.match(/Certyfikat[^<]{0,120}/i) || b.match(/Wystawca[^<]{0,120}/i) || b.match(/błąd[^<]{0,120}/i) || b.match(/<title>[^<]+<\/title>/i);
      console.log('Body match:', m ? m[0] : b.substring(0,400));
      pool.end();
    });
  }).on('error', e => { console.error(e); pool.end(); });
})().catch(e=>{console.error(e);process.exit(1);});
