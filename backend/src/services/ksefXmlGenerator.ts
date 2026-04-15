import { SettingsModel } from "../models/Settings";
import { InvoiceWithItems, InvoiceItem, CustomerSnapshot } from "../types";

const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const FA3_XSD = "http://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd";

type KsefVatRate = "23" | "22" | "8" | "7" | "5" | "4" | "3" | "0 KR" | "0 WDT" | "0 EX" | "zw" | "oo" | "np I" | "np II";

function mapVatRate(rate: number | string, transactionType?: string): KsefVatRate {
  const numRate = Math.round(Number(rate));
  if (transactionType === "wdt") return "0 WDT";
  if (transactionType === "export") return "0 EX";
  if (numRate === 0) return "zw";
  const rateStr = numRate.toString();
  if (["23", "22", "8", "7", "5", "4", "3"].includes(rateStr)) return rateStr as KsefVatRate;
  return "23";
}

function escXml(str: string | undefined | null): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

function formatAmount(num: number | string): string {
  return parseFloat(String(num)).toFixed(2);
}

function getKsefInvoiceType(invoice: InvoiceWithItems): string {
  if ((invoice as any).correctionNumber) return "KOR";
  return "VAT";
}

interface VatSummary {
  rate: KsefVatRate;
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
}

function calculateVatSummaries(items: InvoiceItem[], transactionType?: string): VatSummary[] {
  const groups = new Map<string, VatSummary>();
  for (const item of items) {
    const rate = mapVatRate(item.vatRate, transactionType);
    const existing = groups.get(rate) || { rate, netTotal: 0, vatTotal: 0, grossTotal: 0 };
    existing.netTotal += Number(item.totalNet) || 0;
    existing.vatTotal += Number(item.totalVat) || 0;
    existing.grossTotal += Number(item.totalGross) || 0;
    groups.set(rate, existing);
  }
  return Array.from(groups.values()).map(g => ({
    ...g,
    netTotal: Math.round(g.netTotal * 100) / 100,
    vatTotal: Math.round(g.vatTotal * 100) / 100,
    grossTotal: Math.round(g.grossTotal * 100) / 100,
  }));
}

export interface KsefXmlResult {
  xml: string;
  invoiceNumber: string;
  issueDate: string;
}

