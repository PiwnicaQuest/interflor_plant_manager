import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ReceiptModel } from '../models/Receipt';
import { generateReceiptHtml } from '../utils/receiptHtmlGenerator';

export class ReceiptController {
  /**
   * GET /receipts - Get all receipts with optional date filtering
   */
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;

      const filters: { startDate?: Date; endDate?: Date } = {};

      if (startDate && typeof startDate === 'string') {
        filters.startDate = new Date(startDate);
      }

      if (endDate && typeof endDate === 'string') {
        filters.endDate = new Date(endDate);
      }

      const receipts = await ReceiptModel.getAll(filters);

      return res.json({ receipts });
    } catch (error) {
      console.error('Error fetching receipts:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania paragonów' });
    }
  }

  /**
   * GET /receipts/:id - Get receipt by ID with items
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const receiptId = parseInt(id, 10);

      if (isNaN(receiptId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID paragonu' });
      }

      const receipt = await ReceiptModel.getById(receiptId);

      if (!receipt) {
        return res.status(404).json({ error: 'Paragon nie znaleziony' });
      }

      return res.json({ receipt });
    } catch (error) {
      console.error('Error fetching receipt:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania paragonu' });
    }
  }

  /**
   * GET /receipts/number/:receiptNumber - Get receipt by receipt number
   */
  static async getByReceiptNumber(req: AuthRequest, res: Response) {
    try {
      const { receiptNumber } = req.params;

      const receipt = await ReceiptModel.getByReceiptNumber(receiptNumber);

      if (!receipt) {
        return res.status(404).json({ error: 'Paragon nie znaleziony' });
      }

      return res.json({ receipt });
    } catch (error) {
      console.error('Error fetching receipt by number:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas pobierania paragonu' });
    }
  }

  /**
   * PUT /receipts/:id - Update receipt
   */
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const receiptId = parseInt(id, 10);

      if (isNaN(receiptId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID paragonu' });
      }

      const existingReceipt = await ReceiptModel.getById(receiptId);
      if (!existingReceipt) {
        return res.status(404).json({ error: 'Paragon nie znaleziony' });
      }

      const { paymentMethod, totalAmount, notes, paymentSplits } = req.body;

      const updatedReceipt = await ReceiptModel.update(receiptId, {
        paymentMethod,
        totalAmount,
        notes,
        paymentSplits,
      });

      return res.json({ message: 'Paragon zaktualizowany', receipt: updatedReceipt });
    } catch (error) {
      console.error('Error updating receipt:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas aktualizacji paragonu' });
    }
  }

  /**
   * DELETE /receipts/:id - Delete receipt
   */
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const receiptId = parseInt(id, 10);

      if (isNaN(receiptId)) {
        return res.status(400).json({ error: 'Nieprawidłowe ID paragonu' });
      }

      const receipt = await ReceiptModel.getById(receiptId);
      if (!receipt) {
        return res.status(404).json({ error: 'Paragon nie znaleziony' });
      }

      const deleted = await ReceiptModel.delete(receiptId);

      if (!deleted) {
        return res.status(500).json({ error: 'Nie udało się usunąć paragonu' });
      }

      return res.json({ message: 'Paragon usunięty pomyślnie' });
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return res.status(500).json({ error: 'Błąd serwera podczas usuwania paragonu' });
    }
  }

  /**
   * GET /receipts/:id/html - Get receipt as printable HTML
   */
  static async getHTML(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "Nieprawidlowe ID paragonu" });
        return;
      }
      const receipt = await ReceiptModel.getById(id);
      if (!receipt) {
        res.status(404).json({ error: "Paragon nie znaleziony" });
        return;
      }
      const html = await generateReceiptHtml(receipt);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("Get HTML error:", error);
      res.status(500).json({ error: "Blad serwera podczas generowania HTML" });
    }
  }
}
