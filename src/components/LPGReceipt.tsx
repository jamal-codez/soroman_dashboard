import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// Fields a printable LPG sale receipt needs — both the Sales Register's
// LPGSale type and this component share this shape.
export interface LPGReceiptSale {
  id: number;
  plant_name?: string | null;
  plant_code?: string | null;
  date: string;
  customer_name?: string | null;
  kg: string | number;
  price_per_kg: string | number;
  invoice_number?: string | null;
  is_bulk?: boolean;
  bulk_discount_per_kg?: string | number | null;
  payment_method?: string;
  cashier_name?: string | null;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtN = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
const fmtMoney = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
};
const fmtDateTime = () => format(new Date(), 'dd MMM yyyy, HH:mm');

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', transfer: 'Bank Transfer', pos: 'POS', credit: 'Credit',
};

/** The actual printable slip — narrow, thermal-receipt proportions rather
 * than a full A4 invoice. Isolated from the rest of the page at print time
 * via the #lpg-receipt-print id targeted in the injected @media print rules. */
function ReceiptSlip({ sale }: { sale: LPGReceiptSale }) {
  const kg = toNum(sale.kg);
  const price = toNum(sale.price_per_kg);
  const amount = kg * price;

  return (
    <div
      id="lpg-receipt-print"
      className="mx-auto bg-white text-slate-900 font-mono text-[12px] leading-snug"
      style={{ width: '72mm', padding: '10px 12px' }}
    >
      <div className="text-center space-y-0.5 mb-2">
        <p className="font-bold text-[14px] tracking-wide">SOROMAN ENERGY</p>
        <p className="text-[10px] text-slate-500">LPG DIVISION</p>
        <p className="text-[11px] font-semibold">{sale.plant_name || '—'}</p>
      </div>
      <div className="border-t border-dashed border-slate-400 my-1.5" />
      <div className="flex justify-between"><span>Receipt No.</span><span className="font-bold">{sale.invoice_number || '—'}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{fmtDate(sale.date)}</span></div>
      {sale.customer_name && (
        <div className="flex justify-between gap-2"><span className="shrink-0">Customer</span><span className="text-right truncate">{sale.customer_name}</span></div>
      )}
      <div className="border-t border-dashed border-slate-400 my-1.5" />
      <div className="flex justify-between"><span>Qty</span><span>{fmtN(kg)} kg</span></div>
      <div className="flex justify-between"><span>Price / kg</span><span>{fmtMoney(price)}</span></div>
      {sale.is_bulk && (
        <div className="flex justify-between text-slate-500"><span>Bulk buyer</span>
          <span>{sale.bulk_discount_per_kg ? `-${fmtMoney(toNum(sale.bulk_discount_per_kg))}/kg` : 'yes'}</span>
        </div>
      )}
      <div className="border-t border-dashed border-slate-400 my-1.5" />
      <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{fmtMoney(amount)}</span></div>
      <div className="border-t border-dashed border-slate-400 my-1.5" />
      {sale.payment_method && (
        <div className="flex justify-between"><span>Payment</span><span>{PAYMENT_LABELS[sale.payment_method] || sale.payment_method}</span></div>
      )}
      {sale.cashier_name && (
        <div className="flex justify-between"><span>Cashier</span><span>{sale.cashier_name}</span></div>
      )}
      <div className="text-center mt-3 space-y-0.5">
        <p className="text-[11px] font-semibold">Thank you for your patronage</p>
        <p className="text-[9px] text-slate-400">{fmtDateTime()}</p>
      </div>
    </div>
  );
}

export function LPGReceiptDialog({
  sale, open, onClose,
}: { sale: LPGReceiptSale | null; open: boolean; onClose: () => void }) {
  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[380px]">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #lpg-receipt-print, #lpg-receipt-print * { visibility: visible; }
            #lpg-receipt-print { position: fixed; top: 0; left: 0; }
            @page { size: 80mm auto; margin: 4mm; }
          }
        `}</style>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Printer className="w-5 h-5 text-emerald-600" /></div>
            <h2 className="text-lg font-semibold">Receipt {sale.invoice_number}</h2>
          </DialogTitle>
          <DialogDescription className="sr-only">Printable sale receipt</DialogDescription>
        </DialogHeader>

        <div className="border border-dashed border-slate-300 rounded-md bg-slate-50 py-3">
          <ReceiptSlip sale={sale} />
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={onClose}>
            <X size={13} /> Close
          </Button>
          <Button size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
