/**
 * ESC/POS receipt generator - generates raw printer commands
 * XPrinter XP-410B compatible
 */

// ESC/POS commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

function cmd(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

function text(s: string): Buffer {
  // Convert to CP852 (Central European) for Polish chars
  // Fallback: strip diacritics
  const map: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  };
  let result = '';
  for (const ch of s) {
    result += map[ch] || ch;
  }
  return Buffer.from(result, 'ascii');
}

function init(): Buffer { return cmd(ESC, 0x40); } // ESC @
function cut(): Buffer { return cmd(GS, 0x56, 0x00); } // GS V 0 - full cut
function feed(n: number): Buffer { return cmd(ESC, 0x64, n); } // ESC d n
function bold(on: boolean): Buffer { return cmd(ESC, 0x45, on ? 1 : 0); } // ESC E n
function doubleHeight(on: boolean): Buffer { return cmd(ESC, 0x21, on ? 0x10 : 0x00); } // ESC ! n
function doubleWidth(on: boolean): Buffer { return cmd(GS, 0x21, on ? 0x10 : 0x00); } // GS ! n
function bigFont(on: boolean): Buffer { return cmd(ESC, 0x21, on ? 0x30 : 0x00); } // double w+h
function alignCenter(): Buffer { return cmd(ESC, 0x61, 1); } // ESC a 1
function alignLeft(): Buffer { return cmd(ESC, 0x61, 0); } // ESC a 0
function alignRight(): Buffer { return cmd(ESC, 0x61, 2); } // ESC a 2
function line(): Buffer { return Buffer.from('--------------------------------\n'); }
function doubleLine(): Buffer { return Buffer.from('================================\n'); }
function newline(): Buffer { return Buffer.from('\n'); }

function leftRight(left: string, right: string, width: number = 32): Buffer {
  const space = width - left.length - right.length;
  if (space < 1) return text(left.substring(0, width - right.length) + right + '\n');
  return text(left + ' '.repeat(space) + right + '\n');
}

export interface EscPosReceiptData {
  title: string;
  invoiceNumber: string;
  issueDate: string;
  saleDate?: string;
  seller: { name: string; street: string; postalCode: string; city: string; nip: string; };
  buyer: { name: string; street?: string; postalCode?: string; city?: string; nip?: string; vatEu?: string; };
  items: Array<{ name: string; qty: number; price: number; total: number; discount?: number; origPrice?: number; }>;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  paymentMethod: string;
  paymentDeadline?: string;
  bankName?: string;
  bankAccount?: string;
  ksefStatus?: string;
  ksefRef?: string;
  discountTotal?: number;
  discountBefore?: number;
}

export function generateEscPosReceipt(data: EscPosReceiptData): Buffer {
  const parts: Buffer[] = [];

  parts.push(init());

  // Title
  parts.push(alignCenter());
  parts.push(bigFont(true));
  parts.push(text(data.title + '\n'));
  parts.push(bigFont(false));
  parts.push(doubleLine());

  // Invoice number + date
  parts.push(bold(true));
  parts.push(text(data.invoiceNumber + '\n'));
  parts.push(bold(false));
  parts.push(text('Data: ' + data.issueDate + '\n'));
  if (data.saleDate && data.saleDate !== data.issueDate) {
    parts.push(text('Sprzedaz: ' + data.saleDate + '\n'));
  }

  // Seller
  parts.push(line());
  parts.push(alignLeft());
  parts.push(bold(true));
  parts.push(text('SPRZEDAWCA:\n'));
  parts.push(bold(false));
  parts.push(text(data.seller.name + '\n'));
  parts.push(text(data.seller.street + '\n'));
  parts.push(text(data.seller.postalCode + ' ' + data.seller.city + '\n'));
  parts.push(text('NIP: ' + data.seller.nip + '\n'));

  // Buyer
  parts.push(line());
  parts.push(bold(true));
  parts.push(text('NABYWCA:\n'));
  parts.push(bold(false));
  parts.push(text(data.buyer.name + '\n'));
  if (data.buyer.street) parts.push(text(data.buyer.street + '\n'));
  if (data.buyer.postalCode || data.buyer.city) {
    parts.push(text((data.buyer.postalCode || '') + ' ' + (data.buyer.city || '') + '\n'));
  }
  if (data.buyer.vatEu) parts.push(text('VAT-EU: ' + data.buyer.vatEu + '\n'));
  else if (data.buyer.nip) parts.push(text('NIP: ' + data.buyer.nip + '\n'));

  // Items
  parts.push(line());
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    parts.push(bold(true));
    parts.push(text((i + 1) + '. ' + item.name + '\n'));
    parts.push(bold(false));
    parts.push(leftRight(
      '  ' + item.qty + ' x ' + item.price.toFixed(2),
      item.total.toFixed(2) + ' zl'
    ));
    if (item.discount && item.discount > 0 && item.origPrice) {
      parts.push(text('  ' + item.origPrice.toFixed(2) + ' -> -' + item.discount.toFixed(0) + '%\n'));
    }
  }

  // Discount summary
  if (data.discountTotal && data.discountTotal > 0) {
    parts.push(line());
    parts.push(bold(true));
    parts.push(text('RABAT: -' + data.discountTotal.toFixed(2) + ' zl'));
    if (data.discountBefore) parts.push(text(' (przed: ' + data.discountBefore.toFixed(2) + ')'));
    parts.push(newline());
    parts.push(bold(false));
  }

  // Totals
  parts.push(line());
  parts.push(leftRight('Netto:', data.totalNet.toFixed(2) + ' zl'));
  parts.push(leftRight('VAT:', data.totalVat.toFixed(2) + ' zl'));
  parts.push(doubleLine());
  parts.push(bigFont(true));
  parts.push(leftRight('RAZEM:', data.totalGross.toFixed(2) + ' zl'));
  parts.push(bigFont(false));
  parts.push(doubleLine());

  // Payment
  const payLabel = data.paymentMethod === 'cash' ? 'Gotowka' : data.paymentMethod === 'card' ? 'Karta' : 'Przelew';
  parts.push(leftRight('Platnosc:', payLabel));
  if (data.paymentDeadline) {
    parts.push(leftRight('Termin:', data.paymentDeadline));
  }

  // Bank
  if (data.bankAccount) {
    parts.push(line());
    parts.push(bold(true));
    parts.push(text((data.bankName || 'Bank') + '\n'));
    parts.push(bold(false));
    parts.push(text(data.bankAccount + '\n'));
  }

  // KSeF status
  if (data.ksefStatus) {
    parts.push(line());
    parts.push(alignCenter());
    parts.push(bold(true));
    const statusLabel = data.ksefStatus === 'accepted' ? 'PRZYJETA DO KSeF' : 'OCZEKUJE NA KSeF';
    parts.push(text(statusLabel + '\n'));
    parts.push(bold(false));
    if (data.ksefRef) {
      parts.push(text(data.ksefRef + '\n'));
    }
  }

  // Footer
  parts.push(line());
  parts.push(alignCenter());
  parts.push(text('Krajowy System e-Faktur\n'));
  parts.push(text('Dokument elektroniczny\n'));

  parts.push(feed(4));
  parts.push(cut());

  return Buffer.concat(parts);
}