export async function generateKsefXml(invoice: InvoiceWithItems): Promise<KsefXmlResult> {
  const company = await SettingsModel.getCompanySettings();
  const buyer = invoice.buyerSnapshot;
  const invoiceType = getKsefInvoiceType(invoice);
  const transactionType = invoice.transactionType || "domestic";
  const vatSummaries = calculateVatSummaries(invoice.items, transactionType);
  const issueDate = formatDate(invoice.issueDate);
  const saleDate = formatDate(invoice.saleDate);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // === Podmiot1 - DaneKontaktowe ===
  let podmiot1KontaktXml = "";
  if (company.email || company.phone) {
    podmiot1KontaktXml = `
    <DaneKontaktowe>${company.email ? `
      <Email>${escXml(company.email)}</Email>` : ""}${company.phone ? `
      <Telefon>${escXml(company.phone)}</Telefon>` : ""}
    </DaneKontaktowe>`;
  }

  // === Podmiot2 - DaneIdentyfikacyjne ===
  let buyerIdXml = "";
  if (buyer.nip && !buyer.vatEu) {
    const cleanNip = buyer.nip.replace(/[^0-9]/g, "");
    if (/^\d{10}$/.test(cleanNip)) {
      buyerIdXml = `<NIP>${escXml(cleanNip)}</NIP>`;
    } else {
      buyerIdXml = `<BrakID>1</BrakID>`;
    }
  } else if (buyer.vatEu) {
    const prefix = buyer.vatEu.substring(0, 2).toUpperCase();
    const number = buyer.vatEu.substring(2).replace(/[^0-9A-Za-z]/g, "");
    buyerIdXml = `<KodUE>${escXml(prefix)}</KodUE>
        <NrVatUE>${escXml(number)}</NrVatUE>`;
  } else {
    buyerIdXml = `<BrakID>1</BrakID>`;
  }

  const buyerName = buyer.companyName || [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || "Brak danych";

  // Podmiot2 - Adres (optional, include only if we have data)
  let buyerCountryCode = "PL";
  if (transactionType !== "domestic" && buyer.vatEu) {
    buyerCountryCode = buyer.vatEu.substring(0, 2).toUpperCase();
  }

  let buyerAdresXml = "";
  if (buyer.street || buyer.city) {
    buyerAdresXml = `
    <Adres>
      <KodKraju>${buyerCountryCode}</KodKraju>
      <AdresL1>${escXml(buyer.street || "")}</AdresL1>${(buyer.postalCode || buyer.city) ? `
      <AdresL2>${escXml((buyer.postalCode || "") + " " + (buyer.city || "")).trim()}</AdresL2>` : ""}
    </Adres>`;
  }

  // === Podmiot3 - Recipient (delivery address) ===
  let podmiot3Xml = "";
  const recipient = invoice.recipientSnapshot;
  if (recipient && (recipient.companyName || recipient.firstName || recipient.lastName || recipient.street || recipient.city)) {
    const recipientName = recipient.companyName || [recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Odbiorca";
    let recipientIdXml = "";
    if (recipient.nip) {
      const cleanNip = recipient.nip.replace(/[^0-9]/g, "");
      if (/^\d{10}$/.test(cleanNip)) {
        recipientIdXml = `<NIP>${escXml(cleanNip)}</NIP>`;
      } else {
        recipientIdXml = `<BrakID>1</BrakID>`;
      }
    } else {
      recipientIdXml = `<BrakID>1</BrakID>`;
    }
    let recipientAdresXml = "";
    if (recipient.street || recipient.city) {
      recipientAdresXml = `
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml(recipient.street || "")}</AdresL1>${(recipient.postalCode || recipient.city) ? `
      <AdresL2>${escXml((recipient.postalCode || "") + " " + (recipient.city || "")).trim()}</AdresL2>` : ""}
    </Adres>`;
    }
    podmiot3Xml = `
  <Podmiot3>
    <DaneIdentyfikacyjne>
      ${recipientIdXml}
      <Nazwa>${escXml(recipientName)}</Nazwa>
    </DaneIdentyfikacyjne>${recipientAdresXml}
    <Rola>2</Rola>
  </Podmiot3>`;
  }

  // === Fa - FaWiersz (line items) ===
  let itemsXml = "";
  invoice.items.forEach((item, index) => {
    const rate = mapVatRate(item.vatRate, transactionType);
    itemsXml += `
      <FaWiersz>
        <NrWierszaFa>${index + 1}</NrWierszaFa>
        <P_7>${escXml(item.description.substring(0, 512))}</P_7>
        <P_8A>szt.</P_8A>
        <P_8B>${Number(item.quantity)}</P_8B>
        <P_9A>${(() => { const q = Number(item.quantity); const net = Number(item.totalNet); const raw = net / q; const r2 = parseFloat(raw.toFixed(2)); return (r2 * q).toFixed(2) === net.toFixed(2) ? r2.toFixed(2) : raw.toFixed(8).replace(/0+$/, '').replace(/[.]$/, '.00'); })()}</P_9A>
        <P_11>${formatAmount(item.totalNet)}</P_11>
        <P_12>${rate}</P_12>
      </FaWiersz>`;
  });

  // === Fa - VAT summary fields (P_13_x / P_14_x) ===
  // FA(3) field mapping per broszura:
  // 23%/22% -> P_13_1/P_14_1, 8%/7% -> P_13_2/P_14_2, 5% -> P_13_3/P_14_3
  // 0% KR -> P_13_6_1, 0% WDT -> P_13_6_2, 0% EX -> P_13_6_3
  // zw -> P_13_7
  const summaryFieldMap: Record<string, { netField: string; vatField?: string }> = {
    "23":    { netField: "P_13_1", vatField: "P_14_1" },
    "22":    { netField: "P_13_1", vatField: "P_14_1" },
    "8":     { netField: "P_13_2", vatField: "P_14_2" },
    "7":     { netField: "P_13_2", vatField: "P_14_2" },
    "5":     { netField: "P_13_3", vatField: "P_14_3" },
    "0 KR":  { netField: "P_13_6_1" },
    "0 WDT": { netField: "P_13_6_2" },
    "0 EX":  { netField: "P_13_6_3" },
    "zw":    { netField: "P_13_7" },
  };

  // Aggregate summaries that map to same fields (e.g. 23%+22% -> P_13_1)
  const aggregated = new Map<string, { net: number; vat: number }>();
  for (const vs of vatSummaries) {
    const mapping = summaryFieldMap[vs.rate];
    if (!mapping) continue;
    const key = mapping.netField;
    const existing = aggregated.get(key) || { net: 0, vat: 0 };
    existing.net += vs.netTotal;
    existing.vat += vs.vatTotal;
    aggregated.set(key, existing);
  }

  // Emit fields in schema order
  let vatSummaryXml = "";
  const orderedFields = [
    { netField: "P_13_1", vatField: "P_14_1" },
    { netField: "P_13_2", vatField: "P_14_2" },
    { netField: "P_13_3", vatField: "P_14_3" },
    { netField: "P_13_6_1" },
    { netField: "P_13_6_2" },
    { netField: "P_13_6_3" },
    { netField: "P_13_7" },
  ];

  for (const field of orderedFields) {
    const data = aggregated.get(field.netField);
    if (!data) continue;
    vatSummaryXml += `\n      <${field.netField}>${formatAmount(data.net)}</${field.netField}>`;
    if (field.vatField && data.vat !== 0) {
      vatSummaryXml += `\n      <${field.vatField}>${formatAmount(data.vat)}</${field.vatField}>`;
    }
  }

  // === Fa - Adnotacje (obligatory in FA(3)) ===
  // P_16=2 (nie metoda kasowa), P_17=2 (nie samofakturowanie),
  // P_18=2 (nie odwrotne obciazenie), P_18A=2 (nie split payment)
  const adnotacjeXml = `
      <Adnotacje>
        <P_16>2</P_16>
        <P_17>2</P_17>
        <P_18>2</P_18>
        <P_18A>2</P_18A>
        <Zwolnienie>
          <P_19N>1</P_19N>
        </Zwolnienie>
        <NoweSrodkiTransportu>
          <P_22N>1</P_22N>
        </NoweSrodkiTransportu>
        <P_23>2</P_23>
        <PMarzy>
          <P_PMarzyN>1</P_PMarzyN>
        </PMarzy>
      </Adnotacje>`;

  // === Fa - Platnosc (optional but recommended) ===
  const paymentMethodMap: Record<string, string> = { cash: "1", card: "2", transfer: "6" };
  const ksefPaymentMethod = paymentMethodMap[invoice.paymentMethod || "transfer"] || "6";

  let platnoscXml = "\n      <Platnosc>";

  // Zaplacono - if invoice is fully paid at issue time
  const paidAmount = Number(invoice.paidAmount) || 0;
  const totalGross = Number(invoice.totalGross) || 0;
  if (paidAmount >= totalGross && totalGross > 0) {
    platnoscXml += `
        <Zaplacono>1</Zaplacono>
        <DataZaplaty>${formatDate(invoice.issueDate)}</DataZaplaty>`;
  }

  if (invoice.paymentDeadline) {
    platnoscXml += `
        <TerminPlatnosci>
          <Termin>${formatDate(invoice.paymentDeadline)}</Termin>
        </TerminPlatnosci>`;
  }

  platnoscXml += `
        <FormaPlatnosci>${ksefPaymentMethod}</FormaPlatnosci>`;

  if (company.bankAccount) {
    const cleanAccount = company.bankAccount.replace(/[^0-9]/g, "");
    if (cleanAccount.length >= 26) {
      platnoscXml += `
        <RachunekBankowy>
          <NrRB>${escXml(cleanAccount)}</NrRB>
        </RachunekBankowy>`;
    }
  }

  platnoscXml += "\n      </Platnosc>";

  // === Build full XML ===
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="${FA3_NAMESPACE}"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="${FA3_NAMESPACE} ${FA3_XSD}">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${now}</DataWytworzeniaFa>
    <SystemInfo>PlantManager</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${escXml(company.nip.replace(/[^0-9]/g, ""))}</NIP>
      <Nazwa>${escXml(company.companyName)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>${escXml(company.street)}</AdresL1>
      <AdresL2>${escXml(company.postalCode)} ${escXml(company.city)}</AdresL2>
    </Adres>${podmiot1KontaktXml}
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${buyerIdXml}
      <Nazwa>${escXml(buyerName)}</Nazwa>
    </DaneIdentyfikacyjne>${buyerAdresXml}
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>${podmiot3Xml}
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${issueDate}</P_1>
    <P_2>${escXml(invoice.invoiceNumber)}</P_2>
    <P_6>${saleDate}</P_6>${vatSummaryXml}
    <P_15>${formatAmount(invoice.totalGross)}</P_15>${adnotacjeXml}
    <RodzajFaktury>${invoiceType}</RodzajFaktury>${itemsXml}${platnoscXml}
  </Fa>
</Faktura>`;

  return { xml, invoiceNumber: invoice.invoiceNumber, issueDate };
}
