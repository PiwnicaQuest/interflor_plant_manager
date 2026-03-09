import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { InvoiceModel } from "../models/Invoice";
import { KsefApiClient, sendInvoiceToKsef } from "../services/ksefApiClient";
import { generateKsefXml } from "../services/ksefXmlGenerator";
import { query } from "../models/database";

export class KsefController {
  static async sendInvoice(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      const invoice = await InvoiceModel.getById(id);
      if (!invoice) return res.status(404).json({ error: "Faktura nie znaleziona" });

      const existing = await query(
        "SELECT ksef_status, ksef_reference_number FROM invoices WHERE id = $1", [id]
      );
      if (existing.rows[0]?.ksef_status === "accepted") {
        return res.status(400).json({
          error: "Faktura juz zostala wyslana do KSeF",
          ksefReferenceNumber: existing.rows[0].ksef_reference_number,
        });
      }

      await query("UPDATE invoices SET ksef_status = $1, ksef_error_message = NULL WHERE id = $2", ["sending", id]);

      const { xml } = await generateKsefXml(invoice);
      await query("UPDATE invoices SET ksef_xml = $1 WHERE id = $2", [xml, id]);

      const result = await sendInvoiceToKsef(xml);

      if (result.success) {
        await query(
          `UPDATE invoices SET ksef_status = $1, ksef_reference_number = $2,
           ksef_sent_at = CURRENT_TIMESTAMP, ksef_upo = $3, ksef_error_message = NULL WHERE id = $4`,
          ["accepted", result.ksefReferenceNumber || result.referenceNumber, null, id]
        );
        return res.json({
          success: true,
          message: "Faktura wyslana do KSeF",
          ksefReferenceNumber: result.ksefReferenceNumber || result.referenceNumber,
          
        });
      } else {
        await query(
          "UPDATE invoices SET ksef_status = $1, ksef_error_message = $2 WHERE id = $3",
          ["error", result.error, id]
        );
        return res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error("[KSeF] Send invoice error:", error);
      const id = parseInt(req.params.id);
      if (!isNaN(id)) {
        await query(
          "UPDATE invoices SET ksef_status = $1, ksef_error_message = $2 WHERE id = $3",
          ["error", error.message, id]
        ).catch(() => {});
      }
      return res.status(500).json({ error: "Blad wysylki do KSeF: " + error.message });
    }
  }

  static async getStatus(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      const result = await query(
        `SELECT ksef_status as "ksefStatus", ksef_reference_number as "ksefReferenceNumber",
                ksef_sent_at as "ksefSentAt", ksef_error_message as "ksefErrorMessage",
                ksef_upo as "ksefUpo"
         FROM invoices WHERE id = $1`, [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Faktura nie znaleziona" });

      const row = result.rows[0];
      return res.json({
        ksefStatus: row.ksefStatus,
        ksefReferenceNumber: row.ksefReferenceNumber,
        ksefSentAt: row.ksefSentAt,
        ksefErrorMessage: row.ksefErrorMessage,
        hasUpo: !!row.ksefUpo,
      });
    } catch (error: any) {
      console.error("[KSeF] Get status error:", error);
      return res.status(500).json({ error: "Blad sprawdzania statusu KSeF" });
    }
  }

  static async getXml(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      const existing = await query("SELECT ksef_xml FROM invoices WHERE id = $1", [id]);
      if (existing.rows[0]?.ksef_xml) {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        return res.send(existing.rows[0].ksef_xml);
      }

      const invoice = await InvoiceModel.getById(id);
      if (!invoice) return res.status(404).json({ error: "Faktura nie znaleziona" });

      const { xml } = await generateKsefXml(invoice);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      return res.send(xml);
    } catch (error: any) {
      console.error("[KSeF] Get XML error:", error);
      return res.status(500).json({ error: "Blad generowania XML KSeF" });
    }
  }

