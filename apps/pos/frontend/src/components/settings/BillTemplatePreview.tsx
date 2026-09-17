import { Sale, SaleItem, Settings } from '../../types';
import { ReceiptLanguage, ReceiptTemplateName } from '../../utils/printAgent';

// Normalized shape both the Settings gallery (sample data) and the real
// post-sale receipt (POS.tsx's ReceiptModal) render through — a single
// source of truth for what each template looks like, so the on-screen bill
// always matches whichever template is actually selected instead of POS.tsx
// keeping its own separate, template-blind layout.
export interface ReceiptItemData {
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  barcode?: string;
  taxes?: { name: string; rate: number; amount: number }[];
}

export interface ReceiptData {
  number: string;
  date: Date;
  customerName?: string;
  isCredit?: boolean;
  items: ReceiptItemData[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cashTendered?: number;
  change?: number;
  vatRegNo?: string;
  loyaltyRedeemed?: number;
  loyaltyEarned?: number;
}

// Maps a real completed sale into the same shape the preview renderer
// consumes — this is what makes the on-screen receipt and the Settings
// preview provably the same code path, not just visually similar.
export function saleToReceiptData(sale: Sale, items: SaleItem[]): ReceiptData {
  return {
    number: sale.sale_number,
    date: new Date(sale.created_at),
    customerName: sale.customer_name,
    isCredit: sale.payment_method === 'credit',
    items: items.map((item) => ({
      name: item.product_name,
      qty: item.quantity,
      price: item.unit_price,
      subtotal: item.subtotal,
      barcode: item.barcode,
      taxes: item.taxes?.map((t) => ({ name: t.tax_name, rate: t.tax_rate, amount: t.tax_amount })),
    })),
    subtotal: sale.subtotal,
    discount: sale.discount_amount,
    tax: sale.tax_amount,
    total: sale.total_amount,
    cashTendered: sale.cash_tendered,
    change: sale.change_amount,
    loyaltyRedeemed: sale.loyalty_redeemed,
    loyaltyEarned: sale.loyalty_earned,
  };
}

// Mirrors the printed labels in utils/receiptTemplates.ts so the on-screen
// preview reads exactly like the paper receipt would — kept as a small,
// display-only duplicate rather than importing that module, since these are
// pure UI strings and the real templates build raw ESC/POS bytes, not HTML.
interface Labels {
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  cashTendered: string;
  change: string;
  credit: string;
  paymentCredit: string;
  thankYou: string;
  thankYouShort: string;
  thankYouWarm: string;
  customer: string;
  barcode: string;
  taxInvoice: string;
  invoiceNo: string;
  vatReg: string;
  billTo: string;
  qtyPriceAmount: string;
  signature: string;
  defaultBusinessName: string;
  loyaltyRedeemed: string;
  loyaltyEarned: string;
}

const LABELS: Record<ReceiptLanguage, Labels> = {
  en: {
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'TOTAL',
    cashTendered: 'Cash Tendered',
    change: 'Change',
    credit: 'CREDIT / PAY LATER',
    paymentCredit: 'Credit (Pay Later)',
    thankYou: 'Thank you! Please come again.',
    thankYouShort: 'Thank you!',
    thankYouWarm: 'Thank you for shopping with us!',
    customer: 'Customer:',
    barcode: 'Barcode:',
    taxInvoice: 'TAX INVOICE',
    invoiceNo: 'Invoice No.',
    vatReg: 'VAT Reg:',
    billTo: 'Bill to:',
    qtyPriceAmount: 'Qty x Price',
    signature: 'Authorized Signature',
    defaultBusinessName: 'BloomPOS',
    loyaltyRedeemed: 'Loyalty Redeemed',
    loyaltyEarned: 'Loyalty Earned',
  },
  si: {
    subtotal: 'උප එකතුව',
    discount: 'වට්ටම',
    tax: 'බදු',
    total: 'මුළු එකතුව',
    cashTendered: 'ලැබූ මුදල',
    change: 'ඉතිරිය',
    credit: 'ණයට / පසුව ගෙවීම',
    paymentCredit: 'ණයට (පසුව ගෙවීම)',
    thankYou: 'ස්තුතියි! නැවත එන්න.',
    thankYouShort: 'ස්තුතියි!',
    thankYouWarm: 'අප සමඟ සාප්පු සවාරි කිරීම ගැන ස්තුතියි!',
    customer: 'පාරිභෝගිකයා:',
    barcode: 'බාර්කෝඩ්:',
    taxInvoice: 'බදු ඉන්වොයිසිය',
    invoiceNo: 'ඉන්වොයිස් අංකය',
    vatReg: 'බදු ලියාපදිංචි අංකය:',
    billTo: 'බිල්පත ලබන්නා:',
    qtyPriceAmount: 'ප්‍රමාණය x මිල',
    signature: 'බලයලත් අත්සන',
    defaultBusinessName: 'BloomPOS',
    loyaltyRedeemed: 'ලෝයල්ටි වට්ටම',
    loyaltyEarned: 'ලැබුණු ලෝයල්ටිය',
  },
};

const amount = (settings: Settings | null, n: number): string => {
  const code = settings?.currency_code || 'USD';
  return `${code} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Fixed sample sale used purely to render what each layout looks like when
// no real sale is passed in (the Settings gallery) — never sent anywhere,
// no relation to real sales data.
export const SAMPLE_RECEIPT_DATA: ReceiptData = {
  number: '1042',
  date: new Date(),
  customerName: 'Nadeesha Perera',
  items: [
    { name: 'House Blend Coffee 250g', qty: 2, price: 850, subtotal: 1700, barcode: '4791234567890', taxes: [{ name: 'VAT', rate: 8, amount: 136 }] },
    { name: 'Butter Croissant', qty: 3, price: 250, subtotal: 750, barcode: '4791234567906', taxes: [{ name: 'VAT', rate: 8, amount: 60 }] },
    { name: 'Bottled Water 500ml', qty: 1, price: 120, subtotal: 120, barcode: '4791234567913' },
  ],
  subtotal: 2570,
  discount: 100,
  tax: 196,
  total: 2666,
  cashTendered: 3000,
  change: 334,
  loyaltyEarned: 0.67,
};

type Row =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; big?: boolean; muted?: boolean }
  | { kind: 'two'; left: string; right: string; bold?: boolean }
  | { kind: 'hr'; style?: 'dashed' | 'solid' | 'dotted' }
  | { kind: 'space' };

const businessName = (settings: Settings | null, L: Labels) =>
  (settings?.setup_completed && settings.business_name) || L.defaultBusinessName;

const header = (settings: Settings | null, big: boolean, L: Labels): Row[] => {
  const rows: Row[] = [{ kind: 'text', text: businessName(settings, L), align: 'center', bold: true, big }];
  if (settings?.setup_completed && settings.address) rows.push({ kind: 'text', text: settings.address, align: 'center' });
  if (settings?.setup_completed && settings.phone) rows.push({ kind: 'text', text: settings.phone, align: 'center' });
  return rows;
};

const meta = (data: ReceiptData, L: Labels, withCustomer: boolean): Row[] => {
  const rows: Row[] = [
    { kind: 'text', text: `#${data.number}`, align: 'center' },
    { kind: 'text', text: data.date.toLocaleString(), align: 'center' },
  ];
  if (data.isCredit) rows.push({ kind: 'text', text: L.credit, align: 'center', bold: true });
  if (withCustomer && data.customerName) rows.push({ kind: 'two', left: L.customer, right: data.customerName });
  return rows;
};

