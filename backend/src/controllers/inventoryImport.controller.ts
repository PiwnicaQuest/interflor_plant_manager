import { Response } from "express";
import multer from "multer";
import { AuthRequest } from "../middleware/auth";

// Configure multer for PDF uploads
const pdfStorage = multer.memoryStorage();
export const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki PDF') as any, false);
    }
  },
});
import { SettingsModel } from "../models/Settings";
import { query } from "../models/database";

const { PDFParse } = require("pdf-parse");
const OpenAI = require("openai");

interface ParsedItem {
  index: number;
  rawName: string;
  potSize?: string;
  plantHeight?: string;
  quantity: number;
  unitPriceNet: number;
  totalNet: number;
  vatRate: number;
  growerPassport?: string;
  barcode?: string;
  // Matching info added on backend
  matchedProductId?: number;
  matchedProductName?: string;
  matchStatus?: "matched" | "candidates" | "not_found" | "barcode_match";
  barcodeMatchInfo?: { id: number; plantName: string; potSize: string; totalUnits: number; isArchived: boolean };
  candidates?: Array<{ id: number; plantName: string; potSize: string; totalUnits: number; isArchived?: boolean; similarity: number }>;
}

interface ParsedInvoice {
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  totalNet?: number;
  totalGross?: number;
  items: ParsedItem[];
}

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\sąćęłńóśźż]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class InventoryImportController {
  /** POST /inventory/import-pdf - upload PDF and parse with AI */
  static async parseInvoicePdf(req: AuthRequest, res: Response) {
    try {
      if (!(req as any).file) {
        return res.status(400).json({ error: "Brak pliku PDF" });
      }

      // Get OpenAI API key from settings
      const apiKey = await SettingsModel.getSetting("openai_api_key");
      if (!apiKey) {
        return res.status(400).json({
          error: "Brak skonfigurowanego klucza OpenAI API. Wejdź w Ustawienia → Import AI."
        });
      }

      const model = (await SettingsModel.getSetting("openai_model")) || "gpt-4o";

      // Extract text from PDF (pdf-parse v2 API)
      const pdfBuffer = (req as any).file.buffer;
      const pdfParser = new PDFParse({ data: pdfBuffer });
      const textResult = await pdfParser.getText();
      const pdfText = textResult.text || "";
      await pdfParser.destroy();

      // DEBUG: log extracted PDF text
      console.log("[AI IMPORT] === PDF TEXT EXTRACTED (" + pdfText.length + " chars) ===");
      console.log(pdfText);
      console.log("[AI IMPORT] === END PDF TEXT ===");

      if (!pdfText || pdfText.trim().length < 50) {
        return res.status(400).json({
          error: "Nie udało się wyciągnąć tekstu z PDF. Może to być skan papierowy."
        });
      }

      // Call OpenAI with structured output
      const openai = new OpenAI({ apiKey });

      const systemPrompt = `Jesteś ekspertem od interpretacji faktur (polskich i zagranicznych) za rośliny ozdobne, byliny, krzewy, drzewa i materiał szkółkarski. Twoim zadaniem jest wyciągnięcie pozycji z faktury w ustrukturyzowanej formie.

NAJWAŻNIEJSZA ZASADA - NAZWY ROŚLIN:
- Pole rawName = DOKŁADNIE tekst z linii "Description" na fakturze, SKOPIOWANY ZNAK PO ZNAKU
- Np. jeśli na fakturze jest "LAVANDULA STOECHAS BUSH D19" to rawName = "LAVANDULA STOECHAS BUSH D19"
- Np. jeśli jest "ARGYRANT. FRUT. BUSH D14 - COLOURED" to rawName = "ARGYRANT. FRUT. BUSH D14 - COLOURED"
- Np. jeśli jest "MENTHA SPICATA MAROCCHINA DA TÈ BUSH D14" to rawName = "MENTHA SPICATA MAROCCHINA DA TÈ BUSH D14"
- NIE tłumacz, NIE zmieniaj, NIE poprawiaj pisowni, NIE rozwijaj skrótów
- NIE zamieniaj na nazwy łacińskie jeśli na fakturze jest nazwa handlowa
- NIE usuwaj oznaczeń typu "BUSH", "STEM", "CESP.", "D14" z nazwy
- Rozdzielaj TYLKO rozmiar doniczki (D14, D19, D25 itp.) do pola potSize

ROZMIAR DONICZKI (potSize) - oddzielne pole:
- Format: "p9", "p10", "p12", "p15", "p17", "p19", "p21", "p23", "p25", "p27", "p30"
- Lub: "9cm", "10cm", "12cm", "15cm" itp.
- Lub: "C2", "C3", "C5", "C7.5", "C10" (kontenery w litrach)
- Lub: "K15", "K20" (kosz)
- Wyciągaj z opisu, nawet jeśli jest w środku nazwy

WIELKOŚĆ ROŚLINY (plantHeight) - oddzielne pole:
- To jest wysokość lub wielkość samej rośliny (NIE doniczki!)
- Formaty:
  * Wysokość pojedyncza: "30cm", "60cm", "120cm", "h80", "h120"
  * Zakres wysokości: "30-40cm", "40/60", "60-80cm", "100/120cm"
  * Stam (forma piennna): "stam60", "stam80", "stam100", "stam120"
  * Średnica korony: "ø30", "ø40", "śr.40-60"
  * Skróty: "wys.", "h.", "v" (w niemieckich)
- Wyciągaj z opisu produktu
- NIE myl z rozmiarem doniczki (potSize)
- Jeśli jest tylko w nazwie - wyciągnij i podaj jako oddzielne pole

ILOŚĆ:
- Zawsze jako liczba (sztuk)
- Jeśli faktura podaje paletki/skrzynki - przelicz na sztuki jeśli wiadomo ile szt/paleta
- Jeśli nie wiadomo - zachowaj liczbę paletek

CENA:
- Cena jednostkowa netto za jedną sztukę
- W walucie faktury

WALUTA:
- Wykryj walutę z faktury (PLN, EUR, USD, GBP itp.)
- Sprawdź symbole: zł, €, $, £
- Domyślnie PLN jeśli faktura polska bez wyraźnego oznaczenia

PASZPORT ROŚLINY (growerPassport):
- Paszport to numer z pola "Origin producer" - zaczyna się od kodu kraju!
- Przykłady PRAWIDŁOWYCH paszportów: "IT-07-0899", "IT-07-0417", "NL-12345", "DE-BW-12345", "BE-1-12345", "ES-AN-12345"
- Paszport ZAWSZE zaczyna się od kodu kraju: IT-, NL-, DE-, BE-, ES-, PL-
- GREEN PASSPORT NR (np. "F4SR-3MRG") to NIE jest paszport rośliny - to jest numer wewnętrzny, IGNORUJ GO
- Jeśli widzisz "Origin producer: IT-07-0899" to growerPassport = "IT-07-0899"
- Jeśli nie ma Origin producer ani numeru z kodem kraju - zwróć null

KOD KRESKOWY (barcode):
- Szukaj numerów EAN-13 (13 cyfr), EAN-8 (8 cyfr) lub innych kodów kreskowych przy pozycjach
- Mogą być oznaczone jako: EAN, Barcode, Art.Nr., Artikelnummer, Code, Kod
- Format: ciąg cyfr (8-14 cyfr), czasem z myślnikami lub spacjami
- Jeśli przy pozycji nie ma kodu kreskowego - zwróć null
- NIE myśl numeru faktury ani NIP z kodem kreskowym

VAT:
- 8% (rośliny w Polsce) - DOMYŚLNIE
- 23% (doniczki, akcesoria, ziemia, nawozy)
- 0% (WDT/eksport - faktury zagraniczne dla PL podatnika)

POMIŃ POZYCJE:
- transport, koszty wysyłki, opłaty manipulacyjne
- rabaty (są częścią ceny)
- ubezpieczenie
- dodatkowe opłaty bankowe

UWAGI:
- Dokładnie czytaj ilości - jeśli widzisz "10 x 20" to znaczy 10 paletek po 20 szt = 200 szt
- Jeśli na fakturze są bundles (zestawy) - rozłóż je na pojedyncze pozycje jeśli możliwe
- Jeśli widzisz wiele kolorów/odmian tego samego gatunku - traktuj jako oddzielne pozycje`;

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Wyciągnij wszystkie pozycje fakturowe z poniższego tekstu faktury i zwróć je w formacie JSON.\n\nTEKST FAKTURY:\n${pdfText}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "invoice_data",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["supplier", "invoiceNumber", "invoiceDate", "currency", "totalNet", "totalGross", "items"],
              properties: {
                supplier: { type: ["string", "null"], description: "Nazwa dostawcy" },
                invoiceNumber: { type: ["string", "null"], description: "Numer faktury" },
                invoiceDate: { type: ["string", "null"], description: "Data wystawienia w formacie YYYY-MM-DD" },
                currency: { type: ["string", "null"], description: "Waluta faktury (PLN, EUR, USD)" },
                totalNet: { type: ["number", "null"], description: "Łączna kwota netto faktury" },
                totalGross: { type: ["number", "null"], description: "Łączna kwota brutto faktury" },
                items: {
                  type: "array",
                  description: "Lista pozycji z faktury",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["rawName", "potSize", "plantHeight", "quantity", "unitPriceNet", "totalNet", "vatRate", "growerPassport", "barcode"],
                    properties: {
                      rawName: { type: "string", description: "Pełna nazwa rośliny z faktury" },
                      potSize: { type: ["string", "null"], description: "Rozmiar doniczki np. p9, p12, 9cm, 12cm, C2, C5" },
                      plantHeight: { type: ["string", "null"], description: "Wielkość/wysokość rośliny np. 30-40cm, 60cm, stam120, h80" },
                      quantity: { type: "number", description: "Ilość sztuk" },
                      unitPriceNet: { type: "number", description: "Cena netto jednostkowa w PLN" },
                      totalNet: { type: "number", description: "Wartość netto pozycji w PLN" },
                      vatRate: { type: "number", description: "Stawka VAT w procentach (8 lub 23)" },
                      growerPassport: { type: ["string", "null"], description: "Numer paszportu rośliny" },
                      barcode: { type: ["string", "null"], description: "Kod kreskowy EAN produktu (8-14 cyfr)" }
                    }
                  }
                }
              }
            }
          }
        },
        temperature: 0.1,
      });

      const aiResponseText = completion.choices[0]?.message?.content || "{}";
      let parsed: ParsedInvoice;
      try {
        parsed = JSON.parse(aiResponseText);
      } catch (parseErr) {
        console.error("[AI Import] JSON parse error:", parseErr);
        return res.status(500).json({ error: "AI zwróciło nieprawidłowy JSON" });
      }

      // Detect supplier country from PDF text and extract passports
      const countryPrefixes: Record<string, string> = { "IT": "IT-", "NL": "NL-", "DE": "DE-", "BE": "BE-", "ES": "ES-", "PL": "PL-" };
      let detectedCountry = "";
      // Try to detect country from passport prefixes in PDF text
      for (const [country, prefix] of Object.entries(countryPrefixes)) {
        if (pdfText.includes(prefix)) {
          detectedCountry = country;
          break;
        }
      }
      // Also try to detect from supplier address or invoice header
      if (!detectedCountry) {
        const countryPatterns: Record<string, RegExp> = {
          "IT": /(?:Ital[iy]|Roma|Milano|Pistoia|IT\s*\d)/i,
          "NL": /(?:Netherland|Holland|Amsterdam|NL\s*\d)/i,
          "DE": /(?:Germany|Deutschland|Berlin|DE\s*\d)/i,
          "BE": /(?:Belgi[uë]|Brussel|Bruxelles|BE\s*\d)/i,
          "ES": /(?:Espa[ñn]a|Spain|Madrid|ES\s*\d)/i,
          "PL": /(?:Polska|Poland|Warszawa|PL\s*\d)/i,
        };
        for (const [country, pattern] of Object.entries(countryPatterns)) {
          if (pattern.test(pdfText)) {
            detectedCountry = country;
            break;
          }
        }
      }

      // Extract all passport-like sequences from PDF text
      const passportRegexes: RegExp[] = [
        /(?:IT|NL|DE|BE|ES|PL)[-\s]?[A-Z0-9]{2,}[-\/][A-Z0-9\/\.\-]{3,}/gi,
        /(?:Plant\s*Passport|PP|Paszport|Pflanzenpass)[:\s]*([A-Z]{2}[-\s]?[A-Z0-9\-\/\.]+)/gi,
      ];
      const extractedPassports: string[] = [];
      for (const re of passportRegexes) {
        let m;
        while ((m = re.exec(pdfText)) !== null) {
          const passport = (m[1] || m[0]).trim();
          if (passport.length >= 5 && !extractedPassports.includes(passport)) {
            extractedPassports.push(passport);
          }
        }
      }
      console.log("[AI IMPORT] Detected country:", detectedCountry, "Passports found:", extractedPassports.length, extractedPassports.slice(0, 5));

      // Detect currency and convert prices to PLN if needed
      const detectedCurrency = (parsed.currency || "PLN").toUpperCase();
      const pricingSettings = await SettingsModel.getPricingSettings();
      const eurRate = pricingSettings.eurToPlnRate || 4.30;
      let conversionRate = 1;
      if (detectedCurrency === "EUR") {
        conversionRate = eurRate;
      }

      // Convert all item prices to PLN
      if (parsed.items) {
        parsed.items = parsed.items.map((item: any) => ({
          ...item,
          unitPriceNet: Number(item.unitPriceNet || 0) * conversionRate,
          totalNet: Number(item.totalNet || 0) * conversionRate,
          _originalPriceNet: item.unitPriceNet,
          _originalCurrency: detectedCurrency,
        }));
      }

      // Match each item to existing products (including archived - for barcode matching)
      const productsResult = await query(
        "SELECT id, plant_name as \"plantName\", pot_size as \"potSize\", total_units as \"totalUnits\", barcode, is_archived as \"isArchived\" FROM products"
      );
      const allProducts = productsResult.rows;

      const itemsWithMatching: ParsedItem[] = (parsed.items || []).map((item: any, idx: number) => {
        // First: try exact barcode match
        let barcodeMatch: any = null;
        if (item.barcode) {
          barcodeMatch = allProducts.find((p: any) => p.barcode && p.barcode === item.barcode);
        }

        // Then: fuzzy name matching (only active products)
        const activeProducts = allProducts.filter((p: any) => !p.isArchived);
        const itemName = normalizeName(item.rawName + " " + (item.potSize || ""));
        const candidates = activeProducts
          .map((p: any) => {
            const productName = normalizeName(p.plantName + " " + (p.potSize || ""));
            return { ...p, similarity: similarity(itemName, productName) };
          })
          .filter((p: any) => p.similarity >= 0.5)
          .sort((a: any, b: any) => b.similarity - a.similarity)
          .slice(0, 5);

        let matchStatus: "matched" | "candidates" | "not_found" | "barcode_match" = "not_found";
        let matchedProductId: number | undefined;
        let matchedProductName: string | undefined;
        let barcodeMatchInfo: any = null;

        if (barcodeMatch) {
          matchStatus = "barcode_match";
          matchedProductId = barcodeMatch.id;
          matchedProductName = barcodeMatch.plantName + (barcodeMatch.potSize ? " " + barcodeMatch.potSize : "");
          barcodeMatchInfo = {
            id: barcodeMatch.id,
            plantName: barcodeMatch.plantName,
            potSize: barcodeMatch.potSize,
            totalUnits: barcodeMatch.totalUnits,
            isArchived: barcodeMatch.isArchived,
          };
        } else if (candidates.length > 0) {
          if (candidates[0].similarity >= 0.85) {
            matchStatus = "matched";
            matchedProductId = candidates[0].id;
            matchedProductName = candidates[0].plantName + (candidates[0].potSize ? " " + candidates[0].potSize : "");
          } else if (candidates[0].similarity >= 0.5) {
            matchStatus = "candidates";
          }
        }

        // If barcode match - also add it at top of candidates if not there
        const allCandidates = [...candidates];
        if (barcodeMatch && !allCandidates.find((c: any) => c.id === barcodeMatch.id)) {
          allCandidates.unshift({ ...barcodeMatch, similarity: 1.0 });
        }

        return {
          index: idx,
          rawName: item.rawName,
          potSize: item.potSize,
          quantity: item.quantity,
          unitPriceNet: item.unitPriceNet,
          totalNet: item.totalNet,
          vatRate: item.vatRate,
          growerPassport: item.growerPassport,
          barcode: item.barcode || null,
          matchStatus,
          matchedProductId,
          matchedProductName,
          barcodeMatchInfo,
          candidates: allCandidates.slice(0, 5).map((c: any) => ({
            id: c.id,
            plantName: c.plantName,
            potSize: c.potSize,
            totalUnits: c.totalUnits,
            isArchived: c.isArchived || false,
            similarity: Math.round(c.similarity * 100) / 100,
          })),
        };
      });

      return res.json({
        supplier: parsed.supplier,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
        currency: detectedCurrency,
        conversionRate,
        totalNet: parsed.totalNet ? parsed.totalNet * conversionRate : null,
        totalGross: parsed.totalGross ? parsed.totalGross * conversionRate : null,
        items: itemsWithMatching,
        detectedCountry,
        extractedPassports,
        pricingSettings: {
          costPercentage: pricingSettings.costPercentage,
          marginPercentage: pricingSettings.marginPercentage,
          eurToPlnRate: pricingSettings.eurToPlnRate,
        },
        debug: {
          model,
          textLength: pdfText.length,
          tokensUsed: completion.usage?.total_tokens || 0,
        },
      });
    } catch (error: any) {
      console.error("[AI Import] Parse error:", error);
      return res.status(500).json({ error: error.message || "Błąd parsowania faktury" });
    }
  }

  /** POST /inventory/import-pdf/confirm - apply confirmed items to inventory */
  static async confirmImport(req: AuthRequest, res: Response) {
    try {
      const { items, defaultMargin, costPercentage: overrideCost, marginPercentage: overrideMargin, eurToPlnRate: overrideEur,
              invoiceMeta } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Brak pozycji" });
      }

      // Get pricing settings (cost%, margin%, VAT) - use overrides if provided
      const pricingSettings = await SettingsModel.getPricingSettings();
      const effectiveCost = overrideCost !== undefined ? Number(overrideCost) : pricingSettings.costPercentage;
      const effectiveMargin = overrideMargin !== undefined ? Number(overrideMargin) : pricingSettings.marginPercentage;
      const userId = req.user?.userId;

      let createdProducts = 0;
      let updatedStock = 0;
      const results: Array<{ rawName: string; status: string; productId?: number; error?: string }> = [];

      // Save purchase invoice record
      let purchaseInvoiceId: number | null = null;
      if (invoiceMeta) {
        const meta = invoiceMeta;
        const piRes = await query(
          `INSERT INTO purchase_invoices (supplier, invoice_number, invoice_date, currency, conversion_rate, cost_percentage, margin_percentage, total_net_original, total_gross_original, total_net_pln, detected_country, items_count, total_quantity, imported_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            meta.supplier || null,
            meta.invoiceNumber || null,
            meta.invoiceDate || null,
            meta.currency || 'EUR',
            meta.conversionRate || 1,
            effectiveCost,
            effectiveMargin,
            meta.totalNetOriginal || null,
            meta.totalGrossOriginal || null,
            meta.totalNetPln || null,
            meta.detectedCountry || null,
            items.filter((i: any) => !i.skip).length,
            items.filter((i: any) => !i.skip).reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0),
            userId,
          ]
        );
        purchaseInvoiceId = piRes.rows[0].id;
      }

      for (const item of items) {
        try {
          if (item.skip) {
            if (purchaseInvoiceId) {
              const convRate = invoiceMeta?.conversionRate || 1;
              const origPrice = convRate > 0 ? (Number(item.unitPriceNet) || 0) / convRate : Number(item.unitPriceNet) || 0;
              await query(
                `INSERT INTO purchase_invoice_items (purchase_invoice_id, position, raw_name, pot_size, plant_height, quantity, unit_price_net_original, unit_price_net_pln, total_net_original, total_net_pln, vat_rate, barcode, grower_passport, matched_product_id, created_new_product, skipped)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, true)`,
                [
                  purchaseInvoiceId, item.index || 0, item.rawName, item.potSize || null, item.plantHeight || null,
                  Number(item.quantity) || 0, origPrice, Number(item.unitPriceNet) || 0,
                  origPrice * (Number(item.quantity) || 0), (Number(item.unitPriceNet) || 0) * (Number(item.quantity) || 0),
                  item.vatRate || 0, item.barcode || null, item.growerPassport || null, item.matchedProductId || null,
                ]
              );
            }
            continue;
          }

          let productId = item.matchedProductId;

          // If no match - create new product
          if (!productId && item.createNew) {
            // Calculate prices using pricing settings (cost% + margin% + VAT)
            const purchasePriceNet = Number(item.unitPriceNet) || 0;
            const vatRate = item.vatRate || 8;
            const prices = SettingsModel.calculatePrices(
              purchasePriceNet,
              effectiveCost,
              effectiveMargin,
              vatRate
            );
            // Auto-detect units_per_pallet from existing products with same pot size
            let unitsPerPallet = 1;
            if (item.potSize) {
              // Normalize pot size for matching (strip D/P prefix, handle variations)
              const potNorm = (item.potSize || "").replace(/^[dDpP]\.?/, "").replace(/[^0-9.,]/g, "").replace(/^\./, "").trim();
              const uppResult = await query(
                `SELECT units_per_pallet, count(*) as cnt
                 FROM products
                 WHERE units_per_pallet > 1
                   AND REGEXP_REPLACE(REGEXP_REPLACE(pot_size, '[^0-9.,]', '', 'g'), '^\.', '', 'g') = $1
                 GROUP BY units_per_pallet
                 ORDER BY cnt DESC
                 LIMIT 1`,
                [potNorm]
              );
              if (uppResult.rows.length > 0) {
                unitsPerPallet = parseInt(uppResult.rows[0].unitsPerPallet) || 1;
              }
            }
            const qty = Number(item.quantity) || 0;
            const palletCount = Math.floor(qty / unitsPerPallet);
            const looseUnits = qty % unitsPerPallet;

            const insertResult = await query(
              `INSERT INTO products (plant_name, pot_size, plant_height_cm, purchase_price_pln, base_price_gross, price_plus, price_discount_10, price_discount_12, price_discount_15, price_discount_20, price_discount_25, vat_rate, pallet_count, loose_units, units_per_pallet, grower_passport, barcode)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
              [
                item.rawName,
                item.potSize || "",
                item.plantHeight || null,
                purchasePriceNet,
                prices.basePriceGross,
                prices.pricePlus,
                prices.priceDiscount10,
                prices.priceDiscount12,
                prices.priceDiscount15,
                prices.priceDiscount20,
                prices.priceDiscount25,
                vatRate,
                palletCount,
                looseUnits,
                unitsPerPallet,
                item.growerPassport || null,
                item.barcode || null,
              ]
            );
            productId = insertResult.rows[0].id;
            createdProducts++;

            // Record movement
            await query(
              `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, delta_pallets, reason, reference_type)
               VALUES ($1, $2, 'purchase', $3, 0, $4, 'ai_import')`,
              [productId, userId, Number(item.quantity), `Import AI: ${item.rawName}`]
            );
          }
          // If matched - increase stock
          else if (productId) {
            // Get current stock
            const productResult = await query(
              "SELECT pallet_count as \"palletCount\", loose_units as \"looseUnits\", units_per_pallet as \"unitsPerPallet\" FROM products WHERE id = $1 FOR UPDATE",
              [productId]
            );
            if (productResult.rows.length === 0) {
              results.push({ rawName: item.rawName, status: "error", error: "Produkt nie istnieje" });
              continue;
            }
            const product = productResult.rows[0];
            const unitsPerPallet = parseInt(product.unitsPerPallet) || 1;
            const currentTotal = (parseInt(product.palletCount) || 0) * unitsPerPallet + (parseInt(product.looseUnits) || 0);
            const newTotal = currentTotal + (Number(item.quantity) || 0);
            const newPallets = Math.floor(newTotal / unitsPerPallet);
            const newLoose = newTotal % unitsPerPallet;

            // Update stock + unarchive + optionally update barcode/passport
            await query(
              `UPDATE products SET pallet_count = $1, loose_units = $2, updated_at = NOW(), is_archived = false,
               barcode = COALESCE(NULLIF($4, ''), barcode),
               grower_passport = COALESCE(NULLIF($5, ''), grower_passport)
               WHERE id = $3`,
              [newPallets, newLoose, productId, item.barcode || '', item.growerPassport || '']
            );

            await query(
              `INSERT INTO inventory_movements (product_id, user_id, movement_type, delta_units, delta_pallets, reason, reference_type)
               VALUES ($1, $2, 'purchase', $3, 0, $4, 'ai_import')`,
              [productId, userId, Number(item.quantity), `Import AI: ${item.rawName}`]
            );
            updatedStock++;
          }

          // Save item to purchase_invoice_items
          if (purchaseInvoiceId) {
            const convRate = invoiceMeta?.conversionRate || 1;
            const origPrice = convRate > 0 ? (Number(item.unitPriceNet) || 0) / convRate : Number(item.unitPriceNet) || 0;
            await query(
              `INSERT INTO purchase_invoice_items (purchase_invoice_id, position, raw_name, pot_size, plant_height, quantity, unit_price_net_original, unit_price_net_pln, total_net_original, total_net_pln, vat_rate, barcode, grower_passport, matched_product_id, created_new_product, skipped)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false)`,
              [
                purchaseInvoiceId,
                item.index || 0,
                item.rawName,
                item.potSize || null,
                item.plantHeight || null,
                Number(item.quantity) || 0,
                origPrice,
                Number(item.unitPriceNet) || 0,
                origPrice * (Number(item.quantity) || 0),
                (Number(item.unitPriceNet) || 0) * (Number(item.quantity) || 0),
                item.vatRate || 0,
                item.barcode || null,
                item.growerPassport || null,
                productId || null,
                !!item.createNew,
              ]
            );
          }

          results.push({ rawName: item.rawName, status: "ok", productId });
        } catch (itemErr: any) {
          results.push({ rawName: item.rawName, status: "error", error: itemErr.message });
        }
      }

      return res.json({
        success: true,
        createdProducts,
        updatedStock,
        totalProcessed: results.filter((r) => r.status === "ok").length,
        purchaseInvoiceId,
        results,
      });
    } catch (error: any) {
      console.error("[AI Import] Confirm error:", error);
      return res.status(500).json({ error: error.message || "Błąd zatwierdzania importu" });
    }
  }

  /** GET /settings/ai-import - get AI import settings */
  static async getSettings(_req: AuthRequest, res: Response) {
    try {
      const apiKey = await SettingsModel.getSetting("openai_api_key");
      const model = await SettingsModel.getSetting("openai_model");
      const margin = await SettingsModel.getSetting("ai_import_margin");
      return res.json({
        hasApiKey: !!apiKey,
        apiKeyPreview: apiKey ? "sk-..." + apiKey.slice(-4) : "",
        model: model || "gpt-4o",
        defaultMargin: Number(margin) || 50,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /** PUT /settings/ai-import - update AI import settings */
  static async updateSettings(req: AuthRequest, res: Response) {
    try {
      const { apiKey, model, defaultMargin } = req.body;
      if (apiKey !== undefined && apiKey !== "") {
        await SettingsModel.upsertSetting("openai_api_key", apiKey, "Klucz OpenAI API do importu faktur");
      }
      if (model) {
        await SettingsModel.upsertSetting("openai_model", model, "Model OpenAI do importu");
      }
      if (defaultMargin !== undefined) {
        await SettingsModel.upsertSetting("ai_import_margin", String(defaultMargin), "Domyślna marża dla importowanych produktów (%)");
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /** GET /purchase-invoices - list all imported purchase invoices */
  static async listPurchaseInvoices(req: AuthRequest, res: Response) {
    try {
      const result = await query(
        `SELECT pi.*, u.email as imported_by_name
         FROM purchase_invoices pi
         LEFT JOIN users u ON u.id = pi.imported_by_user_id
         ORDER BY pi.created_at DESC`
      );
      return res.json(result.rows);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /** GET /purchase-invoices/:id - get purchase invoice with items */
  static async getPurchaseInvoice(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const invoiceResult = await query(
        `SELECT pi.*, u.email as imported_by_name
         FROM purchase_invoices pi
         LEFT JOIN users u ON u.id = pi.imported_by_user_id
         WHERE pi.id = $1`,
        [id]
      );
      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: "Nie znaleziono faktury zakupowej" });
      }
      const itemsResult = await query(
        `SELECT pii.*, p.plant_name as current_product_name
         FROM purchase_invoice_items pii
         LEFT JOIN products p ON p.id = pii.matched_product_id
         WHERE pii.purchase_invoice_id = $1
         ORDER BY pii.position`,
        [id]
      );
      return res.json({
        ...invoiceResult.rows[0],
        items: itemsResult.rows,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /** DELETE /purchase-invoices/:id - delete purchase invoice */
  static async deletePurchaseInvoice(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await query("DELETE FROM purchase_invoices WHERE id = $1", [id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /** POST /settings/ai-import/test - test OpenAI API connection */
  static async testConnection(_req: AuthRequest, res: Response) {
    try {
      const apiKey = await SettingsModel.getSetting("openai_api_key");
      if (!apiKey) {
        return res.status(400).json({ success: false, error: "Brak klucza API" });
      }
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Say 'OK' in JSON format" }],
        max_tokens: 10,
        response_format: { type: "json_object" },
      });
      return res.json({
        success: true,
        message: "Połączenie z OpenAI OK",
        model: "gpt-4o",
        response: response.choices[0]?.message?.content,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
