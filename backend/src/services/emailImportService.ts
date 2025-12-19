// @ts-ignore - imap has no types
import Imap from 'imap';
// @ts-ignore - mailparser has no types
import { simpleParser, ParsedMail } from 'mailparser';
import * as XLSX from 'xlsx';
import { ProductModel } from '../models/Product';
import { SettingsModel } from '../models/Settings';
import { GrowerPassportModel } from '../models/GrowerPassport';
import { MovementType } from '../types';
import { query } from '../models/database';
import { EdiParser, EdiProduct } from './ediParser';

interface EmailConfig {
  authTimeout?: number;
  connTimeout?: number;
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  tlsOptions?: { rejectUnauthorized: boolean };
}

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ row: number; error: string; data?: unknown }>;
}

// Wynik synchronizacji maili
export interface SyncResult {
  emailsFound: number;
  emailsProcessed: number;
  productsImported: number;
  productsUpdated: number;
  productsFailed: number;
  errors: string[];
}


// Format EKT (angielski/holenderski)
interface EktRow {
  'Item'?: string;
  'Barcode'?: string;
  'Barcode_1'?: string;
  'AVE'?: number | string;
  'APE'?: number | string;
  'Content per unit'?: string;
  'Price'?: string;
  'Grower'?: string;
  'Photo'?: string;
  'VBN-code'?: string;
  'Unique number'?: number | string;
  'Box'?: string;
  'Identifier code '?: string;
  [key: string]: string | number | undefined;
}

// Format Polski
interface PolishRow {
  'Barcode'?: string;
  'Nazwa rośliny'?: string;
  'Wielkość doniczki'?: string;
  'Wysokość cm'?: string;
  'Paszport roślinny'?: string;
  'Liczba palet'?: string;
  'Sztuk na palecie'?: string;
  'Cena zakupu PLN'?: string;
  'Cena+'?: string;
  'Widoczny w sklepie'?: string;
  'URL zdjęcia'?: string;
  'Data dostawy'?: string;
  'Stawka VAT'?: string;
  [key: string]: string | undefined;
}

export class EmailImportService {
  // Cache for floricode map
  private floricodeMap: Map<string, { growerName: string; passportNumber: string }> | null = null;

  private async getEmailConfig(): Promise<EmailConfig | null> {
    const settings = await SettingsModel.getEmailImportSettings();
    if (!settings.enabled || !settings.emailAddress || !settings.emailPassword) {
      return null;
    }
    return {
      user: settings.emailAddress,
      password: settings.emailPassword,
      host: settings.imapServer,
      port: settings.imapPort,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
      connTimeout: 30000,
    };
  }

  private async getEurToPlnRate(): Promise<number> {
    try {
      const result = await query<{ setting_value: string }>(
        "SELECT setting_value FROM settings WHERE setting_key = 'eur_to_pln_rate'"
      );
      if (result.rows[0]) {
        return parseFloat(result.rows[0].setting_value) || 4.3;
      }
    } catch (error) {
      console.error('[EMAIL IMPORT] Error getting EUR rate:', error);
    }
    return 4.3;
  }

  private async getCostAndMarginSettings(): Promise<{ costPercentage: number; marginPercentage: number }> {
    try {
      const result = await query<{ setting_key: string; setting_value: string }>(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('cost_percentage', 'margin_percentage')"
      );
      let costPercentage = 35;
      let marginPercentage = 65;
      for (const row of result.rows) {
        if (row.setting_key === 'cost_percentage') {
          costPercentage = parseFloat(row.setting_value) || 35;
        } else if (row.setting_key === 'margin_percentage') {
          marginPercentage = parseFloat(row.setting_value) || 65;
        }
      }
      return { costPercentage, marginPercentage };
    } catch (error) {
      console.error('[EMAIL IMPORT] Error getting cost/margin settings:', error);
      return { costPercentage: 35, marginPercentage: 65 };
    }
  }