const totals = (data: ReceiptData, settings: Settings | null, L: Labels): Row[] => {
  const rows: Row[] = [
    { kind: 'two', left: L.subtotal, right: amount(settings, data.subtotal) },
  ];
  if (data.discount > 0) rows.push({ kind: 'two', left: L.discount, right: `-${amount(settings, data.discount)}` });
  if (data.tax > 0) rows.push({ kind: 'two', left: L.tax, right: amount(settings, data.tax) });
  // Applied after subtotal/discount/tax — data.total already has this
  // subtracted, so it's its own line rather than folded into "Discount".
  if (data.loyaltyRedeemed) rows.push({ kind: 'two', left: L.loyaltyRedeemed, right: `-${amount(settings, data.loyaltyRedeemed)}` });
  rows.push({ kind: 'hr' }, { kind: 'two', left: L.total, right: amount(settings, data.total), bold: true });
  if (data.isCredit) {
    rows.push({ kind: 'two', left: '', right: L.paymentCredit });
  } else {
    if (data.cashTendered) rows.push({ kind: 'two', left: L.cashTendered, right: amount(settings, data.cashTendered) });
    if (data.change) rows.push({ kind: 'two', left: L.change, right: amount(settings, data.change) });
  }
  // What this purchase just added to their loyalty balance — separate from
  // whatever they redeemed above, shown regardless of payment method.
  if (data.loyaltyEarned) rows.push({ kind: 'two', left: L.loyaltyEarned, right: `+${amount(settings, data.loyaltyEarned)}` });
  return rows;
};

