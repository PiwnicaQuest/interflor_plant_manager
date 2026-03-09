import { SettingsModel } from "../models/Settings";
import { InvoiceWithItems, InvoiceItem, CustomerSnapshot } from "../types";

const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const FA3_XSD = "http://crd.gov.pl/wzor/2025/06/25/13775/schemat.xsd";

type KsefVatRate = "23" | "22" | "8" | "7" | "5" | "4" | "3" | "0" | "zw" | "oo" | "np";

function mapVatRate(rate: number, transactionType?: string): KsefVatRate {
  if (transactionType === "wdt" || transactionType === "export") return "0";
  if (rate === 0) return "zw";
  const rateStr = rate.toString();
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
    existing.netTotal += item.totalNet;
    existing.vatTotal += item.totalVat;
    existing.grossTotal += item.totalGross;
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

  // Buyer identifier
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
    buyerIdXml = `<NrVatUE><KodKraju>${escXml(prefix)}</KodKraju><NrVatUE>${escXml(number)}</NrVatUE></NrVatUE>`;
  } else {
    buyerIdXml = `<BrakID>1</BrakID>`;
  }

  const buyerName = buyer.companyName || [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || "Brak danych";

  // Payment method: 1=gotowka, 2=karta, 6=przelew
  const paymentMethodMap: Record<string, string> = { cash: "1", card: "2", transfer: "6" };
  const ksefPaymentMethod = paymentMethodMap[invoice.paymentMethod || "transfer"] || "6";

  // Invoice line items
  let itemsXml = "";
  invoice.items.forEach((item, index) => {
    const rate = mapVatRate(item.vatRate, transactionType);
    itemsXml += `
        <FaWiersz>
          <NrWierszaFa>${index + 1}</NrWierszaFa>
          <P_7>${escXml(item.description.substring(0, 512))}</P_7>
          <P_8A>szt.</P_8A>
          <P_8B>${item.quantity}</P_8B>
          <P_9A>${formatAmount(item.unitPriceNet)}</P_9A>
          <P_11>${formatAmount(item.totalNet)}</P_11>
          <P_12>${rate}</P_12>${item.vatRate === 0 && transactionType === "domestic" ? "\n          <P_12_XII>1</P_12_XII>" : ""}
        </FaWiersz>`;
  });

  // VAT summary fields
  let vatSummaryXml = "";
  const rateFieldMap: Record<string, [string, string]> = {
    "23": ["P_13_1", "P_14_1"],
    "22": ["P_13_2", "P_14_2"],
    "8": ["P_13_3", "P_14_3"],
    "7": ["P_13_4", "P_14_4"],
    "5": ["P_13_5", "P_14_5"],
    "0": ["P_13_6_1", "P_14_6"],
    "4": ["P_13_7", "P_14_7"],
    "3": ["P_13_8", "P_14_8"],
  };
  for (const vs of vatSummaries) {
    const fields = rateFieldMap[vs.rate];
    if (fields) {
      vatSummaryXml += `\n    <${fields[0]}>${formatAmount(vs.netTotal)}</${fields[0]}>`;
      vatSummaryXml += `\n    <${fields[1]}>${formatAmount(vs.vatTotal)}</${fields[1]}>`;
    } else if (vs.rate === "zw") {
      vatSummaryXml += `\n    <P_13_9>${formatAmount(vs.netTotal)}</P_13_9>`;
    }
  }

  // WDT/export annotations
  let annotations = "";
  if (transactionType === "wdt") annotations = "\n    <P_18A>1</P_18A>";
  else if (transactionType === "export") annotations = "\n    <P_19A>1</P_19A>";

  // Payment deadline
  let paymentXml = "";
  if (invoice.paymentDeadline) {
    paymentXml = `\n    <TerminPlatnosci>\n      <Termin>${formatDate(invoice.paymentDeadline)}</Termin>\n    </TerminPlatnosci>`;
  }

  // Bank account
  let bankXml = "";
  if (company.bankAccount) {
    const cleanAccount = company.bankAccount.replace(/[^0-9]/g, "");
    if (cleanAccount.length >= 26) {
      bankXml = `\n    <NrKontaBankowego>${escXml(cleanAccount)}</NrKontaBankowego>`;
    }
  }

  // Buyer country code
  let buyerCountryCode = "PL";
  if (transactionType !== "domestic" && buyer.vatEu) {
    buyerCountryCode = buyer.vatEu.substring(0, 2).toUpperCase();
  }

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
    </Adres>${company.email ? `\n    <Email>${escXml(company.email)}</Email>` : ""}${company.phone ? `\n    <Telefon>${escXml(company.phone)}</Telefon>` : ""}
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      ${buyerIdXml}
      <Nazwa>${escXml(buyerName)}</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>${buyerCountryCode}</KodKraju>
      <AdresL1>${escXml(buyer.street || "")}</AdresL1>
      <AdresL2>${escXml(buyer.postalCode || "")} ${escXml(buyer.city || "")}</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${issueDate}</P_1>
    <P_1M>${saleDate}</P_1M>
    <P_2>${escXml(invoice.invoiceNumber)}</P_2>
    <RodzajFaktury>${invoiceType}</RodzajFaktury>${vatSummaryXml}
    <P_15>${formatAmount(invoice.totalGross)}</P_15>${annotations}${paymentXml}
    <FormaPlatnosci>${ksefPaymentMethod}</FormaPlatnosci>${bankXml}${itemsXml}
  </Fa>
</Faktura>`;

  return { xml, invoiceNumber: invoice.invoiceNumber, issueDate };
}
