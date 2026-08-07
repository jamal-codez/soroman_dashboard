import ExcelJS from 'exceljs';
import { format } from 'date-fns';

/**
 * Styled PFI workbooks — one PFI in full detail, or every PFI at a glance.
 *
 * Both share the house report look used by the finance/payments exports: navy
 * title bar, navy column headers, zebra-striped bordered body rows, and a
 * shaded totals row.
 */

// ── Palette ──────────────────────────────────────────────────────────────────
const NAVY = 'FF1E293B';
const SLATE = 'FF334155';
const WHITE = 'FFFFFFFF';
const LIGHT = 'FFF5F8FC';
const BAND = 'FFEFF3F8';
const TOTAL_FILL = 'FFE2E8F0';
const BORDER_COLOR = 'FFB0C4DE';
const GREEN = 'FF047857';
const RED = 'FFB91C1C';
const AMBER_FILL = 'FFFEF3C7';

const thin = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

type Align = 'left' | 'center' | 'right';

/**
 * Amounts and quantities are written as real numbers carrying an Excel number
 * format, not pre-formatted strings — so the recipient can sum, sort and pivot
 * them. Unknown values stay as the "—" string.
 */
type NumericCell = { n: number; fmt: string };
type CellValue = string | NumericCell;

const MONEY_FMT = '"N"#,##0.00';
const QTY_FMT = '#,##0.##';
const PCT_FMT = '0.0%';

const isNumeric = (v: CellValue): v is NumericCell =>
  typeof v === 'object' && v !== null && 'n' in v;

// ── Value helpers ────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Present-but-unknown values read as "—" rather than a misleading zero. */
const has = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

const money = (v: unknown): CellValue => (has(v) ? { n: num(v), fmt: MONEY_FMT } : '—');
const qty = (v: unknown): CellValue => (has(v) ? { n: num(v), fmt: QTY_FMT } : '—');
const pct = (part: number, whole: number): CellValue =>
  whole > 0 ? { n: part / whole, fmt: PCT_FMT } : '—';
const text = (v: unknown): string => (has(v) ? String(v) : '—');