function rowsStandard(data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, true, L), { kind: 'space' }, ...meta(data, L, true), { kind: 'hr' }];
  for (const item of data.items) {
    rows.push({ kind: 'text', text: item.name });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, item.subtotal) });
  }
  rows.push({ kind: 'hr' }, ...totals(data, settings, L), { kind: 'space' }, { kind: 'text', text: L.thankYou, align: 'center' });
  return rows;
}

function rowsCompact(data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, false, L), ...meta(data, L, true), { kind: 'hr' }];
  for (const item of data.items) {
    rows.push({ kind: 'two', left: `${item.qty}x ${item.name}`, right: amount(settings, item.subtotal) });
  }
  rows.push({ kind: 'hr' }, ...totals(data, settings, L), { kind: 'text', text: L.thankYouShort, align: 'center' });
  return rows;
}

function rowsDetailed(data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [...header(settings, true, L), ...meta(data, L, true), { kind: 'hr' }];
  for (const item of data.items) {
    rows.push({ kind: 'text', text: item.name });
    if (item.barcode) rows.push({ kind: 'text', text: `  ${L.barcode} ${item.barcode}`, muted: true });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, item.subtotal) });
    for (const tax of item.taxes || []) {
      rows.push({ kind: 'two', left: `    ${tax.name} (${tax.rate}%)`, right: amount(settings, tax.amount) });
    }
  }
  rows.push(
    { kind: 'hr' },
    ...totals(data, settings, L),
    { kind: 'space' },
    { kind: 'text', text: L.thankYouWarm, align: 'center' },
    { kind: 'text', text: 'Goods once sold cannot be returned', align: 'center', muted: true },
  );
  return rows;
}

function rowsMinimal(data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [
    { kind: 'text', text: businessName(settings, L), align: 'center', bold: true },
    { kind: 'text', text: `#${data.number}  ${data.date.toLocaleDateString()}`, align: 'center' },
    { kind: 'hr', style: 'dotted' },
  ];
  for (const item of data.items) {
    rows.push({ kind: 'two', left: `${item.qty}x ${item.name}`, right: amount(settings, item.subtotal) });
  }
  rows.push({ kind: 'hr', style: 'dotted' }, { kind: 'two', left: L.total, right: amount(settings, data.total), bold: true });
  return rows;
}

