import { SettingsModel } from "../models/Settings";
import crypto from "crypto";
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

  static async sendCorrection(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID korekty" });

      // Get correction with items
      const corrResult = await query(
        `SELECT ic.*, ic.buyer_snapshot as "buyerSnapshot"
         FROM invoice_corrections ic WHERE ic.id = $1`, [id]
      );
      if (corrResult.rows.length === 0) return res.status(404).json({ error: "Korekta nie znaleziona" });
      const corr = corrResult.rows[0];

      if (corr.ksefStatus === "accepted") {
        return res.status(400).json({ error: "Korekta juz wyslana do KSeF", ksefReferenceNumber: corr.ksefReferenceNumber });
      }

      // Get correction items
      const itemsResult = await query(
        `SELECT * FROM invoice_correction_items WHERE correction_id = $1 ORDER BY id`, [id]
      );

      // Transform to InvoiceWithItems format for XML generator
      const invoiceLike = {
        invoiceNumber: corr.correctionNumber,
        correctionNumber: corr.correctionNumber, // triggers KOR type
        issueDate: corr.issueDate,
        saleDate: corr.originalInvoiceDate || corr.issueDate,
        buyerSnapshot: corr.buyerSnapshot || {},
        transactionType: "domestic", // TODO: detect from original invoice
        subtotalNet: corr.correctedSubtotalNet,
        totalVat: corr.correctedTotalVat,
        totalGross: corr.correctedTotalGross,
        paymentMethod: "transfer",
        paymentDeadline: null,
        paidAmount: 0,
        paymentStatus: "unpaid",
        items: itemsResult.rows.map((item: any) => ({
          description: item.description,
          quantity: Number(item.correctedQuantity),
          unitPriceNet: Number(item.correctedUnitPriceNet),
          unitPriceGross: Number(item.correctedUnitPriceGross),
          vatRate: Number(item.correctedVatRate),
          totalNet: Number(item.correctedUnitPriceNet) * Number(item.correctedQuantity),
          totalVat: (Number(item.correctedUnitPriceGross) - Number(item.correctedUnitPriceNet)) * Number(item.correctedQuantity),
          totalGross: Number(item.correctedUnitPriceGross) * Number(item.correctedQuantity),
        })),
      };

      await query("UPDATE invoice_corrections SET ksef_status = $1, ksef_error_message = NULL WHERE id = $2", ["sending", id]);

      const { xml } = await generateKsefXml(invoiceLike as any);
      await query("UPDATE invoice_corrections SET ksef_xml = $1 WHERE id = $2", [xml, id]);

      const result = await sendInvoiceToKsef(xml);

      if (result.success) {
        await query(
          `UPDATE invoice_corrections SET ksef_status = $1, ksef_reference_number = $2,
           ksef_sent_at = CURRENT_TIMESTAMP, ksef_error_message = NULL WHERE id = $3`,
          ["accepted", result.ksefReferenceNumber || result.referenceNumber, id]
        );
        return res.json({
          success: true,
          message: "Korekta wyslana do KSeF",
          ksefReferenceNumber: result.ksefReferenceNumber || result.referenceNumber,
        });
      } else {
        await query(
          "UPDATE invoice_corrections SET ksef_status = $1, ksef_error_message = $2 WHERE id = $3",
          ["error", result.error, id]
        );
        return res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error("[KSeF] Send correction error:", error);
      return res.status(500).json({ error: error.message });
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

// Complete getConfirmationHtml method body - to replace in ksef.controller.ts
  static async getConfirmationHtml(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Nieprawidlowe ID faktury" });

      // Get invoice with items
      const invResult = await query(
        `SELECT * FROM invoices WHERE id = $1`, [id]
      );
      if (invResult.rows.length === 0) return res.status(404).json({ error: "Faktura nie znaleziona" });

      const inv = invResult.rows[0];

      const itemsResult = await query(
        `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id ASC`, [id]
      );
      const items = itemsResult.rows;

      const { SettingsModel } = require("../models/Settings");
      const company = await SettingsModel.getCompanySettings();

      const buyer = inv.buyerSnapshot || {};
      const ksefRef = inv.ksefReferenceNumber || "";
      const isAccepted = inv.ksefStatus === "accepted";
      const isOffline = !inv.ksefStatus || inv.ksefStatus === "none" || inv.ksefStatus === "not_sent";

      // Generate QR code
      const QRCode = require("qrcode");
      const cryptoModule = require("crypto");
      const ksefEnv = await SettingsModel.getSetting("ksef_environment") || "test";
      const qrBaseUrls: Record<string, string> = { test: "https://qr-test.ksef.mf.gov.pl", demo: "https://qr-demo.ksef.mf.gov.pl", production: "https://qr.ksef.mf.gov.pl" };
      const qrBase = qrBaseUrls[ksefEnv] || qrBaseUrls.test;
      const sellerNip = company.nip.replace(/[^0-9]/g, "");
      const issDate = new Date(inv.issueDate);
      const issDDMMYYYY = String(issDate.getDate()).padStart(2, "0") + "-" + String(issDate.getMonth() + 1).padStart(2, "0") + "-" + issDate.getFullYear();

      let xmlHash = "";
      try {
        const xmlResult = await query("SELECT ksef_xml FROM invoices WHERE id = $1", [id]);
        if (xmlResult.rows[0]?.ksefXml) {
          xmlHash = cryptoModule.createHash("sha256").update(xmlResult.rows[0].ksefXml, "utf8").digest("base64url");
        } else {
          const { generateKsefXml } = require("../services/ksefXmlGenerator");
          const { InvoiceModel } = require("../models/Invoice");
          const fullInvoice = await InvoiceModel.getById(id);
          if (fullInvoice) {
            const { xml } = await generateKsefXml(fullInvoice);
            xmlHash = cryptoModule.createHash("sha256").update(xml, "utf8").digest("base64url");
          }
        }
      } catch (e) { /* ignore */ }

      const verifyUrl = xmlHash ? `${qrBase}/invoice/${sellerNip}/${issDDMMYYYY}/${xmlHash}` : "";
      let qrDataUrl = "";
      if (verifyUrl) {
        try {
          qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" });
        } catch (e) { /* ignore */ }
      }

      // === KOD QR II - CERTYFIKAT (issuer verification) ===
      // Format: {qrBase}/certificate/{TYP}/{KONTEKST}/{NIP}/{SERIAL}/{HASH_URL_ENCODED}/{PODPIS}
      // PODPIS = signature of SHA-256 of UTF-8 bytes of URL path (without https://)
      // Signing path: qr-{env}.ksef.mf.gov.pl/certificate/{TYP}/{KONTEKST}/{NIP}/{SERIAL}/{HASH}
      // For EC keys: ECDSA P-256 in IEEE P1363 format
      // For RSA keys: RSA-PSS
      let cert2QrUrl = "";
      let cert2QrDataUrl = "";
      try {
        const certPem = await SettingsModel.getSetting("ksef_cert_pem");
        const certKeyPem = await SettingsModel.getSetting("ksef_cert_key_pem");
        const certSerial = await SettingsModel.getSetting("ksef_cert_serial");
        if (certPem && certKeyPem && certSerial && xmlHash && sellerNip) {
          const typ = "Nip";
          const kontekst = sellerNip;
          // Extract host from qrBase (strip https://)
          const qrHost = qrBase.replace(/^https?:\/\//, "");
          // Normalize serial to uppercase hex (KSeF expects uppercase)
          const serialUpper = certSerial.toUpperCase();
          // Build the path that will be signed (no protocol, no leading slash needed)
          const pathToSign = `${qrHost}/certificate/${typ}/${encodeURIComponent(kontekst)}/${sellerNip}/${serialUpper}/${xmlHash}`;

          // Detect key type - EC or RSA
          const keyObj = cryptoModule.createPrivateKey(certKeyPem);
          const keyType = keyObj.asymmetricKeyType;

          let sigBuffer: Buffer;
          if (keyType === "ec") {
            // ECDSA with SHA-256, IEEE P1363 format
            const signer = cryptoModule.createSign("SHA256");
            signer.update(pathToSign, "utf8");
            signer.end();
            sigBuffer = signer.sign({ key: keyObj, dsaEncoding: "ieee-p1363" });
          } else {
            // RSA-PSS with SHA-256
            sigBuffer = cryptoModule.sign("SHA256", Buffer.from(pathToSign, "utf8"), {
              key: keyObj,
              padding: cryptoModule.constants.RSA_PKCS1_PSS_PADDING,
              saltLength: 32,
            });
          }

          const sigBase64Url = sigBuffer.toString("base64url");
          cert2QrUrl = `https://${pathToSign}/${sigBase64Url}`;
          cert2QrDataUrl = await QRCode.toDataURL(cert2QrUrl, { width: 200, margin: 1, errorCorrectionLevel: "M" });
          console.log(`[KSeF Cert QR] Generated (${keyType}) serial=${serialUpper} sigLen=${sigBase64Url.length}`);
        }
      } catch (certErr: any) {
        console.error("[KSeF] Cert QR generation error:", certErr.message);
      }

      // Helpers
      const fmt = (d: any) => { if (!d) return "-"; return new Date(d).toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" }); };
      const fmtA = (v: any) => (Number(v) || 0).toFixed(2);
      const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const buyerName = buyer.companyName || [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || "Brak danych";

      // Check for discounts
      const invDiscountPct = Number(inv.discountPercent) || 0;
      const invDiscountAmt = Number(inv.discountAmount) || 0;
      const hasAnyDiscount = items.some((i: any) => Number(i.discountPercent) > 0 || Number(i.originalUnitPriceNet) > 0) || invDiscountPct > 0;

      // Calculate total before discount
      let totalBeforeDiscount = 0;
      if (hasAnyDiscount) {
        items.forEach((i: any) => {
          const origGross = Number(i.originalUnitPriceGross) || Number(i.unitPriceGross) || 0;
          totalBeforeDiscount += origGross * (Number(i.quantity) || 0);
        });
      }

      // Build items table rows
      let itemsHtml = "";
      items.forEach((item: any, idx: number) => {
        const unitNet = Number(item.unitPriceNet) || 0;
        const unitGross = Number(item.unitPriceGross) || 0;
        const qty = Number(item.quantity) || 0;
        const vatRate = Number(item.vatRate) || 0;
        const totalNet = Number(item.totalNet) || 0;
        const totalGross = Number(item.totalGross) || 0;
        const discPct = Number(item.discountPercent) || 0;
        const origNet = Number(item.originalUnitPriceNet) || 0;
        const hasDisc = discPct > 0 || origNet > 0;
        itemsHtml += `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;text-align:center">${idx + 1}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${esc(item.description)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${qty}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtA(unitNet)} zł</td>
          ${hasAnyDiscount ? `<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;text-decoration:${hasDisc ? 'line-through' : 'none'};color:#9ca3af;font-size:11px">${hasDisc && origNet ? fmtA(origNet) + ' zł' : ''}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:bold;font-size:11px">${hasDisc ? '-' + fmtA(discPct) + '%' : ''}</td>` : ''}
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${fmtA(vatRate)}%</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtA(totalNet)} zł</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${fmtA(totalGross)} zł</td>
        </tr>`;
      });

      // VAT summary by rate
      const vatGroups: Record<string, { net: number; vat: number; gross: number }> = {};
      items.forEach((item: any) => {
        const rate = fmtA(item.vatRate) + "%";
        if (!vatGroups[rate]) vatGroups[rate] = { net: 0, vat: 0, gross: 0 };
        vatGroups[rate].net += Number(item.totalNet) || 0;
        vatGroups[rate].vat += (Number(item.totalGross) || 0) - (Number(item.totalNet) || 0);
        vatGroups[rate].gross += Number(item.totalGross) || 0;
      });

      let vatHtml = "";
      for (const [rate, vals] of Object.entries(vatGroups)) {
        vatHtml += `<tr>
          <td style="padding:6px 12px;font-size:12px">${rate}</td>
          <td style="padding:6px 12px;text-align:right;font-size:12px">${fmtA(vals.net)} zl</td>
          <td style="padding:6px 12px;text-align:right;font-size:12px">${fmtA(vals.vat)} zl</td>
          <td style="padding:6px 12px;text-align:right;font-size:12px">${fmtA(vals.gross)} zl</td>
        </tr>`;
      }

      const totalNet = Number(inv.subtotalNet) || 0;
      const totalVat = Number(inv.totalVat) || 0;
      const totalGross = Number(inv.totalGross) || 0;

      // KSeF status section
      let ksefStatusHtml = "";
      if (isAccepted && ksefRef) {
        ksefStatusHtml = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 20px;margin:24px 0">
          <div style="font-weight:600;color:#166534;font-size:13px">Faktura przyjęta do KSeF</div>
          <div style="color:#166534;font-size:9px;margin-top:4px">Numer referencyjny KSeF: <strong>${esc(ksefRef)}</strong></div>
        </div>`;
      } else {
        ksefStatusHtml = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 20px;margin:24px 0">
          <div style="font-weight:600;color:#1e40af;font-size:13px">Faktura oczekuje na przesłanie do KSeF</div>
          <div style="color:#1e40af;font-size:9px;margin-top:4px">Numer referencyjny KSeF zostanie nadany po przyjęciu faktury przez system.</div>
        </div>`;
      }

      // QR section
      let qrHtml = "";
      if (qrDataUrl) {
        qrHtml = `<div style="display:flex;gap:24px;justify-content:center;margin:20px 0">
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
            <div style="font-weight:600;color:#374151;font-size:12px;margin-bottom:12px">sprawdź fakturę w KSeF</div>
            <img src="${qrDataUrl}" alt="QR" width="140" height="140" style="display:block;margin:0 auto"/>
            ${isAccepted && ksefRef ? `<div style="font-size:9px;color:#6b7280;margin-top:8px;word-break:break-all">${esc(ksefRef)}</div>` : `<div style="font-size:9px;color:#6b7280;margin-top:8px">OFFLINE</div>`}
          </div>
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
            <div style="font-weight:600;color:#374151;font-size:12px;margin-bottom:12px">zweryfikuj wystawcę faktury</div>
            ${cert2QrDataUrl ? `<img src="${cert2QrDataUrl}" alt="Cert QR" width="140" height="140" style="display:block;margin:0 auto"/><div style="font-size:9px;color:#6b7280;margin-top:8px">CERTYFIKAT</div>` : `<div style="width:140px;height:140px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;margin:0 auto;border-radius:8px;color:#9ca3af;font-size:10px;padding:10px">Wymaga certyfikatu KSeF typ 2</div>`}
          </div>
        </div>`;
      } else {
        qrHtml = `<div style="display:flex;gap:24px;justify-content:center;margin:20px 0">
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
            <div style="font-weight:600;color:#374151;font-size:12px;margin-bottom:12px">sprawdź fakturę w KSeF</div>
            <div style="width:140px;height:140px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;margin:0 auto;border-radius:8px;color:#9ca3af;font-size:10px;padding:10px">Kod QR dostępny po wygenerowaniu</div>
          </div>
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
            <div style="font-weight:600;color:#374151;font-size:12px;margin-bottom:12px">zweryfikuj wystawcę faktury</div>
            ${cert2QrDataUrl ? `<img src="${cert2QrDataUrl}" alt="Cert QR" width="140" height="140" style="display:block;margin:0 auto"/><div style="font-size:9px;color:#6b7280;margin-top:8px">CERTYFIKAT</div>` : `<div style="width:140px;height:140px;border:2px dashed #d1d5db;display:flex;align-items:center;justify-content:center;margin:0 auto;border-radius:8px;color:#9ca3af;font-size:10px;padding:10px">Wymaga certyfikatu KSeF typ 2</div>`}
          </div>
        </div>`;
      }

      const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Potwierdzenie transakcji - ${esc(inv.invoiceNumber)}</title>
<style>
@media print{@page{size:A4 portrait;margin:8mm}html,body{margin:0;padding:0}.no-print{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1f2937;margin:0;padding:0;background:#f3f4f6}
.page{width:190mm;max-width:190mm;margin:10mm auto;padding:12mm;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1)}
@media print{.page{margin:0;padding:8mm;box-shadow:none;width:100%;max-width:100%}body{background:#fff}}
</style></head><body>
<div class="page">

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #2563eb;margin-bottom:20px">
  <div>
    <h1 style="font-size:20px;font-weight:bold;color:#1f2937;margin:0">POTWIERDZENIE TRANSAKCJI</h1>
    <div style="font-size:11px;color:#6b7280;margin-top:4px">Dokument wystawiony na podstawie art. 106g ust. 3b ustawy o VAT</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:18px;font-weight:bold;color:#1f2937">${esc(inv.invoiceNumber)}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px">Data wystawienia: ${fmt(inv.issueDate)}</div>
    <div style="font-size:11px;color:#6b7280">Data sprzedazy: ${fmt(inv.saleDate)}</div>
  </div>
</div>

<!-- Parties -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px">
    <div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:8px">SPRZEDAWCA</div>
    <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${esc(company.companyName)}</div>
    <div style="font-size:11px;color:#4b5563">NIP: ${esc(company.nip)}</div>
    <div style="font-size:11px;color:#4b5563">${esc(company.street)}</div>
    <div style="font-size:11px;color:#4b5563">${esc(company.postalCode)} ${esc(company.city)}</div>
    ${company.email ? `<div style="font-size:11px;color:#4b5563">Email: ${esc(company.email)}</div>` : ""}
    ${company.phone ? `<div style="font-size:11px;color:#4b5563">Tel: ${esc(company.phone)}</div>` : ""}
  </div>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px">
    <div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:8px">NABYWCA</div>
    <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${esc(buyerName)}</div>
    ${buyer.nip ? `<div style="font-size:11px;color:#4b5563">NIP: ${esc(buyer.nip)}</div>` : ""}
    ${buyer.street ? `<div style="font-size:11px;color:#4b5563">${esc(buyer.street)}</div>` : ""}
    ${(buyer.postalCode || buyer.city) ? `<div style="font-size:11px;color:#4b5563">${esc((buyer.postalCode || "") + " " + (buyer.city || "")).trim()}</div>` : ""}
  </div>
</div>

<!-- Items table -->
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px">
  <thead>
    <tr style="border-bottom:2px solid #e5e7eb">
      <th style="padding:8px;text-align:center;color:#6b7280;font-weight:600;font-size:11px;width:30px">Lp.</th>
      <th style="padding:8px;text-align:left;color:#6b7280;font-weight:600;font-size:11px">Nazwa towaru / usługi</th>
      <th style="padding:8px;text-align:center;color:#6b7280;font-weight:600;font-size:11px;width:50px">Ilość</th>
      <th style="padding:8px;text-align:right;color:#6b7280;font-weight:600;font-size:11px">Cena netto</th>
      <th style="padding:8px;text-align:center;color:#6b7280;font-weight:600;font-size:11px;width:55px">VAT</th>
      <th style="padding:8px;text-align:right;color:#6b7280;font-weight:600;font-size:11px">Wartość netto</th>
      <th style="padding:8px;text-align:right;color:#6b7280;font-weight:600;font-size:11px">Wartość brutto</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>

<!-- VAT summary + Totals -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  <div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:1px solid #e5e7eb">
          <th style="padding:6px 12px;text-align:left;font-weight:600;color:#374151">Stawka VAT</th>
          <th style="padding:6px 12px;text-align:right;font-weight:600;color:#374151">Netto</th>
          <th style="padding:6px 12px;text-align:right;font-weight:600;color:#374151">VAT</th>
          <th style="padding:6px 12px;text-align:right;font-weight:600;color:#374151">Brutto</th>
        </tr>
      </thead>
      <tbody>${vatHtml}</tbody>
    </table>
  </div>
  <div style="display:flex;justify-content:flex-end">
    <table style="border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 16px;color:#6b7280">Netto:</td><td style="padding:6px 16px;text-align:right;font-weight:600">${fmtA(totalNet)} zl</td></tr>
      <tr><td style="padding:6px 16px;color:#6b7280">VAT:</td><td style="padding:6px 16px;text-align:right;font-weight:600">${fmtA(totalVat)} zl</td></tr>
      <tr style="border-top:2px solid #1f2937"><td style="padding:8px 16px;font-weight:700;font-size:14px">Brutto:</td><td style="padding:8px 16px;text-align:right;font-weight:700;font-size:14px">${fmtA(totalGross)} zl</td></tr>
    </table>
  </div>
</div>

<!-- Payment info -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
  <div style="font-size:12px">
    <span style="color:#6b7280">Forma płatności:</span> <strong>${inv.paymentMethod === "cash" ? "Gotówka" : inv.paymentMethod === "card" ? "Karta" : "Przelew"}</strong>
    ${company.bankAccount ? `<div style="margin-top:12px;background:#dbeafe;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px">
      <div style="font-size:12px;color:#1e40af;font-weight:bold;margin-bottom:4px">${esc(company.bankName || 'Bank')}</div>
      <div style="font-size:14px;font-weight:bold;letter-spacing:0.5px">${esc(company.bankAccount)}</div>
    </div>` : ''}
  </div>
  <div style="font-size:12px;text-align:right">
    ${inv.paymentDeadline ? `<span style="color:#6b7280">Termin płatności:</span> <strong>${fmt(inv.paymentDeadline)}</strong>` : ""}
  </div>
</div>

<!-- KSeF status -->
${ksefStatusHtml}

<!-- QR codes -->
${qrHtml}

<!-- Footer -->
<div style="text-align:center;margin-top:20px;font-size:10px;color:#9ca3af">
  <div style="font-weight:600;color:#374151;margin-bottom:4px">Krajowy System e-Faktur</div>
  <div>Dokument wygenerowany elektronicznie. Nie wymaga podpisu.</div>
</div>

</div>
<button class="no-print" onclick="window.print()" style="display:block;margin:16px auto;padding:10px 32px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Drukuj potwierdzenie</button>
</body></html>`;

      // Check if receipt format (77mm paragon) is requested
      const format = (req.query.format || "").toString();
      if (format === "receipt") {
        // Build 72mm paragon version for thermal printer (fragment only - wrapped by printReceipt)
        const statusLabel = isAccepted ? "PRZYJETA DO KSeF" : isOffline ? "OCZEKUJE NA KSeF" : "WYSYLANIE";
        // Check for discounts
        const pHasDiscount = items.some((i: any) => Number(i.discountPercent) > 0 || Number(i.originalUnitPriceGross) > 0) || Number(inv.discountPercent) > 0;
        let pTotalBefore = 0;
        if (pHasDiscount) {
          items.forEach((i: any) => {
            const origG = Number(i.originalUnitPriceGross) || Number(i.unitPriceGross) || 0;
            pTotalBefore += origG * (Number(i.quantity) || 0);
          });
        }
        const pTotalDiscount = pHasDiscount ? (pTotalBefore - totalGross) : 0;

        let paragonItemsHtml = "";
        items.forEach((item: any, idx: number) => {
          const qty = Number(item.quantity) || 0;
          const unitGross = Number(item.unitPriceGross) || 0;
          const lineGross = Number(item.totalGross) || 0;
          const discPct = Number(item.discountPercent) || 0;
          const origGross = Number(item.originalUnitPriceGross) || 0;
          paragonItemsHtml += `<div style="font-size:11px;margin-top:3px">${idx + 1}. ${esc(item.description || "")}</div>`;
          paragonItemsHtml += `<div style="font-size:10px;display:flex;justify-content:space-between;padding-left:10px"><span>${qty} szt x ${unitGross.toFixed(2)}</span><span style="font-weight:bold">${lineGross.toFixed(2)} zl</span></div>`;
          if (discPct > 0 || origGross > 0) {
            paragonItemsHtml += `<div style="font-size:9px;padding-left:10px;color:#666"><del>${(origGross || unitGross).toFixed(2)}</del> -${discPct.toFixed(2)}%</div>`;
          }
        });

        // VAT summary
        let vatSumHtml = "";
        for (const [rate, vals] of Object.entries(vatGroups)) {
          vatSumHtml += `<div style="font-size:10px;display:flex;justify-content:space-between"><span>${rate}</span><span>N:${vals.net.toFixed(2)} V:${vals.vat.toFixed(2)} B:${vals.gross.toFixed(2)}</span></div>`;
        }

        const dash = '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
        const solid = '<div style="border-top:2px solid #000;margin:4px 0"></div>';

        // Fragment only - NO html/head/body wrapper
        const paragonDiscountLine = pHasDiscount ? '<div style="font-size:9px;font-weight:bold;color:#666;margin:2px 0">RABAT: -' + pTotalDiscount.toFixed(2) + ' zl (przed: ' + pTotalBefore.toFixed(2) + ' zl)</div>' : '';

        const paragonHtml = `<div style="font-family:Courier New,Courier,monospace;color:#000;width:100%;padding:0 3mm">
  <div style="text-align:center;font-size:13px;font-weight:bold">POTWIERDZENIE</div>
  <div style="text-align:center;font-size:13px;font-weight:bold">TRANSAKCJI KSeF</div>
  <div style="text-align:center;font-size:9px;color:#333">art. 106g ust. 3b ustawy o VAT</div>
  ${solid}
  <div style="text-align:center;font-size:12px;font-weight:bold;margin:4px 0">${esc(inv.invoiceNumber)}</div>
  <div style="text-align:center;font-size:9px">${fmt(inv.issueDate)}</div>
  ${dash}
  <div style="font-size:10px;font-weight:bold">SPRZEDAWCA:</div>
  <div style="font-size:10px">${esc(company.companyName)}</div>
  <div style="font-size:9px">${esc(company.street)}</div>
  <div style="font-size:9px">${esc(company.postalCode)} ${esc(company.city)}</div>
  <div style="font-size:9px">NIP: ${esc(company.nip)}</div>
  ${dash}
  <div style="font-size:10px;font-weight:bold">NABYWCA:</div>
  <div style="font-size:10px">${esc(buyerName)}</div>
  ${buyer.nip ? `<div style="font-size:9px">NIP: ${esc(buyer.nip)}</div>` : ""}
  ${buyer.street ? `<div style="font-size:9px">${esc(buyer.street)}</div>` : ""}
  ${(buyer.postalCode || buyer.city) ? `<div style="font-size:9px">${esc((buyer.postalCode || "") + " " + (buyer.city || "")).trim()}</div>` : ""}
  ${dash}
  ${paragonItemsHtml}
  ${dash}
  <div style="font-size:10px;font-weight:bold">Podsumowanie VAT:</div>
  ${vatSumHtml}
  ${dash}
  ${pHasDiscount ? `<div style="font-size:9px;font-weight:bold;color:#666;margin:2px 0">RABAT: -${pTotalDiscount.toFixed(2)} zl (przed: ${pTotalBefore.toFixed(2)} zl)</div>` : ''}
  ${dash}
  <div style="font-size:11px;display:flex;justify-content:space-between"><span>Netto:</span><span>${totalNet.toFixed(2)} zl</span></div>
  <div style="font-size:11px;display:flex;justify-content:space-between"><span>VAT:</span><span>${totalVat.toFixed(2)} zl</span></div>
  ${solid}
  <div style="font-size:14px;font-weight:bold;display:flex;justify-content:space-between"><span>RAZEM:</span><span>${totalGross.toFixed(2)} zl</span></div>
  ${solid}
  ${paragonDiscountLine}
  <div style="font-size:10px;margin:4px 0">Forma płatności: <strong>${inv.paymentMethod === "cash" ? "Gotówka" : inv.paymentMethod === "card" ? "Karta" : "Przelew"}</strong></div>
  ${company.bankAccount ? `<div style="font-size:9px;margin:4px 0;padding:3px;border:1px dashed #000">
    <div style="font-weight:bold">${esc(company.bankName || 'Bank')}</div>
    <div style="letter-spacing:0.3px">${esc(company.bankAccount)}</div>
  </div>` : ''}
  <div style="text-align:center;font-size:10px;font-weight:bold;margin:4px 0;padding:3px;border:1px solid #000">${statusLabel}</div>
  ${ksefRef ? `<div style="text-align:center;font-size:8px;word-break:break-all;margin-top:2px">${esc(ksefRef)}</div>` : ""}
  ${dash}
  ${qrDataUrl ? `<div style="text-align:center;margin:6px 0"><div style="font-size:9px;font-weight:bold;margin-bottom:2px">Sprawdz fakture w KSeF</div><img src="${qrDataUrl}" alt="QR" style="display:block;margin:0 auto;width:45mm;height:45mm"/></div>` : ""}
  ${cert2QrDataUrl ? `<div style="text-align:center;margin:6px 0"><div style="font-size:9px;font-weight:bold;margin-bottom:2px">Zweryfikuj wystawce</div><img src="${cert2QrDataUrl}" alt="Cert QR" style="display:block;margin:0 auto;width:45mm;height:45mm"/></div>` : ""}
  ${dash}
  <div style="text-align:center;font-size:9px;margin-top:4px">
    <div style="font-weight:bold">Krajowy System e-Faktur</div>
    <div>Dokument elektroniczny</div>
  </div>
</div>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(paragonHtml);
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (error: any) {
      console.error("[KSeF] Get confirmation HTML error:", error);
      return res.status(500).json({ error: "Błąd generowania potwierdzenia KSeF" });
    }
  }

  static async uploadCertificate(req: AuthRequest, res: Response) {
    try {
      const { certificatePem, privateKeyPem, passphrase } = req.body;
      if (!certificatePem || !privateKeyPem) {
        return res.status(400).json({ error: "Wymagany certyfikat PEM i klucz prywatny PEM" });
      }

      // Validate certificate
      let cert: crypto.X509Certificate;
      try {
        cert = new crypto.X509Certificate(certificatePem);
      } catch (e: any) {
        return res.status(400).json({ error: "Nieprawidlowy certyfikat X.509: " + e.message });
      }

      // Validate private key
      let keyObj: crypto.KeyObject;
      try {
        // Normalize PEM - trim whitespace, fix line endings
        const cleanKey = privateKeyPem.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        // Try PKCS#8 first, then SEC1, then raw
        try {
          keyObj = crypto.createPrivateKey(passphrase ? { key: cleanKey, format: 'pem', passphrase } : cleanKey);
        } catch {
          try {
            keyObj = crypto.createPrivateKey({ key: cleanKey, format: "pem", passphrase: passphrase || undefined });
          } catch {
            if (!cleanKey.includes("-----BEGIN")) {
              keyObj = crypto.createPrivateKey("-----BEGIN PRIVATE KEY-----\n" + cleanKey.replace(/\s/g, "") + "\n-----END PRIVATE KEY-----");
            } else {
              throw new Error("Nieobslugiwany format klucza prywatnego");
            }
          }
        }
        const keyType = keyObj.asymmetricKeyType;
        if (keyType !== "ec" && keyType !== "rsa") {
          return res.status(400).json({ error: "Klucz musi byc EC lub RSA, otrzymano: " + keyType });
        }
        // Verify key matches certificate
        const testData = Buffer.from("ksef-test");
        const sig = crypto.sign("sha256", testData, keyObj);
        const valid = crypto.verify("sha256", testData, cert.publicKey, sig);
        if (!valid) {
          return res.status(400).json({ error: "Klucz prywatny nie pasuje do certyfikatu" });
        }
      } catch (e: any) {
        if ((e as any).status) return res.status((e as any).status).json({ error: (e as any).message });
        return res.status(400).json({ error: "Nieprawidlowy klucz prywatny: " + e.message });
      }

      const serial = cert.serialNumber;
      const validFrom = cert.validFrom;
      const validTo = cert.validTo;
      const subject = cert.subject;

      await Promise.all([
        SettingsModel.upsertSetting("ksef_cert_pem", certificatePem, "Certyfikat KSeF PEM"),
        SettingsModel.upsertSetting("ksef_cert_key_pem", keyObj.export({ type: "pkcs8", format: "pem" }) as string, "Klucz prywatny certyfikatu KSeF"),
        SettingsModel.upsertSetting("ksef_cert_serial", serial, "Numer seryjny certyfikatu KSeF"),
        SettingsModel.upsertSetting("ksef_cert_valid_from", validFrom, "Certyfikat KSeF wazny od"),
        SettingsModel.upsertSetting("ksef_cert_valid_to", validTo, "Certyfikat KSeF wazny do"),
        SettingsModel.upsertSetting("ksef_cert_subject", subject, "Podmiot certyfikatu KSeF"),
      ]);

      return res.json({
        success: true,
        message: "Certyfikat wgrany pomyslnie",
        certificate: { serial, validFrom, validTo, subject },
      });
    } catch (error: any) {
      console.error("[KSeF] Upload certificate error:", error);
      return res.status(500).json({ error: "Blad wgrywania certyfikatu: " + error.message });
    }
  }

  static async getCertificateStatus(_req: AuthRequest, res: Response) {
    try {
      const [serial, validFrom, validTo, subject] = await Promise.all([
        SettingsModel.getSetting("ksef_cert_serial"),
        SettingsModel.getSetting("ksef_cert_valid_from"),
        SettingsModel.getSetting("ksef_cert_valid_to"),
        SettingsModel.getSetting("ksef_cert_subject"),
      ]);

      if (!serial) {
        return res.json({ hasCertificate: false });
      }

      const now = new Date();
      const from = new Date(validFrom || "");
      const to = new Date(validTo || "");
      const isValid = now >= from && now <= to;

      return res.json({
        hasCertificate: true,
        serial,
        validFrom,
        validTo,
        subject,
        isValid,
      });
    } catch (error: any) {
      console.error("[KSeF] Get certificate status error:", error);
      return res.status(500).json({ error: "Blad pobierania statusu certyfikatu" });
    }
  }

  static async generateCsr(req: AuthRequest, res: Response) {
    try {
      const { SettingsModel: SM } = require("../models/Settings");
      const company = await SM.getCompanySettings();
      const companyName = company.companyName || "Firma";
      const nip = (company.nip || "").replace(/[^0-9]/g, "");

      // Generate EC P-256 key pair
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
        namedCurve: "P-256",
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "sec1", format: "pem" },
      });

      // Build CSR using basic ASN.1 DER encoding
      // Subject: CN=companyName, O=companyName, serialNumber=NIP-<nip>, C=PL
      const subjectParts: Array<{ oid: number[]; value: string }> = [
        { oid: [2, 5, 4, 6], value: "PL" },                          // C
        { oid: [2, 5, 4, 10], value: companyName },                   // O
        { oid: [2, 5, 4, 3], value: companyName },                    // CN
        { oid: [2, 5, 4, 5], value: "NIP-" + nip },                   // serialNumber
      ];

      function encodeLength(len: number): Buffer {
        if (len < 128) return Buffer.from([len]);
        if (len < 256) return Buffer.from([0x81, len]);
        return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
      }

      function encodeTLV(tag: number, content: Buffer): Buffer {
        return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
      }

      function encodeOID(oid: number[]): Buffer {
        const bytes: number[] = [40 * oid[0] + oid[1]];
        for (let i = 2; i < oid.length; i++) {
          let v = oid[i];
          if (v < 128) { bytes.push(v); }
          else {
            const enc: number[] = [];
            enc.unshift(v & 0x7f);
            v >>= 7;
            while (v > 0) { enc.unshift((v & 0x7f) | 0x80); v >>= 7; }
            bytes.push(...enc);
          }
        }
        return encodeTLV(0x06, Buffer.from(bytes));
      }

      function encodeUTF8String(s: string): Buffer {
        return encodeTLV(0x0c, Buffer.from(s, "utf8"));
      }

      function encodePrintableString(s: string): Buffer {
        return encodeTLV(0x13, Buffer.from(s, "ascii"));
      }

      // Build subject RDN sequence
      const rdns = subjectParts.map(p => {
        const oid = encodeOID(p.oid);
        const val = p.oid.toString() === "2,5,4,6"
          ? encodePrintableString(p.value)
          : encodeUTF8String(p.value);
        const attrTypeAndValue = encodeTLV(0x30, Buffer.concat([oid, val]));
        return encodeTLV(0x31, attrTypeAndValue);
      });
      const subject_der = encodeTLV(0x30, Buffer.concat(rdns));

      // Parse public key from PEM
      const pubKeyDer = Buffer.from(
        publicKey.replace(/-----BEGIN PUBLIC KEY-----/g, "")
          .replace(/-----END PUBLIC KEY-----/g, "")
          .replace(/\s/g, ""),
        "base64"
      );

      // Version 0
      const version = encodeTLV(0x02, Buffer.from([0x00]));

      // Empty attributes [0] EXPLICIT
      const attributes = Buffer.from([0xa0, 0x00]);

      // EC with SHA256 algorithm identifier for signing
      // OID 1.2.840.10045.4.3.2 = ecdsa-with-SHA256
      const ecdsaSha256OID = encodeOID([1, 2, 840, 10045, 4, 3, 2]);
      const signAlgId = encodeTLV(0x30, ecdsaSha256OID);

      // CertificationRequestInfo
      const certReqInfo = encodeTLV(0x30, Buffer.concat([version, subject_der, pubKeyDer, attributes]));

      // Sign with private key
      const signer = crypto.createSign("SHA256");
      signer.update(certReqInfo);
      const signature = signer.sign(privateKey);

      // Wrap signature in BIT STRING (prepend 0x00 for unused bits)
      const sigBitString = encodeTLV(0x03, Buffer.concat([Buffer.from([0x00]), signature]));

      // Full CSR
      const csr = encodeTLV(0x30, Buffer.concat([certReqInfo, signAlgId, sigBitString]));

      const csrBase64 = csr.toString("base64");
      const csrPem = "-----BEGIN CERTIFICATE REQUEST-----\n" +
        csrBase64.match(/.{1,64}/g)!.join("\n") +
        "\n-----END CERTIFICATE REQUEST-----";

      return res.json({
        success: true,
        csr: csrPem,
        privateKeyPem: privateKey as string,
        message: "CSR wygenerowany. Przeslij go do MCU w Aplikacji Podatnika KSeF, a nastepnie wgraj otrzymany certyfikat.",
      });
    } catch (error: any) {
      console.error("[KSeF] Generate CSR error:", error);
      return res.status(500).json({ error: "Blad generowania CSR: " + error.message });
    }
  }

}
