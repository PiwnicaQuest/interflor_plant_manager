const Imap = require('imap');

const imap = new Imap({
  user: 'ekt@polflor.wroclaw.pl',
  password: 'EKTpolflor12',
  host: 'imap.dpoczta.pl',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  console.log('Connected to IMAP');
  
  imap.openBox('INBOX', false, (err, box) => {
    if (err) {
      console.error('Error opening inbox:', err);
      imap.end();
      return;
    }
    
    console.log('Total messages:', box.messages.total);
    
    // Search for ALL messages (seen and unseen)
    imap.search(['ALL'], (searchErr, results) => {
      if (searchErr) {
        console.error('Search error:', searchErr);
        imap.end();
        return;
      }
      
      console.log('Found', results.length, 'messages');
      
      if (results.length === 0) {
        console.log('No messages found');
        imap.end();
        return;
      }
      
      // Get last 5 messages
      const lastMessages = results.slice(-5);
      console.log('Checking last 5 messages:', lastMessages);
      
      const fetch = imap.fetch(lastMessages, { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)', struct: true });
      
      fetch.on('message', (msg, seqno) => {
        console.log('\n--- Message #' + seqno + ' ---');
        msg.on('body', (stream) => {
          let buffer = '';
          stream.on('data', (chunk) => { buffer += chunk.toString(); });
          stream.on('end', () => {
            console.log(buffer.trim());
          });
        });
        msg.once('attributes', (attrs) => {
          console.log('Flags:', attrs.flags);
          console.log('UID:', attrs.uid);
        });
      });
      
      fetch.once('end', () => {
        console.log('\nDone listing messages');
        
        // Mark ALL last 5 messages as unseen
        console.log('\nMarking messages as UNSEEN...');
        imap.delFlags(lastMessages, ['\\Seen'], (flagErr) => {
          if (flagErr) {
            console.error('Error removing Seen flag:', flagErr);
          } else {
            console.log('Successfully marked messages as UNSEEN');
          }
          imap.end();
        });
      });
    });
  });
});

imap.once('error', (err) => {
  console.error('IMAP error:', err);
});

imap.once('end', () => {
  console.log('IMAP connection ended');
});

imap.connect();