function rowsFormal(data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  const rows: Row[] = [
    { kind: 'text', text: businessName(settings, L), align: 'center', bold: true, big: true },
    { kind: 'text', text: L.taxInvoice, align: 'center', bold: true },
  ];
  if (settings?.setup_completed && settings.address) rows.push({ kind: 'text', text: settings.address, align: 'center' });
  if (settings?.setup_completed && settings.phone) rows.push({ kind: 'text', text: settings.phone, align: 'center' });
  rows.push({ kind: 'two', left: L.vatReg, right: settings?.vat_registration_number || data.vatRegNo || 'VAT-000123456' });
  rows.push({ kind: 'hr', style: 'solid' });
  rows.push({ kind: 'two', left: L.invoiceNo, right: `#${data.number}` });
  rows.push({ kind: 'text', text: data.date.toLocaleString() });
  if (data.customerName) rows.push({ kind: 'two', left: L.billTo, right: data.customerName });
  rows.push({ kind: 'hr', style: 'solid' });
  rows.push({ kind: 'text', text: L.qtyPriceAmount, bold: true });
  rows.push({ kind: 'hr' });
  for (const item of data.items) {
    rows.push({ kind: 'text', text: item.name });
    rows.push({ kind: 'two', left: `  ${item.qty} x ${amount(settings, item.price)}`, right: amount(settings, item.subtotal) });
    for (const tax of item.taxes || []) {
      rows.push({ kind: 'two', left: `    ${tax.name} (${tax.rate}%)`, right: amount(settings, tax.amount) });
    }
  }
  rows.push({ kind: 'hr', style: 'solid' }, ...totals(data, settings, L), { kind: 'space' });
  rows.push({ kind: 'text', text: '________________________', align: 'center' });
  rows.push({ kind: 'text', text: L.signature, align: 'center' });
  return rows;
}

function rowsFor(template: ReceiptTemplateName, data: ReceiptData, settings: Settings | null, L: Labels): Row[] {
  if (template === 'compact') return rowsCompact(data, settings, L);
  if (template === 'detailed') return rowsDetailed(data, settings, L);
  if (template === 'minimal') return rowsMinimal(data, settings, L);
  if (template === 'formal') return rowsFormal(data, settings, L);
  return rowsStandard(data, settings, L);
}

export const TEMPLATE_INFO: { id: ReceiptTemplateName; name: string; blurb: string }[] = [
  { id: 'standard', name: 'Standard', blurb: 'Balanced default — header, itemized list, totals.' },
  { id: 'compact', name: 'Compact', blurb: 'One line per item — less paper per sale.' },
  { id: 'detailed', name: 'Detailed', blurb: 'Adds barcodes and per-item tax breakdown.' },
  { id: 'minimal', name: 'Minimal', blurb: 'Bare essentials only — fastest, least paper.' },
  { id: 'formal', name: 'Formal (Tax Invoice)', blurb: 'VAT invoice layout with a signature line.' },
];

function Line({ row }: { row: Row }) {
  if (row.kind === 'hr') {
    const style = row.style === 'solid' ? 'border-black/70' : row.style === 'dotted' ? 'border-dotted border-black/50' : 'border-dashed border-black/40';
    return <div className={`border-t my-1 ${style}`} />;
  }
  if (row.kind === 'space') return <div className="h-1.5" />;
  if (row.kind === 'two') {
    return (
      <div className={`flex justify-between gap-2 ${row.bold ? 'font-bold' : ''}`}>
        <span className="break-words">{row.left}</span>
        <span className="shrink-0 whitespace-nowrap">{row.right}</span>
      </div>
    );
  }
  return (
    <div
      className={[
        'break-words',
        row.align === 'center' ? 'text-center' : 'text-left',
        row.bold ? 'font-bold' : '',
        row.big ? 'text-[13px]' : '',
        row.muted ? 'text-black/50' : '',
      ].join(' ')}
    >
      {row.text}
    </div>
  );
}

interface ReceiptPreviewProps {
  template: ReceiptTemplateName;
  settings: Settings | null;
  language: ReceiptLanguage;
  // Omitted (the Settings template gallery): renders the fixed sample sale.
  // Passed (POS.tsx's post-sale ReceiptModal): renders the real sale, so
  // the on-screen bill is provably the same layout as what gets printed.
  data?: ReceiptData;
}

export function ReceiptPreview({ template, settings, language, data }: ReceiptPreviewProps) {
  const L = LABELS[language];
  const rows = rowsFor(template, data || SAMPLE_RECEIPT_DATA, settings, L);
  return (
    <div className="bg-white text-black font-mono text-[11.5px] leading-[1.55] px-3 py-3.5 rounded-sm">
      {rows.map((row, i) => (
        <Line key={i} row={row} />
      ))}
    </div>
  );
}