  // Load floricode map for grower lookup
  private async loadFloricodeMap(): Promise<void> {
    try {
      this.floricodeMap = await GrowerPassportModel.getFloricodeMap();
      console.log(`[EMAIL IMPORT] Loaded ${this.floricodeMap.size} floricode mappings`);
    } catch (error) {
      console.error('[EMAIL IMPORT] Error loading floricode map:', error);
      this.floricodeMap = new Map();
    }
  }

  // Get grower name from floricode
  private getGrowerNameFromFloricode(floricode: string | undefined): string | undefined {
    if (!floricode || !this.floricodeMap) return floricode;

    const growerInfo = this.floricodeMap.get(floricode);
    if (growerInfo) {
      console.log(`[EMAIL IMPORT] Mapped floricode ${floricode} -> ${growerInfo.growerName}`);
      return growerInfo.growerName;
    }

    // Return floricode as fallback if not found in map
    return floricode;
  }

  async checkAndImportEmails(): Promise<void> {
    const imapConfig = await this.getEmailConfig();
    if (!imapConfig) {
      console.log('[EMAIL IMPORT] Email import not configured or disabled. Skipping...');
      return;
    }

    // Load floricode map before processing
    await this.loadFloricodeMap();

    console.log('[EMAIL IMPORT] Starting email check for ' + imapConfig.user + '...');
    const imap = new Imap(imapConfig);

    return new Promise((resolve, reject) => {
      imap.once('ready', async () => {
        try {
          imap.openBox('INBOX', false, async (err: Error | null, _box: unknown) => {
            if (err) {
              console.error('[EMAIL IMPORT] Error opening inbox:', err);
              imap.end();
              return reject(err);
            }
            imap.search(['UNSEEN'], async (searchErr: Error | null, results: number[]) => {
              if (searchErr) {
                console.error('[EMAIL IMPORT] Error searching emails:', searchErr);
                imap.end();
                return reject(searchErr);
              }
              if (!results || results.length === 0) {
                console.log('[EMAIL IMPORT] No new emails found');
                imap.end();
                return resolve();
              }
              console.log('[EMAIL IMPORT] Found ' + results.length + ' unread email(s)');
              const fetch = imap.fetch(results, { bodies: '', markSeen: true });
              const emailPromises: Promise<void>[] = [];
              fetch.on('message', (msg: unknown) => {
                const emailPromise = new Promise<void>((resolveEmail) => {
                  (msg as any).on('body', async (stream: NodeJS.ReadableStream) => {
                    try {
                      const parsed = await simpleParser(stream);
                      await this.processEmail(parsed);
                    } catch (error) {
                      console.error('[EMAIL IMPORT] Error processing email:', error);
                    }
                    resolveEmail();
                  });
                });
                emailPromises.push(emailPromise);
              });
              fetch.once('error', (fetchErr: Error) => {
                console.error('[EMAIL IMPORT] Fetch error:', fetchErr);
              });
              fetch.once('end', async () => {
                await Promise.all(emailPromises);
                console.log('[EMAIL IMPORT] Finished processing all emails');
                imap.end();
                resolve();
              });
            });
          });
        } catch (error) {
          console.error('[EMAIL IMPORT] Error in IMAP ready handler:', error);
          imap.end();
          reject(error);
        }
      });
      imap.once('error', (err: Error) => {
        console.error('[EMAIL IMPORT] IMAP connection error:', err);
        reject(err);
      });
      imap.once('end', () => {
        console.log('[EMAIL IMPORT] IMAP connection ended');
      });
      imap.connect();
    });
  }

