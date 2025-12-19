import { EmailImportService } from './src/services/emailImportService';

async function main() {
  console.log('Triggering manual email import...');
  const service = new EmailImportService();
  await service.checkAndImportEmails();
  console.log('Done!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
