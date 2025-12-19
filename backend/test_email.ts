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
  console.log('Connecting to IMAP...');
  const imap = new Imap(imapConfig);
  
  return new Promise<void>((resolve, reject) => {
    imap.once('ready', () => {
      console.log('IMAP ready');
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('Error opening inbox:', err);
          imap.end();
          return reject(err);
        }
        
        console.log('Inbox opened, searching UNSEEN...');
        imap.search(['UNSEEN'], async (searchErr, results) => {
          if (searchErr) {
            console.error('Search error:', searchErr);
            imap.end();
            return reject(searchErr);
          }
          
          console.log('Found messages:', results?.length || 0);
          
          if (!results || results.length === 0) {
            console.log('No unread emails');
            imap.end();
            return resolve();
          }
          
          const fetch = imap.fetch(results, { bodies: '', markSeen: false }); // Don't mark as seen for testing
          const emailPromises: Promise<void>[] = [];
          
          fetch.on('message', (msg) => {
            const emailPromise = new Promise<void>((resolveEmail) => {
              msg.on('body', async (stream) => {
                try {
                  console.log('Parsing email...');
                  const parsed = await simpleParser(stream);
                  console.log('Email subject:', parsed.subject);
                  console.log('From:', parsed.from?.text);
                  console.log('Attachments:', parsed.attachments?.length || 0);
                  
                  if (parsed.attachments && parsed.attachments.length > 0) {
                    for (const att of parsed.attachments) {
                      console.log('  Attachment:', att.filename, 'Size:', att.size);
                      
                      if (att.filename?.toLowerCase().endsWith('.xls') || att.filename?.toLowerCase().endsWith('.xlsx')) {
                        console.log('  Processing Excel file...');
                        const workbook = XLSX.read(att.content, { type: 'buffer' });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });
                        console.log('  Rows:', data.length);
                        if (data.length > 0) {
                          console.log('  Sample row keys:', Object.keys(data[0] as object).join(', '));
                          console.log('  First row data:', JSON.stringify(data[0]).substring(0, 500));
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error parsing email:', error);
                }
                resolveEmail();
              });
            });
            emailPromises.push(emailPromise);
          });
          
          fetch.once('error', (fetchErr) => {
            console.error('Fetch error:', fetchErr);
          });
          
          fetch.once('end', async () => {
            console.log('Waiting for email processing to complete...');
            await Promise.all(emailPromises);
            console.log('All emails processed');
            imap.end();
            resolve();
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      console.error('IMAP error:', err);
      reject(err);
    });
    
    imap.once('end', () => {
      console.log('IMAP connection closed');
    });
    
    imap.connect();
  });
}

main().catch(console.error);