  // Metoda do manualnej synchronizacji z zwracaniem wynikow
  async syncEmails(): Promise<SyncResult> {
    const result: SyncResult = {
      emailsFound: 0,
      emailsProcessed: 0,
      productsImported: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: []
    };

    const imapConfig = await this.getEmailConfig();
    if (!imapConfig) {
      result.errors.push("Email import not configured or disabled");
      return result;
    }

    await this.loadFloricodeMap();
    console.log("[EMAIL SYNC] Manual sync started for " + imapConfig.user + "...");

    const imap = new Imap(imapConfig);

    return new Promise((resolve) => {
      imap.once("ready", async () => {
        try {
          imap.openBox("INBOX", false, async (err: Error | null, _box: unknown) => {
            if (err) {
              console.error("[EMAIL SYNC] Error opening inbox:", err);
              result.errors.push("Error opening inbox: " + err.message);
              imap.end();
              return resolve(result);
            }

            imap.search(["UNSEEN"], async (searchErr: Error | null, results: number[]) => {
              if (searchErr) {
                console.error("[EMAIL SYNC] Error searching emails:", searchErr);
                result.errors.push("Error searching emails: " + searchErr.message);
                imap.end();
                return resolve(result);
              }

              if (!results || results.length === 0) {
                console.log("[EMAIL SYNC] No new emails found");
                imap.end();
                return resolve(result);
              }

              result.emailsFound = results.length;
              console.log("[EMAIL SYNC] Found " + results.length + " unread email(s)");

              const fetch = imap.fetch(results, { bodies: "", markSeen: true });
              const emailPromises: Promise<{imported: number, failed: number}>[] = [];

              fetch.on("message", (msg: unknown) => {
                const emailPromise = new Promise<{imported: number, failed: number}>((resolveEmail) => {
                  (msg as any).on("body", async (stream: NodeJS.ReadableStream) => {
                    try {
                      const parsed = await simpleParser(stream);
                      const stats = await this.processEmailWithStats(parsed);
                      result.emailsProcessed++;
                      resolveEmail(stats);
                    } catch (error: any) {
                      console.error("[EMAIL SYNC] Error processing email:", error);
                      result.errors.push("Email processing error: " + error.message);
                      resolveEmail({imported: 0, failed: 0});
                    }
                  });
                });
                emailPromises.push(emailPromise);
              });

              fetch.once("error", (fetchErr: Error) => {
                console.error("[EMAIL SYNC] Fetch error:", fetchErr);
                result.errors.push("Fetch error: " + fetchErr.message);
              });

              fetch.once("end", async () => {
                const emailResults = await Promise.all(emailPromises);
                for (const r of emailResults) {
                  result.productsImported += r.imported;
                  result.productsFailed += r.failed;
                }
                console.log("[EMAIL SYNC] Finished. Imported: " + result.productsImported + ", Failed: " + result.productsFailed);
                imap.end();
                resolve(result);
              });
            });
          });
        } catch (error: any) {
          console.error("[EMAIL SYNC] Error in IMAP handler:", error);
          result.errors.push("IMAP error: " + error.message);
          imap.end();
          resolve(result);
        }
      });

      imap.once("error", (err: Error) => {
        console.error("[EMAIL SYNC] IMAP connection error:", err);
        result.errors.push("IMAP connection error: " + err.message);
        resolve(result);
      });

      imap.connect();
    });
  }

