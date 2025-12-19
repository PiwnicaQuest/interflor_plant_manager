import { simpleParser } from 'mailparser';
import * as XLSX from 'xlsx';
import Imap from 'imap';

const imapConfig = {
  user: 'ekt@polflor.wroclaw.pl',
  password: 'EKTpolflor12',
  host: 'imap.dpoczta.pl',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: true },
};

async function main() {
  const imap = new Imap(imapConfig);

  return new Promise<void>((resolve, reject) => {
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        imap.search(['UNSEEN'], async (searchErr, results) => {
          if (searchErr || !results?.length) { imap.end(); return resolve(); }

          const fetch = imap.fetch(results.slice(0, 1), { bodies: '', markSeen: false });

          fetch.on('message', (msg) => {
            msg.on('body', async (stream) => {
              const parsed = await simpleParser(stream);
              console.log('Email:', parsed.subject);

              for (const att of parsed.attachments || []) {
                if (!att.filename?.toLowerCase().endsWith('.xls')) continue;

                console.log('\n=== Plik:', att.filename, '===\n');
                const workbook = XLSX.read(att.content, { type: 'buffer' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(worksheet, { raw: true });

                console.log('Kolumny:', Object.keys(data[0] as object).join(', '));
                console.log('\n--- Pierwszy wiersz (pelne dane) ---');
                console.log(JSON.stringify(data[0], null, 2));

                console.log('\n--- Kluczowe wartosci dla pierwszych 3 wierszy ---');
                for (let i = 0; i < Math.min(3, data.length); i++) {
                  const row = data[i] as any;
                  console.log('\nWiersz ' + (i + 2) + ':');
                  console.log('  Item (pelne):', row['Item']);
                  console.log('  Barcode:', row['Barcode'], '(typ:', typeof row['Barcode'], ')');
                  console.log('  Barcode_1:', row['Barcode_1'], '(typ:', typeof row['Barcode_1'], ')');
                  console.log('  AVE (palety):', row['AVE']);
                  console.log('  APE (szt/paleta):', row['APE']);
                  console.log('  Content per unit (lacznie szt):', row['Content per unit']);
                  console.log('  Price:', row['Price']);
                  console.log('  Box:', row['Box']);
                }
              }
            });
          });

          fetch.once('end', () => { imap.end(); resolve(); });
        });
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
}

main().catch(console.error);