/** Formatted money for interpolation into a sentence (titles, subtitles). */
const moneyText = (v: unknown): string =>
  has(v) ? `N${num(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

/** Write a value into a cell, applying its number format when it is numeric. */
function putValue(cell: ExcelJS.Cell, value: CellValue) {
  if (isNumeric(value)) {
    cell.value = value.n;
    cell.numFmt = value.fmt;
  } else {
    cell.value = value;
  }
}

const dateOnly = (v: unknown): string => {
  if (!has(v)) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : format(d, 'dd MMM yyyy');
};

const dateTime = (v: unknown): string => {
  if (!has(v)) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : format(d, 'dd MMM yyyy, HH:mm');
};

/** PFI numbers carry slashes; shorten and strip them for use in a file name. */
const shortLabel = (raw: string): string =>
  raw.replace(/[\\/*?:[\]]/g, '-').slice(0, 40) || 'PFI';

const safeFileName = (raw: string): string => raw.replace(/[\\/*?:[\]"<>|]/g, '-').trim();

// ── Sheet primitives ─────────────────────────────────────────────────────────

/** Full-width navy title bar. Returns the next free row index. */
function titleBar(ws: ExcelJS.Worksheet, row: number, span: number, title: string, subtitle?: string): number {
  const lastCol = ws.getColumn(span).letter;

  ws.mergeCells(`A${row}:${lastCol}${row}`);
  const cell = ws.getCell(`A${row}`);
  cell.value = title.toUpperCase();
  cell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 28;
  row += 1;

  if (subtitle) {
    ws.mergeCells(`A${row}:${lastCol}${row}`);
    const sub = ws.getCell(`A${row}`);
    sub.value = subtitle;
    sub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFCBD5E1' } };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    sub.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 16;
    row += 1;
  }

  return row;
}

/** Section band — a slate strip introducing a block of facts or a table. */
function sectionBar(ws: ExcelJS.Worksheet, row: number, span: number, label: string): number {
  const lastCol = ws.getColumn(span).letter;
  ws.mergeCells(`A${row}:${lastCol}${row}`);
  const cell = ws.getCell(`A${row}`);
  cell.value = label.toUpperCase();
  cell.font = { name: 'Calibri', bold: true, size: 10.5, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 20;
  return row + 1;
}

/**
 * Label/value facts laid out as pairs across the sheet — two pairs per row on
 * wide sheets so the block reads as a grid rather than one long thin column.
 */
function factGrid(
  ws: ExcelJS.Worksheet,
  row: number,
  facts: Array<[string, CellValue]>,
  pairsPerRow: number,
  emphasis: Record<string, string> = {},
): number {
  for (let i = 0; i < facts.length; i += pairsPerRow) {
    const chunk = facts.slice(i, i + pairsPerRow);
    const xlRow = ws.getRow(row);
    xlRow.height = 18;

    chunk.forEach(([label, value], j) => {
      const labelCell = xlRow.getCell(j * 2 + 1);
      labelCell.value = label.toUpperCase();
      labelCell.font = { name: 'Calibri', bold: true, size: 9.5, color: { argb: 'FF1E3A5F' } };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      labelCell.border = allBorders;
      labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      const valueCell = xlRow.getCell(j * 2 + 2);
      putValue(valueCell, value);
      valueCell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: !!emphasis[label],
        color: { argb: emphasis[label] || 'FF0F172A' },
      };
      valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
      valueCell.border = allBorders;
      valueCell.alignment = {
        vertical: 'middle',
        horizontal: isNumeric(value) ? 'right' : 'left',
        indent: 1,
      };
    });

    row += 1;
  }
  return row;
}

/** Navy column-header row. */
function headerRow(ws: ExcelJS.Worksheet, row: number, headers: string[]): number {
  const xlRow = ws.getRow(row);
  xlRow.height = 24;
  headers.forEach((h, i) => {
    const cell = xlRow.getCell(i + 1);
    cell.value = h.toUpperCase();
    cell.font = { name: 'Calibri', bold: true, size: 9.5, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.border = allBorders;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  return row + 1;
}

/** Zebra-striped bordered body rows. */
function bodyRows(
  ws: ExcelJS.Worksheet,
  row: number,
  rows: CellValue[][],
  align: Align[],
  highlight?: (rowIndex: number) => string | undefined,
): number {
  rows.forEach((values, idx) => {
    const xlRow = ws.getRow(row);
    xlRow.height = 16;
    const fill = highlight?.(idx) || (idx % 2 === 0 ? WHITE : BAND);
    values.forEach((value, ci) => {
      const cell = xlRow.getCell(ci + 1);
      putValue(cell, value);
      cell.font = { name: 'Calibri', size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.border = allBorders;
      cell.alignment = { vertical: 'middle', horizontal: align[ci] || 'left', indent: 1 };
    });
    row += 1;
  });
  return row;
}

/** Shaded, bold totals row. */
function totalsRow(ws: ExcelJS.Worksheet, row: number, values: CellValue[], align: Align[]): number {
  const xlRow = ws.getRow(row);
  xlRow.height = 19;
  values.forEach((value, ci) => {
    const cell = xlRow.getCell(ci + 1);
    putValue(cell, value);
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    cell.border = allBorders;
    cell.alignment = { vertical: 'middle', horizontal: align[ci] || 'left', indent: 1 };
  });
  return row + 1;
}

function setWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName(fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PfiSummaryData {
  id: number;
  pfi_number: string;
  location_name?: string | null;
  product_name?: string | null;
  product_unit_label?: string | null;
  status: string;
  pfi_date?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  notes?: string | null;
  allowed_location_names?: string[];
  qty_volume_mt?: string | number | null;
  vessel_name?: string | null;
  vessel_broker?: string | null;
  surveyor_name?: string | null;
  surveyor_phone?: string | null;
  starting_qty_litres?: string | number | null;
  bl_qty_litres?: string | number | null;
  bl_qty_mt?: string | number | null;
  price_per_litre?: string | number | null;
  surplus_deficit_litres?: string | number | null;
  pfi_value?: string | number | null;
  total_expenses?: string | number | null;
  pending_expenses?: string | number | null;
  pending_expense_count?: number | null;
  total_cost?: string | number | null;
  credit_balance?: string | number | null;
  grand_total_cost?: string | number | null;
  landing_cost_per_litre?: string | number | null;
  revenue?: string | number | null;
  profit_loss?: string | number | null;
  sold_qty_litres?: string | number | null;
  remaining_qty_litres?: string | number | null;
  orders_count?: number | null;
  total_quantity_litres?: string | number | null;
  total_amount?: string | number | null;
  delivery_allocated_qty?: string | number | null;
  marketing_person_name?: string | null;
  finance_person_name?: string | null;
  sales_manager_name?: string | null;
  audit_officer_name?: string | null;
  product_officer_name?: string | null;
  it_compliance_officer_name?: string | null;
  security_exit_officer_name?: string | null;
  commission_officer_name?: string | null;
  closure_date?: string | null;
  total_inflow?: string | number | null;
  closure_bank?: string | null;
  purchase_cost?: string | number | null;
  aggregate_expenses?: string | number | null;
  closure_handler?: string | null;
  closure_remarks?: string | null;
}

export interface PfiReportPaymentRecord {
  payment_date: string | null;
  amount: string;
  payer_name: string;
  bank_name: string;
  account_number: string;
  transaction_reference: string;
  notes: string;
}

export interface PfiReportPayment {
  order_id: number;
  reference: string;
  order_date: string | null;
  payment_confirmed_at: string | null;
  status: string;
  truck_number: string;
  driver_name: string;
  customer_name: string;
  company_name: string;
  location_name: string;
  product_name: string;
  unit_label: string;
  quantity: string;
  unit_price: string | null;
  total_price: string;
  amount_paid: string;
  balance: string;
  payment_confirmed_by: string | null;
  narration: string;
  from_records: boolean;
  payment_records: PfiReportPaymentRecord[];
}

export interface PfiReportExpense {
  id: number;
  date: string;
  category_name: string | null;
  vendor: string;
  description: string;
  bank_paid_from: string;
  amount: string;
  added_by_name: string | null;
}

export interface PfiReport {
  pfi: PfiSummaryData;
  expenses: PfiReportExpense[];
  payments: PfiReportPayment[];
  payment_totals: {
    orders_count: number;
    total_quantity: string;
    total_sales_value: string;
    total_paid: string;
    total_balance: string;
  };
  generated_at: string;
}

// ── Single-PFI workbook ──────────────────────────────────────────────────────

const SUMMARY_SPAN = 6;

function buildSummarySheet(wb: ExcelJS.Workbook, report: PfiReport) {
  const p = report.pfi;
  const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  setWidths(ws, [26, 30, 26, 30, 26, 30]);

  const unit = p.product_unit_label || 'Litres';
  let row = titleBar(
    ws, 1, SUMMARY_SPAN,
    `PFI Report — ${p.pfi_number}`,
    // `Generated ${format(new Date(report.generated_at || Date.now()), 'dd MMM yyyy, HH:mm')}`,
  );
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'PFI Details');
  row = factGrid(ws, row, [
    ['PFI Number', text(p.pfi_number)],
    ['Status', text(p.status).toUpperCase()],
    ['Location', text(p.location_name)],
    ['Product', text(p.product_name)],
    ['PFI Date', dateOnly(p.pfi_date)],
    ['Created', dateTime(p.created_at)],
    ['Date Completed', dateTime(p.finished_at)],
    ['Quantity (MT)', qty(p.qty_volume_mt)],
    ['Vessel Name', text(p.vessel_name)],
    ['Vessel Broker', text(p.vessel_broker)],
    ['Surveyor', text(p.surveyor_name)],
    ['Surveyor Phone', text(p.surveyor_phone)],
    // ['Allowed Locations', p.allowed_location_names?.length ? p.allowed_location_names.join(', ') : 'Any'],
    // ['Notes', text(p.notes)],
  ], 3);
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'BL Figures');
  row = factGrid(ws, row, [
    [`BL Quantity (${unit})`, qty(p.bl_qty_litres)],
    ['BL Quantity (MT)', qty(p.bl_qty_mt)],
    ['Price per Litre', money(p.price_per_litre)],
    ['PFI Value', money(p.pfi_value)],
  ], 3, { 'PFI Value': NAVY });
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'Tank Figures');
  row = factGrid(ws, row, [
    [`Tank Quantity (${unit})`, qty(p.starting_qty_litres)],
    [`Surplus/Deficit (${unit})`, qty(p.surplus_deficit_litres)],
    ['Reading', has(p.surplus_deficit_litres) ? (num(p.surplus_deficit_litres) >= 0 ? 'SURPLUS' : 'DEFICIT') : '—'],
  ], 3, {
    'Reading': has(p.surplus_deficit_litres) && num(p.surplus_deficit_litres) < 0 ? RED : GREEN,
  });
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'Stock Movement');
  const startingQty = num(p.starting_qty_litres);
  const soldQty = num(p.sold_qty_litres);
  row = factGrid(ws, row, [
    [`Initial Stock (${unit})`, qty(p.starting_qty_litres)],
    [`Total Sold (${unit})`, qty(p.sold_qty_litres)],
    [`Remaining (${unit})`, qty(p.remaining_qty_litres)],
    ['Percentage Sold', pct(soldQty, startingQty)],
    ['Orders', qty(p.orders_count)],
    [`Delivery Allocated (${unit})`, qty(p.delivery_allocated_qty)],
  ], 3);
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'Financial Summary');
  const pl = p.profit_loss;
  row = factGrid(ws, row, [
    ['PFI (Cargo) Value', money(p.pfi_value)],
    ['Total Expenses (approved)', money(p.total_expenses)],
    ['Awaiting Approval', money(p.pending_expenses)],
    ['Total Cost', money(p.total_cost)],
    // Credit taken back against the cargo, then the net cost after it. Landing
    // cost, profit and margin below all derive from the grand total.
    ['Credit Balance', money(p.credit_balance)],
    ['Grand Total Cost', money(p.grand_total_cost)],
    ['Landing Cost / Litre', money(p.landing_cost_per_litre)],
    ['Revenue', money(p.revenue)],
    [has(pl) && num(pl) < 0 ? 'Balance' : 'Profit', money(pl)],
    ['Margin', has(pl) ? pct(num(pl), num(p.revenue)) : '—'],
  ], 3, {
    'Grand Total Cost': NAVY,
    'Landing Cost / Litre': NAVY,
    'Awaiting Approval': '#B45309',
    'Credit Balance': GREEN,
    'Revenue': GREEN,
    'Profit': GREEN,
    'Balance': RED,
  });
  row += 1;

  row = sectionBar(ws, row, SUMMARY_SPAN, 'People');
  row = factGrid(ws, row, [
    ['Marketing', text(p.marketing_person_name)],
    ['Finance', text(p.finance_person_name)],
    ['Sales Manager', text(p.sales_manager_name)],
    ['Audit Officer', text(p.audit_officer_name)],
    ['Product Officer', text(p.product_officer_name)],
    ['IT Compliance', text(p.it_compliance_officer_name)],
    ['Security Exit', text(p.security_exit_officer_name)],
    ['Commission Officer', text(p.commission_officer_name)],
  ], 3);

  const hasClosure = has(p.closure_date) || has(p.total_inflow) || has(p.closure_remarks);
  if (hasClosure) {
    row += 1;
    row = sectionBar(ws, row, SUMMARY_SPAN, 'Closure');
    row = factGrid(ws, row, [
      ['Closure Date', dateOnly(p.closure_date)],
      ['Total Inflow', money(p.total_inflow)],
      ['Closure Bank', text(p.closure_bank)],
      ['Purchase Cost', money(p.purchase_cost)],
      ['Aggregate Expenses', money(p.aggregate_expenses)],
      ['Handled By', text(p.closure_handler)],
      ['Remarks', text(p.closure_remarks)],
    ], 3);
  }
}

const PAYMENT_HEADERS = [
  'S/N', 'Order Date', 'Reference', 'Truck No.', 'Customer', 'Paying Company',
  'Product', 'Quantity', 'Rate', 'Sales Value', 'Location',
  'Payment Date', 'Amount Paid', 'Balance', 'Payer', 'Bank', 'Payment Ref', 'Confirmed By',
];

const PAYMENT_ALIGN: Align[] = [
  'center', 'left', 'left', 'left', 'left', 'left',
  'left', 'right', 'right', 'right', 'left',
  'left', 'right', 'right', 'left', 'left', 'left', 'left',
];

const PAYMENT_WIDTHS = [6, 14, 16, 12, 24, 24, 12, 14, 12, 18, 16, 14, 18, 16, 22, 22, 20, 20];

function buildPaymentsSheet(wb: ExcelJS.Workbook, report: PfiReport) {
  const ws = wb.addWorksheet('Confirmed Payments', { views: [{ showGridLines: false }] });
  setWidths(ws, PAYMENT_WIDTHS);

  const p = report.pfi;
  const t = report.payment_totals;
  const span = PAYMENT_HEADERS.length;

  let row = titleBar(
    ws, 1, span,
    `Confirmed Payments — ${p.pfi_number}`,
    // `${t.orders_count} order(s) · Generated ${format(new Date(report.generated_at || Date.now()), 'dd MMM yyyy, HH:mm')}`,
  );
  row += 1;

  row = sectionBar(ws, row, span, 'Payment Summary');
  row = factGrid(ws, row, [
    ['Orders', qty(t.orders_count)],
    [`Total Quantity (${p.product_unit_label || 'Litres'})`, qty(t.total_quantity)],
    ['Total Sales Value', money(t.total_sales_value)],
    ['Total Amount Paid', money(t.total_paid)],
    ['Total Balance', money(t.total_balance)],
    ['Location', text(p.location_name)],
  ], 3, { 'Total Sales Value': NAVY, 'Total Amount Paid': GREEN, 'Total Balance': num(t.total_balance) > 0 ? RED : GREEN });
  row += 1;

  // One row per order, then a continuation row per additional split payment,
  // each carrying the balance remaining after that payment.
  const rows: CellValue[][] = [];
  const splitRowIndexes = new Set<number>();

  report.payments.forEach((pay, idx) => {
    const salesValue = num(pay.total_price);
    const [first, ...rest] = pay.payment_records;
    let cumulative = first ? num(first.amount) : 0;

    rows.push([
      String(idx + 1),
      dateOnly(pay.order_date),
      text(pay.reference),
      text(pay.truck_number),
      text(pay.customer_name),
      text(pay.company_name),
      text(pay.product_name),
      qty(pay.quantity),
      money(pay.unit_price),
      money(pay.total_price),
      text(pay.location_name),
      first ? dateOnly(first.payment_date) : '—',
      first ? money(first.amount) : '—',
      money(salesValue - cumulative),
      first ? text(first.payer_name) : '—',
      first ? text(first.bank_name ? `${first.bank_name}${first.account_number ? ` (${first.account_number})` : ''}` : '') : '—',
      first ? text(first.transaction_reference) : '—',
      text(pay.payment_confirmed_by),
    ]);

    rest.forEach(record => {
      cumulative += num(record.amount);
      splitRowIndexes.add(rows.length);
      rows.push([
        '', '', '', '', '', '', '', '', '', '', '',
        dateOnly(record.payment_date),
        money(record.amount),
        money(salesValue - cumulative),
        text(record.payer_name),
        text(record.bank_name ? `${record.bank_name}${record.account_number ? ` (${record.account_number})` : ''}` : ''),
        text(record.transaction_reference),
        '',
      ]);
    });
  });

  row = headerRow(ws, row, PAYMENT_HEADERS);
  const firstDataRow = row;

  if (rows.length === 0) {
    row = bodyRows(ws, row, [['—', 'No confirmed payments recorded for this PFI', ...Array(span - 2).fill('')]], PAYMENT_ALIGN);
  } else {
    // Split-payment continuation rows get the amber tint so they read as
    // belonging to the order above rather than as separate orders.
    row = bodyRows(ws, row, rows, PAYMENT_ALIGN, i => (splitRowIndexes.has(i) ? AMBER_FILL : undefined));
    row = totalsRow(ws, row, [
      'TOTAL', '', '', '', '', '', '',
      qty(t.total_quantity), '', money(t.total_sales_value), '',
      '', money(t.total_paid), money(t.total_balance), '', '', '', '',
    ], PAYMENT_ALIGN);
  }

  ws.views = [{ state: 'frozen', ySplit: firstDataRow - 1, showGridLines: false }];
}

const EXPENSE_HEADERS = ['S/N', 'Date', 'Category', 'Vendor', 'Description', 'Bank Paid From', 'Amount', 'Added By'];
const EXPENSE_ALIGN: Align[] = ['center', 'left', 'left', 'left', 'left', 'left', 'right', 'left'];
const EXPENSE_WIDTHS = [6, 14, 30, 24, 40, 22, 18, 20];

function buildExpensesSheet(wb: ExcelJS.Workbook, report: PfiReport) {
  const ws = wb.addWorksheet('Expenses', { views: [{ showGridLines: false }] });
  setWidths(ws, EXPENSE_WIDTHS);

  const p = report.pfi;
  const span = EXPENSE_HEADERS.length;
  const total = report.expenses.reduce((s, e) => s + num(e.amount), 0);

  let row = titleBar(
    ws, 1, span,
    `Expenses — ${p.pfi_number}`,
    // `${report.expenses.length} entr${report.expenses.length === 1 ? 'y' : 'ies'} · ${moneyText(total)}`,
  );
  row += 1;

  row = headerRow(ws, row, EXPENSE_HEADERS);
  const firstDataRow = row;

  if (report.expenses.length === 0) {
    row = bodyRows(ws, row, [['—', 'No expenses recorded for this PFI', ...Array(span - 2).fill('')]], EXPENSE_ALIGN);
  } else {
    row = bodyRows(ws, row, report.expenses.map((e, i) => [
      String(i + 1),
      dateOnly(e.date),
      text(e.category_name),
      text(e.vendor),
      text(e.description),
      text(e.bank_paid_from),
      money(e.amount),
      text(e.added_by_name),
    ]), EXPENSE_ALIGN);
    row = totalsRow(ws, row, ['TOTAL', '', '', '', '', '', money(total), ''], EXPENSE_ALIGN);
  }

  ws.views = [{ state: 'frozen', ySplit: firstDataRow - 1, showGridLines: false }];
}

/** Download the full workbook for a single PFI. */
export async function downloadPfiReport(report: PfiReport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Soroman Dashboard';
  wb.created = new Date();

  buildSummarySheet(wb, report);
  buildPaymentsSheet(wb, report);
  buildExpensesSheet(wb, report);

  const name = `PFI Report - ${shortLabel(report.pfi.pfi_number)} - ${format(new Date(), 'dd-MM-yy')}.xlsx`;
  await downloadWorkbook(wb, name);
}

// ── All-PFIs workbook ────────────────────────────────────────────────────────

const OVERVIEW_HEADERS = [
  'S/N', 'PFI Number', 'Location', 'Product', 'Status', 'PFI Date',
  'BL Qty', 'Price/Litre', 'PFI Value', 'Tank Qty', 'Surplus/Deficit',
  'Sold', 'Remaining', '% Sold', 'Orders',
  'Revenue', 'Expenses', 'Total Cost', 'Landing/Litre', 'Profit/Loss',
];

const OVERVIEW_ALIGN: Align[] = [
  'center', 'left', 'left', 'left', 'center', 'left',
  'right', 'right', 'right', 'right', 'right',
  'right', 'right', 'right', 'right',
  'right', 'right', 'right', 'right', 'right',
];

const OVERVIEW_WIDTHS = [6, 34, 20, 12, 12, 14, 16, 13, 20, 16, 16, 16, 16, 10, 9, 20, 18, 20, 18, 20];

const DETAIL_HEADERS = [
  'S/N', 'PFI Number', 'Vessel Name', 'Vessel Broker', 'Qty (MT)', 'Surveyor', 'Surveyor Phone',
  'Marketing', 'Finance', 'Sales Manager', 'Audit Officer', 'Product Officer',
  'IT Compliance', 'Security Exit', 'Commission Officer',
  'Created', 'Finished', 'Closure Date', 'Total Inflow', 'Closure Bank', 'Closure Remarks',
];

const DETAIL_ALIGN: Align[] = [
  'center', 'left', 'left', 'left', 'right', 'left', 'left',
  'left', 'left', 'left', 'left', 'left', 'left', 'left', 'left',
  'left', 'left', 'left', 'right', 'left', 'left',
];

const DETAIL_WIDTHS = [6, 34, 22, 22, 12, 20, 16, 18, 18, 18, 18, 18, 18, 18, 18, 16, 16, 14, 20, 20, 34];

const ALL_EXPENSE_HEADERS = ['S/N', 'Date', 'PFI / Category', 'Type', 'Vendor', 'Description', 'Bank Paid From', 'Amount'];
const ALL_EXPENSE_ALIGN: Align[] = ['center', 'left', 'left', 'center', 'left', 'left', 'left', 'right'];
const ALL_EXPENSE_WIDTHS = [6, 14, 34, 12, 24, 40, 22, 18];

export interface AllPfisExpense {
  id: number;
  date: string;
  category_name: string | null;
  category_is_pfi: boolean;
  vendor: string;
  description: string;
  bank_paid_from: string;
  amount: string;
}

/**
 * Download one workbook covering every PFI passed in — an overview sheet with
 * the headline figures, a detail sheet with the vessel/people/closure record,
 * and every expense line across all of them.
 */
export async function downloadAllPfisReport(
  pfis: PfiSummaryData[],
  expenses: AllPfisExpense[],
  scopeLabel: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Soroman Dashboard';
  wb.created = new Date();
  const generated = `Generated ${format(new Date(), 'dd MMM yyyy, HH:mm')}`;

  // ── Overview ──────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('All PFIs', { views: [{ showGridLines: false }] });
  setWidths(ws, OVERVIEW_WIDTHS);
  const span = OVERVIEW_HEADERS.length;

  let row = titleBar(ws, 1, span, 'PFI Master Report', `${scopeLabel} · ${pfis.length} PFI(s) · ${generated}`);
  row += 1;

  const sum = (pick: (p: PfiSummaryData) => unknown) => pfis.reduce((s, p) => s + num(pick(p)), 0);
  const totalRevenue = sum(p => p.revenue);
  const totalExpenses = sum(p => p.total_expenses);
  // Cost and P/L are only meaningful for PFIs that have both BL qty and price,
  // so they are summed over that subset rather than treating blanks as zero.
  const costed = pfis.filter(p => has(p.pfi_value));
  // Net of credits, so the portfolio total is the same basis the per-PFI
  // profit figures are worked out from and the two reconcile.
  const totalCost = costed.reduce((s, p) => s + num(p.grand_total_cost), 0);
  const totalCredit = costed.reduce((s, p) => s + num(p.credit_balance), 0);
  const totalProfit = costed.reduce((s, p) => s + num(p.profit_loss), 0);

  row = sectionBar(ws, row, span, 'Portfolio Summary');
  row = factGrid(ws, row, [
    ['Total PFIs', qty(pfis.length)],
    ['Active', qty(pfis.filter(p => p.status === 'active').length)],
    ['Finished', qty(pfis.filter(p => p.status === 'finished').length)],
    ['Total Initial Stock', qty(sum(p => p.starting_qty_litres))],
    ['Total Sold', qty(sum(p => p.sold_qty_litres))],
    ['Total Remaining', qty(sum(p => p.remaining_qty_litres))],
    ['Total Revenue', money(totalRevenue)],
    ['Total Expenses', money(totalExpenses)],
    ['Total Orders', qty(sum(p => p.orders_count))],
    ['Total Credit Balance', costed.length ? money(totalCredit) : '—'],
    ['Grand Total Cost (costed PFIs)', costed.length ? money(totalCost) : '—'],
    [totalProfit < 0 ? 'Net Loss (costed PFIs)' : 'Net Profit (costed PFIs)', costed.length ? money(totalProfit) : '—'],
    ['PFIs Awaiting Cost Data', qty(pfis.length - costed.length)],
  ], 3, {
    'Total Revenue': GREEN,
    'Total Credit Balance': GREEN,
    'Net Profit (costed PFIs)': GREEN,
    'Net Loss (costed PFIs)': RED,
  });
  row += 1;

  row = headerRow(ws, row, OVERVIEW_HEADERS);
  const overviewFirstRow = row;

  row = bodyRows(ws, row, pfis.map((p, i) => {
    const starting = num(p.starting_qty_litres);
    const sold = num(p.sold_qty_litres);
    return [
      String(i + 1),
      text(p.pfi_number),
      text(p.location_name),
      text(p.product_name),
      text(p.status).toUpperCase(),
      dateOnly(p.pfi_date),
      qty(p.bl_qty_litres),
      money(p.price_per_litre),
      money(p.pfi_value),
      qty(p.starting_qty_litres),
      qty(p.surplus_deficit_litres),
      qty(p.sold_qty_litres),
      qty(p.remaining_qty_litres),
      pct(sold, starting),
      qty(p.orders_count),
      money(p.revenue),
      money(p.total_expenses),
      money(p.total_cost),
      money(p.landing_cost_per_litre),
      money(p.profit_loss),
    ];
  }), OVERVIEW_ALIGN);

  row = totalsRow(ws, row, [
    'TOTAL', '', '', '', '', '',
    qty(sum(p => p.bl_qty_litres)), '', money(sum(p => p.pfi_value)),
    qty(sum(p => p.starting_qty_litres)), qty(sum(p => p.surplus_deficit_litres)),
    qty(sum(p => p.sold_qty_litres)), qty(sum(p => p.remaining_qty_litres)), '',
    qty(sum(p => p.orders_count)),
    money(totalRevenue), money(totalExpenses),
    costed.length ? money(totalCost) : '—',
    '',   // landing cost is a per-litre rate — summing it would be meaningless
    costed.length ? money(totalProfit) : '—',
  ], OVERVIEW_ALIGN);

  ws.views = [{ state: 'frozen', ySplit: overviewFirstRow - 1, showGridLines: false }];

  // ── Vessel / people / closure record ──────────────────────────────────────
  const ws2 = wb.addWorksheet('PFI Details', { views: [{ showGridLines: false }] });
  setWidths(ws2, DETAIL_WIDTHS);
  const span2 = DETAIL_HEADERS.length;

  let row2 = titleBar(ws2, 1, span2, 'PFI Details', `${scopeLabel} · ${generated}`);
  row2 += 1;
  row2 = headerRow(ws2, row2, DETAIL_HEADERS);
  const detailFirstRow = row2;

  row2 = bodyRows(ws2, row2, pfis.map((p, i) => [
    String(i + 1),
    text(p.pfi_number),
    text(p.vessel_name),
    text(p.vessel_broker),
    qty(p.qty_volume_mt),
    text(p.surveyor_name),
    text(p.surveyor_phone),
    text(p.marketing_person_name),
    text(p.finance_person_name),
    text(p.sales_manager_name),
    text(p.audit_officer_name),
    text(p.product_officer_name),
    text(p.it_compliance_officer_name),
    text(p.security_exit_officer_name),
    text(p.commission_officer_name),
    dateOnly(p.created_at),
    dateOnly(p.finished_at),
    dateOnly(p.closure_date),
    money(p.total_inflow),
    text(p.closure_bank),
    text(p.closure_remarks),
  ]), DETAIL_ALIGN);

  ws2.views = [{ state: 'frozen', ySplit: detailFirstRow - 1, showGridLines: false }];

  // ── Every expense line ────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Expenses', { views: [{ showGridLines: false }] });
  setWidths(ws3, ALL_EXPENSE_WIDTHS);
  const span3 = ALL_EXPENSE_HEADERS.length;
  const expenseTotal = expenses.reduce((s, e) => s + num(e.amount), 0);

  let row3 = titleBar(
    ws3, 1, span3, 'All Expenses',
    `${expenses.length} entr${expenses.length === 1 ? 'y' : 'ies'} · ${moneyText(expenseTotal)} · ${generated}`,
  );
  row3 += 1;
  row3 = headerRow(ws3, row3, ALL_EXPENSE_HEADERS);
  const expenseFirstRow = row3;

  if (expenses.length === 0) {
    row3 = bodyRows(ws3, row3, [['—', 'No expenses recorded', ...Array(span3 - 2).fill('')]], ALL_EXPENSE_ALIGN);
  } else {
    row3 = bodyRows(ws3, row3, expenses.map((e, i) => [
      String(i + 1),
      dateOnly(e.date),
      text(e.category_name),
      e.category_is_pfi ? 'PFI' : 'GENERAL',
      text(e.vendor),
      text(e.description),
      text(e.bank_paid_from),
      money(e.amount),
    ]), ALL_EXPENSE_ALIGN);
    row3 = totalsRow(ws3, row3, ['TOTAL', '', '', '', '', '', '', money(expenseTotal)], ALL_EXPENSE_ALIGN);
  }

  ws3.views = [{ state: 'frozen', ySplit: expenseFirstRow - 1, showGridLines: false }];

  await downloadWorkbook(wb, `PFI Master Report - ${format(new Date(), 'dd-MM-yy')}.xlsx`);
}