  private async processEmail(mail: ParsedMail): Promise<void> {
    console.log('[EMAIL IMPORT] Processing email: ' + mail.subject);
    console.log('[EMAIL IMPORT] From: ' + (mail.from?.text || 'unknown'));
    const attachmentCount = mail.attachments ? mail.attachments.length : 0;
    console.log('[EMAIL IMPORT] Attachments: ' + attachmentCount);

    if (!mail.attachments || mail.attachments.length === 0) {
      console.log('[EMAIL IMPORT] No attachments found in email');
      return;
    }

    // Szukaj załączników Excel LUB EDI
    const supportedAttachments = mail.attachments.filter((att: any) => {
      const filename = att.filename?.toLowerCase() || '';
      return filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.edi');
    });

    if (supportedAttachments.length === 0) {
      console.log('[EMAIL IMPORT] No supported attachments found (Excel or EDI)');
      return;
    }

    for (const attachment of supportedAttachments) {
      try {
        const filename = attachment.filename?.toLowerCase() || '';
        console.log('[EMAIL IMPORT] Processing attachment: ' + attachment.filename);

        let result: ImportResult;

        if (filename.endsWith('.edi')) {
          result = await this.importFromEdiBuffer(attachment.content);
        } else {
          result = await this.importFromExcelBuffer(attachment.content);
        }

        console.log('[EMAIL IMPORT] Import result for ' + attachment.filename + ':');
        console.log('  - Success: ' + result.success);
        console.log('  - Skipped (no barcode): ' + result.skipped);
        console.log('  - Failed: ' + result.failed);

        if (result.errors.length > 0) {
          console.log('  - Errors (first 5):');
          result.errors.slice(0, 5).forEach((err) => {
            console.log('    Row ' + err.row + ': ' + err.error);
          });
        }

        await this.saveImportLog({
          filename: attachment.filename || 'unknown',
          from: mail.from?.text || 'unknown',
          subject: mail.subject || 'no subject',
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (error: any) {
        console.error('[EMAIL IMPORT] Error importing ' + attachment.filename + ':', error.message);
      }
    }
  }

  // Wersja processEmail ktora zwraca statystyki dla syncEmails
  private async processEmailWithStats(mail: ParsedMail): Promise<{imported: number, failed: number}> {
    const stats = {imported: 0, failed: 0};

    console.log("[EMAIL SYNC] Processing email: " + mail.subject);
    console.log("[EMAIL SYNC] From: " + (mail.from?.text || "unknown"));

    if (!mail.attachments || mail.attachments.length === 0) {
      console.log("[EMAIL SYNC] No attachments found in email");
      return stats;
    }

    const supportedAttachments = mail.attachments.filter((att: any) => {
      const filename = att.filename?.toLowerCase() || "";
      return filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".edi");
    });

    if (supportedAttachments.length === 0) {
      console.log("[EMAIL SYNC] No supported attachments found");
      return stats;
    }

    for (const attachment of supportedAttachments) {
      try {
        const filename = attachment.filename?.toLowerCase() || "";
        console.log("[EMAIL SYNC] Processing: " + attachment.filename);

        let result: ImportResult;
        if (filename.endsWith(".edi")) {
          result = await this.importFromEdiBuffer(attachment.content);
        } else {
          result = await this.importFromExcelBuffer(attachment.content);
        }

        stats.imported += result.success;
        stats.failed += result.failed;

        console.log("[EMAIL SYNC] Result: imported=" + result.success + ", failed=" + result.failed);

        await this.saveImportLog({
          filename: attachment.filename || "unknown",
          from: mail.from?.text || "unknown",
          subject: mail.subject || "no subject",
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (error: any) {
        console.error("[EMAIL SYNC] Error importing " + attachment.filename + ":", error.message);
        stats.failed++;
      }
    }
    return stats;
  }

  private async importFromEdiBuffer(buffer: Buffer): Promise<ImportResult> {
    const result: ImportResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const content = buffer.toString('latin1');
      const parseResult = EdiParser.parse(content);

      if (!parseResult.success) {
        result.errors.push({ row: 0, error: 'Błąd parsowania pliku EDI: ' + parseResult.errors.join(', ') });
        return result;
      }

      console.log('[EMAIL IMPORT] EDI metadata:', parseResult.metadata);
      console.log('[EMAIL IMPORT] Found ' + parseResult.products.length + ' products in EDI file');

      const eurRate = await this.getEurToPlnRate();
      const { costPercentage, marginPercentage } = await this.getCostAndMarginSettings();

      console.log('[EMAIL IMPORT] Using EUR/PLN rate: ' + eurRate);
      console.log('[EMAIL IMPORT] Cost percentage: ' + costPercentage + '%, Margin: ' + marginPercentage + '%');

      for (let i = 0; i < parseResult.products.length; i++) {
        const ediProduct = parseResult.products[i];
        const rowNumber = i + 1;

        try {
          console.log("[EMAIL IMPORT] Using documentDate from EDI metadata:", parseResult.metadata.documentDate);
          const productData = this.convertEdiProductToDbFormat(ediProduct, eurRate, costPercentage, marginPercentage, parseResult.metadata.documentDate);

          if (!productData.barcode) {
            result.skipped++;
            continue;
          }

          if (!productData.plantName) {
            result.failed++;
            result.errors.push({ row: rowNumber, error: 'Brak nazwy rośliny', data: ediProduct });
            continue;
          }

          const existing = await ProductModel.getByBarcode(productData.barcode);

          if (existing) {
            const newPalletCount = (existing.palletCount || 0) + (productData.palletCount || 0);
            await ProductModel.update(existing.id, { palletCount: newPalletCount });
            const deltaUnits = (productData.palletCount || 0) * (existing.unitsPerPallet || productData.unitsPerPallet || 0);
            if (deltaUnits > 0) {
              await ProductModel.createMovement(existing.id, null, MovementType.PURCHASE, deltaUnits, productData.palletCount || 0, 'Import z email EDI - dodano do istniejącego');
            }
            console.log('[EMAIL IMPORT] Updated: ' + existing.plantName + ' (+' + productData.palletCount + ' palet, razem: ' + newPalletCount + ')');
          } else {
            const newProduct = await ProductModel.create(productData);
            const deltaUnits = (productData.palletCount || 0) * (productData.unitsPerPallet || 0);
            if (deltaUnits > 0) {
              await ProductModel.createMovement(newProduct.id, null, MovementType.PURCHASE, deltaUnits, productData.palletCount || 0, 'Import z email EDI');
            }
            console.log('[EMAIL IMPORT] Created: ' + productData.plantName + ' (' + productData.palletCount + ' palet)');
          }
          result.success++;
        } catch (error: any) {
          result.failed++;
          result.errors.push({ row: rowNumber, error: error.message, data: ediProduct });
        }
      }
    } catch (error: any) {
      result.errors.push({ row: 0, error: 'Błąd importu EDI: ' + error.message });
    }
    return result;
  }

  private convertEdiProductToDbFormat(ediProduct: EdiProduct, eurRate: number, costPercentage: number, marginPercentage: number, documentDate?: string): any {
    let purchasePricePln: number | undefined;
    console.log("[EMAIL IMPORT] convertEdiProductToDbFormat documentDate param:", documentDate);
    if (ediProduct.priceEur && ediProduct.priceEur > 0) {
      purchasePricePln = Math.round(ediProduct.priceEur * eurRate * 100) / 100;
    }

    let pricePlus: number | undefined;
    let basePriceGross: number | undefined;
    let priceDiscount10: number | undefined;
    let priceDiscount12: number | undefined;
    let priceDiscount15: number | undefined;
    let priceDiscount20: number | undefined;
    let priceDiscount25: number | undefined;

    if (purchasePricePln && purchasePricePln > 0) {
      const prices = SettingsModel.calculatePrices(purchasePricePln, costPercentage, marginPercentage);
      pricePlus = prices.pricePlus;
      basePriceGross = prices.basePriceGross;
      priceDiscount10 = prices.priceDiscount10;
      priceDiscount12 = prices.priceDiscount12;
      priceDiscount15 = prices.priceDiscount15;
      priceDiscount20 = prices.priceDiscount20;
      priceDiscount25 = prices.priceDiscount25;
    }

    // Map floricode to grower name using the cached map
    const growerName = this.getGrowerNameFromFloricode(ediProduct.growerCode);

    return {
      barcode: ediProduct.barcode,
      plantName: ediProduct.plantName,
      potSize: ediProduct.potSize,
      plantHeightCm: ediProduct.plantHeightCm,
      palletCount: ediProduct.palletCount || 0,
      unitsPerPallet: ediProduct.unitsPerPallet || 0,
      purchasePricePln: purchasePricePln,
      pricePlus: pricePlus,
      basePriceGross: basePriceGross,
      priceDiscount10: priceDiscount10,
      priceDiscount12: priceDiscount12,
      priceDiscount15: priceDiscount15,
      priceDiscount20: priceDiscount20,
      priceDiscount25: priceDiscount25,
      grower: growerName,
      imageUrl: ediProduct.imageUrl || undefined,
      visibleInShop: false,
      vatRate: 8.0,
      createdAt: documentDate ? new Date(documentDate) : undefined,
    };
  }

  private detectFormat(row: any): 'ekt' | 'polish' | 'unknown' {
    if (row['Item'] !== undefined && (row['APE'] !== undefined || row['VBN-code'] !== undefined)) {
      return 'ekt';
    }
    if (row['Nazwa rośliny'] !== undefined || row['Wielkość doniczki'] !== undefined) {
      return 'polish';
    }
    return 'unknown';
  }

  private async importFromExcelBuffer(buffer: Buffer): Promise<ImportResult> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: true });

    const result: ImportResult = { success: 0, failed: 0, skipped: 0, errors: [] };

    if (data.length === 0) {
      result.errors.push({ row: 0, error: 'Plik Excel jest pusty' });
      return result;
    }

    const format = this.detectFormat(data[0]);
    console.log('[EMAIL IMPORT] Detected format: ' + format);

    if (format === 'unknown') {
      result.failed = data.length;
      result.errors.push({ row: 0, error: 'Nieznany format pliku', data: Object.keys(data[0] as object) });
      return result;
    }

    const eurRate = format === 'ekt' ? await this.getEurToPlnRate() : 1;
    const { costPercentage, marginPercentage } = await this.getCostAndMarginSettings();

    for (let i = 0; i < data.length; i++) {
      const row: any = data[i];
      const rowNumber = i + 2;

      try {
        let productData: any;
        if (format === 'ekt') {
          productData = this.parseEktRow(row as EktRow, eurRate, costPercentage, marginPercentage);
        } else {
          productData = this.parsePolishRow(row as PolishRow, costPercentage, marginPercentage);
        }

        if (!productData.barcode) { result.skipped++; continue; }
        if (!productData.plantName) { result.failed++; result.errors.push({ row: rowNumber, error: 'Brak nazwy rośliny', data: row }); continue; }

        const existing = await ProductModel.getByBarcode(productData.barcode);

        if (existing) {
          const newPalletCount = (existing.palletCount || 0) + (productData.palletCount || 0);
          await ProductModel.update(existing.id, { palletCount: newPalletCount });
          const deltaUnits = (productData.palletCount || 0) * (existing.unitsPerPallet || productData.unitsPerPallet || 0);
          if (deltaUnits > 0) {
            await ProductModel.createMovement(existing.id, null, MovementType.PURCHASE, deltaUnits, productData.palletCount || 0, 'Import z email - dodano do istniejącego');
          }
        } else {
          const newProduct = await ProductModel.create(productData);
          const deltaUnits = (productData.palletCount || 0) * (productData.unitsPerPallet || 0);
          if (deltaUnits > 0) {
            await ProductModel.createMovement(newProduct.id, null, MovementType.PURCHASE, deltaUnits, productData.palletCount || 0, 'Import z email');
          }
        }
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({ row: rowNumber, error: error.message, data: row });
      }
    }
    return result;
  }

  private parseEktRow(row: EktRow, eurRate: number, costPercentage: number, marginPercentage: number): any {
    let barcode = row['Barcode_1']?.toString().trim();
    if (!barcode) {
      const rawBarcode = row['Barcode']?.toString().trim();
      if (rawBarcode && rawBarcode !== '0000000000000' && rawBarcode !== '0') {
        barcode = rawBarcode;
      }
    }
    const plantName = row['Item']?.toString().trim() || '';
    let palletCount = 0;
    if (row['AVE'] !== undefined) {
      palletCount = typeof row['AVE'] === 'number' ? row['AVE'] : parseInt(row['AVE'].toString()) || 0;
    }
    let unitsPerPallet = 0;
    if (row['APE'] !== undefined) {
      unitsPerPallet = typeof row['APE'] === 'number' ? row['APE'] : parseInt(row['APE'].toString()) || 0;
    }
    let purchasePricePln: number | undefined;
    if (row['Price']) {
      const priceEur = parseFloat(row['Price'].toString().replace(',', '.'));
      if (!isNaN(priceEur)) {
        purchasePricePln = Math.round(priceEur * eurRate * 100) / 100;
      }
    }

    let pricePlus, basePriceGross, priceDiscount10, priceDiscount12, priceDiscount15, priceDiscount20, priceDiscount25;
    if (purchasePricePln && purchasePricePln > 0) {
      const prices = SettingsModel.calculatePrices(purchasePricePln, costPercentage, marginPercentage);
      pricePlus = prices.pricePlus;
      basePriceGross = prices.basePriceGross;
      priceDiscount10 = prices.priceDiscount10;
      priceDiscount12 = prices.priceDiscount12;
      priceDiscount15 = prices.priceDiscount15;
      priceDiscount20 = prices.priceDiscount20;
      priceDiscount25 = prices.priceDiscount25;
    }

    let potSize: string | undefined;
    let plantHeightCm: number | undefined;
    const identifierCode = row['Identifier code ']?.toString().trim() || row['Identifier code']?.toString().trim();
    if (identifierCode) {
      const parts = identifierCode.split('.');
      if (parts.length >= 2) {
        const potSizeNum = parseInt(parts[0]);
        const heightNum = parseInt(parts[1]);
        if (!isNaN(potSizeNum) && potSizeNum > 0) potSize = potSizeNum + 'Ø';
        if (!isNaN(heightNum) && heightNum > 0) plantHeightCm = heightNum;
      }
    }

    return {
      barcode, plantName, potSize, plantHeightCm, palletCount, unitsPerPallet, purchasePricePln,
      pricePlus, basePriceGross, priceDiscount10, priceDiscount12, priceDiscount15, priceDiscount20, priceDiscount25,
      grower: row['Grower']?.toString().trim() || undefined,
      imageUrl: row['Photo']?.toString().trim() || undefined,
      visibleInShop: false, vatRate: 8.0,
    };
  }

  private parsePolishRow(row: PolishRow, costPercentage: number, marginPercentage: number): any {
    const purchasePricePln = row['Cena zakupu PLN'] ? parseFloat(row['Cena zakupu PLN'].toString()) : undefined;
    let pricePlus, basePriceGross, priceDiscount10, priceDiscount12, priceDiscount15, priceDiscount20, priceDiscount25;
    if (purchasePricePln && purchasePricePln > 0) {
      const prices = SettingsModel.calculatePrices(purchasePricePln, costPercentage, marginPercentage);
      pricePlus = prices.pricePlus;
      basePriceGross = prices.basePriceGross;
      priceDiscount10 = prices.priceDiscount10;
      priceDiscount12 = prices.priceDiscount12;
      priceDiscount15 = prices.priceDiscount15;
      priceDiscount20 = prices.priceDiscount20;
      priceDiscount25 = prices.priceDiscount25;
    }

    return {
      barcode: row['Barcode']?.toString().trim(),
      plantName: row['Nazwa rośliny']?.toString().trim(),
      potSize: row['Wielkość doniczki']?.toString().trim() || undefined,
      plantHeightCm: row['Wysokość cm'] ? parseFloat(row['Wysokość cm'].toString()) : undefined,
      plantPassport: row['Paszport roślinny']?.toString().trim() || undefined,
      palletCount: row['Liczba palet'] ? parseInt(row['Liczba palet'].toString()) : 0,
      unitsPerPallet: row['Sztuk na palecie'] ? parseInt(row['Sztuk na palecie'].toString()) : 0,
      purchasePricePln, pricePlus, basePriceGross, priceDiscount10, priceDiscount12, priceDiscount15, priceDiscount20, priceDiscount25,
      visibleInShop: row['Widoczny w sklepie']?.toString().toLowerCase() === 'tak' || false,
      imageUrl: row['URL zdjęcia']?.toString().trim() || undefined,
      deliveryDate: row['Data dostawy'] ? new Date(this.parseDate(row['Data dostawy'].toString()) || '') : undefined,
      vatRate: row['Stawka VAT'] ? parseFloat(row['Stawka VAT'].toString()) : 23.0,
    };
  }

  private parseDate(dateStr: string): string | undefined {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      return undefined;
    } catch { return undefined; }
  }

  private async saveImportLog(logData: { filename: string; from: string; subject: string; success: number; failed: number; skipped: number; errors: unknown[] }): Promise<void> {
    try {
      await query(
        'INSERT INTO email_import_logs (filename, email_from, email_subject, success_count, failed_count, errors, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [logData.filename, logData.from, logData.subject, logData.success, logData.failed + logData.skipped, JSON.stringify({ errors: logData.errors, skipped: logData.skipped })]
      );
    } catch (error) {
      console.error('[EMAIL IMPORT] Error saving import log:', error);
    }
  }
}
