import cron from 'node-cron';
import { EmailImportService } from './emailImportService';

export class CronService {
  private emailImportService: EmailImportService;

  constructor() {
    this.emailImportService = new EmailImportService();
  }

  /**
   * Uruchamia wszystkie zaplanowane zadania
   */
  start(): void {
    // Sprawdzaj nowe maile co 10 minut
    cron.schedule('*/10 * * * *', async () => {
      console.log('[CRON] Running email import check...');
      try {
        await this.emailImportService.checkAndImportEmails();
      } catch (error) {
        console.error('[CRON] Email import error:', error);
      }
    });

    console.log('[CRON] Cron jobs started:');
    console.log('  - Email import: Every 10 minutes');
  }
}
