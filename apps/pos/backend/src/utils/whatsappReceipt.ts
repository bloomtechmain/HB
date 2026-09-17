import { Sale, SaleItem, Settings } from '../types';

const amount = (settings: Settings, n: number): string => {
  const symbol = settings.currency_symbol || settings.currency_code || '';
  return `${symbol} ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Plain-text WhatsApp receipt — *asterisks* render as bold in WhatsApp's own
// text formatting. Deliberately not the printed ESC/POS/HTML layout (see
// receiptTemplates.ts / BillTemplatePreview.tsx on the frontend); this is a
// standalone text message built server-side, where there's no browser/canvas
// to render an image or PDF.
export function buildWhatsappReceiptText(sale: Sale, items: SaleItem[], settings: Settings): string {
  const lines: string[] = [];

  lines.push(`*${settings.business_name || 'Receipt'}*`);
  lines.push(`Receipt #${sale.sale_number}`);
  lines.push(new Date(sale.created_at).toLocaleString());
  lines.push('');

  for (const item of items) {
    lines.push(`${item.quantity} x ${item.product_name} — ${amount(settings, item.subtotal)}`);
  }

  lines.push('');
  lines.push(`Subtotal: ${amount(settings, sale.subtotal)}`);
  if (Number(sale.discount_amount) > 0) lines.push(`Discount: -${amount(settings, sale.discount_amount)}`);
  if (Number(sale.tax_amount) > 0) lines.push(`Tax: ${amount(settings, sale.tax_amount)}`);
  // Applied after subtotal/discount/tax (see sales.service.ts's createSale)
  // — total_amount below already has this subtracted.
  if (Number(sale.loyalty_redeemed || 0) > 0) lines.push(`Loyalty Redeemed: -${amount(settings, sale.loyalty_redeemed!)}`);
  lines.push(`*TOTAL: ${amount(settings, sale.total_amount)}*`);
  if (sale.payment_method === 'credit') {
    lines.push('Credit (Pay Later)');
  } else {
    if (Number(sale.cash_tendered) > 0) lines.push(`Cash Tendered: ${amount(settings, sale.cash_tendered)}`);
    if (Number(sale.change_amount) > 0) lines.push(`Change: ${amount(settings, sale.change_amount)}`);
  }
  // What this purchase just added to their loyalty balance — separate from
  // whatever they redeemed above, shown regardless of payment method.
  if (Number(sale.loyalty_earned || 0) > 0) lines.push(`Loyalty Earned: +${amount(settings, sale.loyalty_earned!)}`);

  lines.push('');
  lines.push('Thank you for shopping with us!');

  return lines.join('\n');
}
