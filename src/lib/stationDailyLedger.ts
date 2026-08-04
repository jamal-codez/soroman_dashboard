import { format, parseISO } from 'date-fns';

/**
 * Daily stock ledger for ONE truck allocation (one entry).
 *
 * An allocation is a self-contained batch: the truck lands with a quantity,
 * and that quantity IS the opening stock on day one. Each day's sales are
 * deducted, and the closing balance becomes the next day's opening — right
 * through to the end of the batch.
 *
 *     allocated 34,000 → day 1 opens 34,000, sells 2,000, closes 32,000
 *                        day 2 opens 32,000 …
 *
 * Balances never restart at zero and never carry across allocations: each
 * entry stands alone, which is how the stations are actually reconciled.
 */

export type LedgerPaymentLike = {
  date_of_payment?: string | null;
  date_loaded?: string | null;
  quantity?: unknown;
  rate?: unknown;
  sales_value?: unknown;
  payment_amount?: unknown;
  expenses_amount?: unknown;
  payer_name?: string | null;
  bank?: string | null;
  remarks?: string | null;
};

export type LedgerGroupLike = {
  dateLoaded?: string | null;
  /** Litres allocated to this entry — the opening balance on day one. */
  quantity: number;
  truckNumber?: string | null;
  code?: string | null;
  payments: LedgerPaymentLike[];
};

export type DailyLedgerRow = {
  date: string;
  openingStock: number;
  volumeSold: number;
  rate: number;
  salesValue: number;
  closingStock: number;
  expense: number;
  deposited: number;
  depositor: string;
  bank: string;
  remarks: string;
};

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const asDate = (raw: unknown): string => {
  const s = raw ? String(raw) : '';
  if (!s) return 'unknown';
  try { return format(parseISO(s), 'yyyy-MM-dd'); } catch { return 'unknown'; }
};

type LedgerEvent = {
  date: string;
  kind: 'sale' | 'deposit' | 'expense';
  qty?: number;
  salesValue?: number;
  amount?: number;
  payer?: string;
  bank?: string;
  remarks?: string;
};

/** Daily rows for a single allocation entry, opening at its allocated quantity. */
export function buildAllocationLedger(group: LedgerGroupLike): DailyLedgerRow[] {
  const allocated = toNum(group.quantity);
  const loadDate = asDate(group.dateLoaded);
  const events: LedgerEvent[] = [];

  group.payments.forEach(p => {
    const date = asDate(p.date_of_payment || p.date_loaded);
    const qty = toNum(p.quantity);
    const salesValue = toNum(p.sales_value);
    const rate = toNum(p.rate);
    const deposit = toNum(p.payment_amount);
    const expense = toNum(p.expenses_amount ?? 0);

    // The allocation itself is also stored as a row carrying the full loaded
    // quantity but no rate and no sales value. It is the opening balance, not
    // a sale — counting it as one cancels the allocation out entirely.
    if (qty > 0 && (salesValue > 0 || rate > 0)) {
      events.push({ date, kind: 'sale', qty, salesValue, remarks: p.remarks || '' });
    }
    if (deposit > 0) {
      events.push({ date, kind: 'deposit', amount: deposit, payer: p.payer_name || '', bank: p.bank || '', remarks: p.remarks || '' });
    }
    if (expense > 0) {
      events.push({ date, kind: 'expense', amount: expense, remarks: p.remarks || 'Expense' });
    }
  });

  const byDate = new Map<string, LedgerEvent[]>();
  events.forEach(e => {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  });

  const dates = Array.from(byDate.keys()).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });

  // A batch with nothing recorded yet still deserves a row, so the allocation
  // is visible rather than the entry appearing empty.
  if (dates.length === 0) {
    return [{
      date: loadDate,
      openingStock: allocated,
      volumeSold: 0,
      rate: 0,
      salesValue: 0,
      closingStock: allocated,
      expense: 0,
      deposited: 0,
      depositor: '—',
      bank: '—',
      remarks: allocated > 0 ? `Allocated ${allocated.toLocaleString()}L — no sales recorded yet` : '—',
    }];
  }

  const rows: DailyLedgerRow[] = [];
  let runningStock = allocated;   // day one opens at the allocated quantity

  dates.forEach(date => {
    const dayEvents = byDate.get(date)!;
    const opening = runningStock;

    const sales = dayEvents.filter(e => e.kind === 'sale');
    const deposits = dayEvents.filter(e => e.kind === 'deposit');
    const expenses = dayEvents.filter(e => e.kind === 'expense');

    const soldQty = sales.reduce((s, e) => s + (e.qty || 0), 0);
    const salesValue = sales.reduce((s, e) => s + (e.salesValue || 0), 0);

    runningStock = opening - soldQty;

    rows.push({
      date,
      openingStock: opening,
      volumeSold: soldQty,
      rate: soldQty > 0 ? salesValue / soldQty : 0,
      salesValue,
      closingStock: runningStock,
      expense: expenses.reduce((s, e) => s + (e.amount || 0), 0),
      deposited: deposits.reduce((s, e) => s + (e.amount || 0), 0),
      depositor: Array.from(new Set(deposits.map(e => (e.payer || '').trim()).filter(Boolean))).join('; ') || '—',
      bank: Array.from(new Set(deposits.map(e => (e.bank || '').trim()).filter(Boolean))).join('; ') || '—',
      remarks: dayEvents.map(e => e.remarks).filter((r): r is string => Boolean(r && r.trim())).join(' | ') || '—',
    });
  });

  return rows;
}
