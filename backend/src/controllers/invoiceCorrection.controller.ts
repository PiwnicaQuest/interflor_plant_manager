import { Router, Request, Response } from 'express';
import { InvoiceCorrectionModel } from '../models/InvoiceCorrection';
import { requireAuth, requireRole } from '../middleware/auth';
import { generateCorrectionPDFPuppeteer } from '../utils/correctionPdfPuppeteer';
import { generateCorrectionHTML } from '../utils/correctionHtmlGenerator';
import { UserRole } from '../types';

const router = Router();

// Get all corrections
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, originalInvoiceId } = req.query;

    const corrections = await InvoiceCorrectionModel.getAll({
      startDate: startDate as string,
      endDate: endDate as string,
      originalInvoiceId: originalInvoiceId ? parseInt(originalInvoiceId as string) : undefined
    });

    res.json(corrections);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching corrections:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get statistics - must be before /:id
router.get('/stats/summary', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await InvoiceCorrectionModel.getStats();
    res.json(stats);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get corrections for a specific invoice
router.get('/invoice/:invoiceId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const corrections = await InvoiceCorrectionModel.getByInvoiceId(invoiceId);
    res.json(corrections);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching corrections for invoice:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get correction by ID
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const correction = await InvoiceCorrectionModel.getById(id);

    if (!correction) {
      res.status(404).json({ error: 'Correction not found' });
      return;
    }

    res.json(correction);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching correction:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new correction
router.post('/', requireAuth, requireRole([UserRole.ADMIN, UserRole.POS]), async (req: Request, res: Response): Promise<void> => {
  try {
    const { originalInvoiceId, correctionReason, items } = req.body;
    const userId = (req as { user?: { id?: number } }).user?.id;

    if (!originalInvoiceId || !correctionReason || !items || items.length === 0) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = await InvoiceCorrectionModel.create({
      originalInvoiceId,
      correctionReason,
      items,
      createdByUserId: userId
    });

    res.status(201).json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error creating correction:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate PDF
router.get('/:id/pdf', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const correction = await InvoiceCorrectionModel.getById(id);

    if (!correction) {
      res.status(404).json({ error: 'Correction not found' });
      return;
    }

    const pdfBuffer = await generateCorrectionPDFPuppeteer(correction);
    const filename = 'Korekta_' + correction.correctionNumber.replace(/\//g, '-') + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.send(pdfBuffer);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get HTML for printing
router.get('/:id/html', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const correction = await InvoiceCorrectionModel.getById(id);

    if (!correction) {
      res.status(404).json({ error: 'Correction not found' });
      return;
    }

    const html = await generateCorrectionHTML(correction);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error generating HTML:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete correction
router.delete('/:id', requireAuth, requireRole([UserRole.ADMIN]), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await InvoiceCorrectionModel.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Correction not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error deleting correction:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
