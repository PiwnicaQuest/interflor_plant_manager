import { query } from '../models/database';
import { SettingsModel } from '../models/Settings';

/**
 * Generate JPK_V7M(3) XML for a given month
 * Includes: invoices + invoice corrections (korekty)
 * Schema: https://crd.gov.pl/wzor/2025/12/19/14090/schemat.xsd
 */
export async function generateJpkV7M(year: number, month: number): Promise<string> {
  // 1. Get company settings
  const [companyName, nip, email, smtpEmail, taxOfficeCode] = await Promise.all([
    SettingsModel.getSetting('company_name'),
    SettingsModel.getSetting('company_nip'),
    SettingsModel.getSetting('company_email'),
    SettingsModel.getSetting('smtp_send_from'),
    SettingsModel.getSetting('tax_office_code'),
  ]);

  if (!nip) throw new Error('Brak NIP w ustawieniach firmy');
  if (!companyName) throw new Error('Brak nazwy firmy w ustawieniach');

  const emailAddr = email || smtpEmail || 'brak@email.pl';
  const kodUrzedu = taxOfficeCode || '1024';

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // 2. Get invoices for the month
  const invoicesResult = await query(
    `SELECT i.*,
       i.buyer_snapshot->>'nip' as buyer_nip,
       i.buyer_snapshot->>'companyName' as buyer_company,
       i.buyer_snapshot->>'firstName' as buyer_first,
       i.buyer_snapshot->>'lastName' as buyer_last,
       i.buyer_snapshot->>'country' as buyer_country,
       i.buyer_snapshot->>'vatEu' as buyer_vat_eu
     FROM invoices i
     WHERE i.invoice_type = 'invoice'
       AND i.issue_date >= $1
       AND i.issue_date < $2
     ORDER BY i.issue_date, i.id`,
    [startDate, endDate]
  );

  // 3. Get invoice items
  const itemsResult = await query(
    `SELECT ii.*, ii.invoice_id
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.invoice_type = 'invoice'
       AND i.issue_date >= $1
       AND i.issue_date < $2
     ORDER BY ii.invoice_id, ii.id`,
    [startDate, endDate]
  );

  const itemsByInvoice = new Map<number, any[]>();
  for (const item of itemsResult.rows) {
    const iid = item.invoiceId;
    if (!itemsByInvoice.has(iid)) itemsByInvoice.set(iid, []);
    itemsByInvoice.get(iid)!.push(item);
  }

  // 4. Get corrections for the month
  const correctionsResult = await query(
    `SELECT ic.*,
       ic.buyer_snapshot->>'nip' as buyer_nip,
       ic.buyer_snapshot->>'companyName' as buyer_company,
       ic.buyer_snapshot->>'firstName' as buyer_first,
       ic.buyer_snapshot->>'lastName' as buyer_last,
       ic.buyer_snapshot->>'country' as buyer_country,
       ic.buyer_snapshot->>'vatEu' as buyer_vat_eu
     FROM invoice_corrections ic
     WHERE ic.issue_date >= $1
       AND ic.issue_date < $2
     ORDER BY ic.issue_date, ic.id`,
    [startDate, endDate]
  );

  // 5. Get correction items
  const corrItemsResult = await query(
    `SELECT ci.*, ci.correction_id
     FROM invoice_correction_items ci
     JOIN invoice_corrections ic ON ic.id = ci.correction_id
     WHERE ic.issue_date >= $1
       AND ic.issue_date < $2
     ORDER BY ci.correction_id, ci.id`,
    [startDate, endDate]
  );

  const corrItemsByCorr = new Map<number, any[]>();
  for (const item of corrItemsResult.rows) {
    const cid = item.correctionId;
    if (!corrItemsByCorr.has(cid)) corrItemsByCorr.set(cid, []);
    corrItemsByCorr.get(cid)!.push(item);
  }

  // 6. Build SprzedazWiersz rows
  let podatekNalezny = 0;
  let lp = 0;
  const vatSums: Record<string, { base: number; tax: number }> = {};
  const sprzedazRows: string[] = [];

  const addVat = (rate: string, base: number, tax: number) => {
    if (!vatSums[rate]) vatSums[rate] = { base: 0, tax: 0 };
    vatSums[rate].base += base;
    vatSums[rate].tax += tax;
  };

  // --- Invoices ---
  for (const inv of invoicesResult.rows) {
    lp++;
    const items = itemsByInvoice.get(inv.id) || [];
    const buyerNip = inv.buyerNip || inv.buyerVatEu || 'BRAK';
    const buyerName = inv.buyerCompany || `${inv.buyerFirst || ''} ${inv.buyerLast || ''}`.trim() || 'BRAK';
    const isWdt = inv.transactionType === 'wdt';

    let ksefElement = '';
    if (inv.ksefReferenceNumber) {
      ksefElement = `<NrKSeF>${esc(inv.ksefReferenceNumber)}</NrKSeF>`;
    } else if (inv.ksefStatus === 'offline_saved') {
      ksefElement = '<OFF>1</OFF>';
    } else {
      ksefElement = '<BFK>1</BFK>';
    }

    const invVat: Record<string, { base: number; tax: number }> = {};
    for (const item of items) {
      const rate = isWdt ? 'wdt' : String(Math.round(Number(item.vatRate)));
      if (!invVat[rate]) invVat[rate] = { base: 0, tax: 0 };
      invVat[rate].base += Number(item.totalNet) || 0;
      invVat[rate].tax += Number(item.totalVat) || 0;
    }

    let kFields = '';
    for (const [rate, vals] of Object.entries(invVat)) {
      const base = round2(vals.base);
      const tax = round2(vals.tax);
      kFields += buildKFields(rate, base, tax);
      addVat(rate, base, tax);
      if (rate !== 'wdt' && rate !== '0') podatekNalezny += tax;
    }

    const cc = isWdt ? detectCountryCode(inv.buyerCountry, inv.buyerVatEu) : '';

    sprzedazRows.push(`
    <SprzedazWiersz>
      <LpSprzedazy>${lp}</LpSprzedazy>${cc ? `
      <KodKrajuNadaniaTIN>${cc}</KodKrajuNadaniaTIN>` : ''}
      <NrKontrahenta>${esc(buyerNip)}</NrKontrahenta>
      <NazwaKontrahenta>${esc(buyerName)}</NazwaKontrahenta>
      <DowodSprzedazy>${esc(inv.invoiceNumber)}</DowodSprzedazy>
      <DataWystawienia>${fmtDate(inv.issueDate)}</DataWystawienia>
      <DataSprzedazy>${fmtDate(inv.saleDate || inv.issueDate)}</DataSprzedazy>
      ${ksefElement}
      ${kFields}
    </SprzedazWiersz>`);
  }

  // --- Corrections ---
  for (const corr of correctionsResult.rows) {
    lp++;
    const items = corrItemsByCorr.get(corr.id) || [];
    const buyerNip = corr.buyerNip || corr.buyerVatEu || 'BRAK';
    const buyerName = corr.buyerCompany || `${corr.buyerFirst || ''} ${corr.buyerLast || ''}`.trim() || 'BRAK';

    let ksefElement = '';
    if (corr.ksefReferenceNumber) {
      ksefElement = `<NrKSeF>${esc(corr.ksefReferenceNumber)}</NrKSeF>`;
    } else if (corr.ksefStatus === 'offline_saved') {
      ksefElement = '<OFF>1</OFF>';
    } else {
      ksefElement = '<BFK>1</BFK>';
    }

    // Corrections use difference amounts (can be negative)
    // Calculate from correction items: corrected - original
    const corrVat: Record<string, { base: number; tax: number }> = {};
    for (const item of items) {
      const rate = String(Math.round(Number(item.correctedVatRate || item.originalVatRate || 8)));
      if (!corrVat[rate]) corrVat[rate] = { base: 0, tax: 0 };
      const origNet = Number(item.originalTotalNet) || 0;
      const corrNet = Number(item.correctedUnitPriceNet) * Number(item.correctedQuantity) || 0;
      const origVat = Number(item.originalTotalVat) || 0;
      const corrVatAmt = corrNet * (Number(item.correctedVatRate || item.originalVatRate || 8) / 100);
      corrVat[rate].base += round2(corrNet - origNet);
      corrVat[rate].tax += round2(corrVatAmt - origVat);
    }

    // If no items, use header differences
    if (items.length === 0) {
      const diffNet = Number(corr.differenceNet) || 0;
      const diffVat = Number(corr.differenceVat) || 0;
      corrVat['8'] = { base: diffNet, tax: diffVat };
    }

    let kFields = '';
    for (const [rate, vals] of Object.entries(corrVat)) {
      const base = round2(vals.base);
      const tax = round2(vals.tax);
      kFields += buildKFields(rate, base, tax);
      addVat(rate, base, tax);
      if (rate !== 'wdt' && rate !== '0') podatekNalezny += tax;
    }

    const cc = detectCountryCode(corr.buyerCountry, corr.buyerVatEu);

    sprzedazRows.push(`
    <SprzedazWiersz>
      <LpSprzedazy>${lp}</LpSprzedazy>${cc ? `
      <KodKrajuNadaniaTIN>${cc}</KodKrajuNadaniaTIN>` : ''}
      <NrKontrahenta>${esc(buyerNip)}</NrKontrahenta>
      <NazwaKontrahenta>${esc(buyerName)}</NazwaKontrahenta>
      <DowodSprzedazy>${esc(corr.correctionNumber)}</DowodSprzedazy>
      <DataWystawienia>${fmtDate(corr.issueDate)}</DataWystawienia>
      <DataSprzedazy>${fmtDate(corr.originalInvoiceDate || corr.issueDate)}</DataSprzedazy>
      ${ksefElement}
      ${kFields}
    </SprzedazWiersz>`);
  }

  podatekNalezny = round2(podatekNalezny);

  // 7. Build Deklaracja
  const deklaracja = buildDeklaracja(vatSums, podatekNalezny);

  // 8. Build full XML
  const now = new Date().toISOString().replace('Z', '');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://crd.gov.pl/wzor/2025/12/19/14090/" xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2025/12/19/eD/DefinicjeTypy/">
  <Naglowek>
    <KodFormularza kodSystemowy="JPK_V7M (3)" wersjaSchemy="1-0E">JPK_VAT</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaJPK>${now}</DataWytworzeniaJPK>
    <CelZlozenia poz="P_7">1</CelZlozenia>
    <KodUrzedu>${kodUrzedu}</KodUrzedu>
    <Rok>${year}</Rok>
    <Miesiac>${month}</Miesiac>
  </Naglowek>
  <Podmiot1 rola="Podatnik">
    <OsobaNiefizyczna>
      <etd:NIP>${esc(nip)}</etd:NIP>
      <etd:PelnaNazwa>${esc(companyName)}</etd:PelnaNazwa>
      <Email>${esc(emailAddr)}</Email>
    </OsobaNiefizyczna>
  </Podmiot1>
${deklaracja}
${sprzedazRows.join('')}
  <SprzedazCtrl>
    <LiczbaWierszySprzedazy>${lp}</LiczbaWierszySprzedazy>
    <PodatekNalezny>${fmt(podatekNalezny)}</PodatekNalezny>
  </SprzedazCtrl>
  <ZakupCtrl>
    <LiczbaWierszyZakupow>0</LiczbaWierszyZakupow>
    <PodatekNaliczony>0.00</PodatekNaliczony>
  </ZakupCtrl>
</JPK>`;

  return xml;
}

function buildKFields(rate: string, base: number, tax: number): string {
  if (rate === 'wdt') return `<K_21>${fmt(base)}</K_21>`;
  if (rate === '0') return `<K_13>${fmt(base)}</K_13>`;
  if (rate === '5') return `<K_15>${fmt(base)}</K_15><K_16>${fmt(tax)}</K_16>`;
  if (rate === '8') return `<K_17>${fmt(base)}</K_17><K_18>${fmt(tax)}</K_18>`;
  if (rate === '23') return `<K_19>${fmt(base)}</K_19><K_20>${fmt(tax)}</K_20>`;
  return '';
}

function buildDeklaracja(
  vatSums: Record<string, { base: number; tax: number }>,
  podatekNalezny: number
): string {
  const f: string[] = [];
  const v = (key: string) => vatSums[key] || { base: 0, tax: 0 };

  if (v('wdt').base !== 0) f.push(`      <P_21>${fmt(v('wdt').base)}</P_21>`);
  if (v('0').base !== 0) f.push(`      <P_13>${fmt(v('0').base)}</P_13>`);
  if (v('5').base !== 0) { f.push(`      <P_15>${fmt(v('5').base)}</P_15>`); f.push(`      <P_16>${fmt(v('5').tax)}</P_16>`); }
  if (v('8').base !== 0) { f.push(`      <P_17>${fmt(v('8').base)}</P_17>`); f.push(`      <P_18>${fmt(v('8').tax)}</P_18>`); }
  if (v('23').base !== 0) { f.push(`      <P_19>${fmt(v('23').base)}</P_19>`); f.push(`      <P_20>${fmt(v('23').tax)}</P_20>`); }

  const totalBase = round2(Object.values(vatSums).reduce((s, v) => s + v.base, 0));
  if (totalBase !== 0) f.push(`      <P_37>${fmt(totalBase)}</P_37>`);
  f.push(`      <P_38>${fmt(podatekNalezny)}</P_38>`);
  f.push(`      <P_51>${fmt(Math.max(0, podatekNalezny))}</P_51>`);
  f.push(`      <Pouczenia>1</Pouczenia>`);

  return `  <Deklaracja>
    <Naglowek>
      <KodFormularzaDekl kodSystemowy="VAT-7 (23)" kodPodatku="VAT" rodzajZobowiazania="Z" wersjaSchemy="1-0E">VAT-7</KodFormularzaDekl>
      <WariantFormularzaDekl>23</WariantFormularzaDekl>
    </Naglowek>
    <PozycjeSzczegolowe>
${f.join('\n')}
    </PozycjeSzczegolowe>
  </Deklaracja>`;
}

function detectCountryCode(country?: string, vatEu?: string): string {
  if (vatEu) {
    const prefix = vatEu.replace(/[^A-Z]/gi, '').substring(0, 2).toUpperCase();
    if (prefix.length === 2 && prefix !== 'PL') return prefix;
  }
  if (!country) return '';
  const map: Record<string, string> = {
    'niemcy': 'DE', 'germany': 'DE', 'deutschland': 'DE',
    'francja': 'FR', 'france': 'FR', 'czechy': 'CZ', 'czech': 'CZ',
    'holandia': 'NL', 'netherlands': 'NL', 'belgia': 'BE', 'belgium': 'BE',
    'wlochy': 'IT', 'italy': 'IT', 'italia': 'IT', 'hiszpania': 'ES', 'spain': 'ES',
    'austria': 'AT', 'slowacja': 'SK', 'slovakia': 'SK', 'litwa': 'LT', 'lithuania': 'LT',
    'wegry': 'HU', 'hungary': 'HU', 'rumunia': 'RO', 'romania': 'RO',
    'dania': 'DK', 'denmark': 'DK', 'szwecja': 'SE', 'sweden': 'SE',
  };
  return map[country.toLowerCase()] || '';
}

function esc(s: string): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fmt(n: number): string { return n.toFixed(2); }
function fmtDate(d: any): string { if (!d) return ''; return new Date(d).toISOString().split('T')[0]; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

export default generateJpkV7M;