  static async retrySend(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      await query(
        "UPDATE invoices SET ksef_status = $1, ksef_error_message = NULL WHERE id = $2",
        ["not_sent", id]
      );
      return KsefController.sendInvoice(req, res);
    } catch (error: any) {
      console.error("[KSeF] Retry send error:", error);
      return res.status(500).json({ error: "Blad ponownej wysylki" });
    }
  }

  static async sendBulk(req: AuthRequest, res: Response) {
    try {
      const { invoiceIds } = req.body;
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res.status(400).json({ error: "Brak ID faktur" });
      }

      const results: Array<{ id: number; success: boolean; error?: string; ksefRef?: string }> = [];

      for (const invoiceId of invoiceIds) {
        try {
          const invoice = await InvoiceModel.getById(invoiceId);
          if (!invoice) {
            results.push({ id: invoiceId, success: false, error: "Nie znaleziono" });
            continue;
          }

          const existing = await query("SELECT ksef_status FROM invoices WHERE id = $1", [invoiceId]);
          if (existing.rows[0]?.ksef_status === "accepted") {
            results.push({ id: invoiceId, success: true, ksefRef: "juz wyslana" });
            continue;
          }

          await query("UPDATE invoices SET ksef_status = $1 WHERE id = $2", ["sending", invoiceId]);
          const { xml } = await generateKsefXml(invoice);
          await query("UPDATE invoices SET ksef_xml = $1 WHERE id = $2", [xml, invoiceId]);

          const result = await sendInvoiceToKsef(xml);
          if (result.success) {
            await query(
              `UPDATE invoices SET ksef_status = $1, ksef_reference_number = $2,
               ksef_sent_at = CURRENT_TIMESTAMP, ksef_upo = $3, ksef_error_message = NULL WHERE id = $4`,
              ["accepted", result.ksefReferenceNumber || result.referenceNumber, null, invoiceId]
            );
            results.push({ id: invoiceId, success: true, ksefRef: result.ksefReferenceNumber });
          } else {
            await query(
              "UPDATE invoices SET ksef_status = $1, ksef_error_message = $2 WHERE id = $3",
              ["error", result.error, invoiceId]
            );
            results.push({ id: invoiceId, success: false, error: result.error });
          }
        } catch (err: any) {
          await query(
            "UPDATE invoices SET ksef_status = $1, ksef_error_message = $2 WHERE id = $3",
            ["error", err.message, invoiceId]
          ).catch(() => {});
          results.push({ id: invoiceId, success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return res.json({ message: `Wyslano ${successCount}/${results.length} faktur`, results });
    } catch (error: any) {
      console.error("[KSeF] Bulk send error:", error);
      return res.status(500).json({ error: "Blad wysylki zbiorczej" });
    }
  }

  static async getSettings(_req: AuthRequest, res: Response) {
    try {
      const settings = await KsefApiClient.getSettings();
      return res.json({ ...settings, token: settings.token ? "********" : "" });
    } catch (error: any) {
      console.error("[KSeF] Get settings error:", error);
      return res.status(500).json({ error: "Blad pobierania ustawien KSeF" });
    }
  }

  static async updateSettings(req: AuthRequest, res: Response) {
    try {
      const { enabled, environment, token, autoSend, nip } = req.body;

      let finalToken = token;
      if (token === "********" || !token) {
        const current = await KsefApiClient.getSettings();
        finalToken = current.token;
      }

      const validEnvironments = ["test", "demo", "production"];
      if (environment && !validEnvironments.includes(environment)) {
        return res.status(400).json({ error: "Nieprawidlowe srodowisko. Dozwolone: test, demo, production" });
      }

      await KsefApiClient.saveSettings({
        enabled: enabled !== undefined ? enabled : undefined,
        environment: environment || undefined,
        token: finalToken !== undefined ? finalToken : undefined,
        autoSend: autoSend !== undefined ? autoSend : undefined,
        nip: nip || undefined,
      });

      const updated = await KsefApiClient.getSettings();
      return res.json({
        message: "Ustawienia KSeF zaktualizowane",
        settings: { ...updated, token: updated.token ? "********" : "" },
      });
    } catch (error: any) {
      console.error("[KSeF] Update settings error:", error);
      return res.status(500).json({ error: "Blad aktualizacji ustawien KSeF" });
    }
  }

  static async testConnection(_req: AuthRequest, res: Response) {
    try {
      const settings = await KsefApiClient.getSettings();
      const client = new KsefApiClient(settings.environment);
      const result = await client.testConnection();
      return res.json(result);
    } catch (error: any) {
      console.error("[KSeF] Test connection error:", error);
      return res.json({ success: false, message: "Blad polaczenia: " + error.message, environment: "unknown" });
    }
  }

  static async getUpo(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      const result = await query("SELECT ksef_upo FROM invoices WHERE id = $1", [id]);
      if (!result.rows[0]?.ksef_upo) {
        return res.status(404).json({ error: "Brak UPO dla tej faktury" });
      }

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      return res.send(result.rows[0].ksef_upo);
    } catch (error: any) {
      console.error("[KSeF] Get UPO error:", error);
      return res.status(500).json({ error: "Blad pobierania UPO" });
    }
  }
}
