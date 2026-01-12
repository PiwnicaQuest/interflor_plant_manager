import puppeteer from 'puppeteer';
import { InvoiceCorrectionWithItems } from '../types';
import { generateCorrectionHTML } from './correctionHtmlGenerator';

export async function generateCorrectionPDFPuppeteer(correction: InvoiceCorrectionWithItems): Promise<Buffer> {
  const html = await generateCorrectionHTML(correction);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
