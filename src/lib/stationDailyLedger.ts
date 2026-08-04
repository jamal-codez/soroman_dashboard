import { format, parseISO } from 'date-fns';

/**
 * One row per calendar day for a filling station, with stock carried forward:
 * each day's opening stock is the previous day's closing balance.
 *
 * Callers must pass the station's FULL history — filtering to a date range
 * before this point makes the first row open at zero instead of carrying the
 * balance in. Filter the returned rows instead.
 */

export type LedgerPaymentLike = {
  date_of_payment?: string | null;
  date_loaded?: string | null;
  quantity?: unknown;
  payment_amount?: unknown;
  expenses_amount?: unknown;
  sales_value?: unknown;
  payer_name?: string | null;
  bank?: string | null;
  remarks?: string | null;
};

export type LedgerGroupLike = {
  dateLoaded?: string | null;
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

type LedgerGroup = LedgerGroupLike;

export function buildStationDailyLedger(groups: LedgerGroup[]): DailyLedgerRow[] {
  type LedgerEvent = {
    date: string;
    kind: 'allocation' | 'sale' | 'deposit' | 'expense';
    qty?: number;
    salesValue?: number;
    amount?: number;
    payer?: string;
    bank?: string;
    remarks?: string;
  };
  const events: LedgerEvent[] = [];

  groups.forEach(group => {
    let allocDate = 'unknown';
    try { if (group.dateLoaded) allocDate = format(parseISO(group.dateLoaded), 'yyyy-MM-dd'); } catch { /* noop */ }
    if (group.quantity > 0) {
      events.push({
        date: allocDate,
        kind: 'allocation',
        qty: group.quantity,
        remarks: `Truck ${group.truckNumber || '—'} allocated ${group.quantity.toLocaleString()}L${group.code ? ` (${group.code})` : ''}`,
      });
    }

    group.payments.forEach(p => {
      const evDateRaw = p.date_of_payment || p.date_loaded;
      let evDate = 'unknown';
      try { if (evDateRaw) evDate = format(parseISO(evDateRaw), 'yyyy-MM-dd'); } catch { /* noop */ }

      const qty = toNum(p.quantity);
      const deposit = toNum(p.payment_amount);
      const expense = toNum(p.expenses_amount ?? 0);

      if (qty > 0) {
        events.push({ date: evDate, kind: 'sale', qty, salesValue: toNum(p.sales_value), remarks: p.remarks || '' });
      }
      if (deposit > 0) {
        events.push({ date: evDate, kind: 'deposit', amount: deposit, payer: p.payer_name, bank: p.bank, remarks: p.remarks || '' });
      }
      if (expense > 0) {
        events.push({ date: evDate, kind: 'expense', amount: expense, remarks: p.remarks || 'Expense' });
      }
    });
  });

  const byDate = new Map<string, LedgerEvent[]>();
  events.forEach(e => {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  });

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });

  const rows: Array<{
    date: string; openingStock: number; volumeSold: number; rate: number; salesValue: number;
    closingStock: number; expense: number; deposited: number; depositor: string; bank: string; remarks: string;
  }> = [];
  let runningStock = 0;

  sortedDates.forEach(date => {
    const dayEvents = byDate.get(date)!;
    const opening = runningStock;

    const allocQty = dayEvents.filter(e => e.kind === 'allocation').reduce((s, e) => s + (e.qty || 0), 0);
    const sales = dayEvents.filter(e => e.kind === 'sale');
    const deposits = dayEvents.filter(e => e.kind === 'deposit');
    const expenses = dayEvents.filter(e => e.kind === 'expense');

    const soldQty = sales.reduce((s, e) => s + (e.qty || 0), 0);
    const salesValue = sales.reduce((s, e) => s + (e.salesValue || 0), 0);
    const rate = soldQty > 0 ? salesValue / soldQty : 0;
    const expenseTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const depositTotal = deposits.reduce((s, e) => s + (e.amount || 0), 0);

    runningStock = opening + allocQty - soldQty;

    const depositorNames = Array.from(new Set(deposits.map(e => (e.payer || '').trim()).filter(Boolean)));
    const bankNames = Array.from(new Set(deposits.map(e => (e.bank || '').trim()).filter(Boolean)));
    const remarksParts = dayEvents.map(e => e.remarks).filter((r): r is string => Boolean(r && r.trim()));

    rows.push({
      date,
      openingStock: opening,
      volumeSold: soldQty,
      rate,
      salesValue,
      closingStock: runningStock,
      expense: expenseTotal,
      deposited: depositTotal,
      depositor: depositorNames.join('; ') || '—',
      bank: bankNames.join('; ') || '—',
      remarks: remarksParts.join(' | ') || '—',
    });
  });

  return rows;
}
