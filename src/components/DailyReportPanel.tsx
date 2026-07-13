import { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/client';
import {
  Plus, X, ChevronLeft, ChevronRight, Loader2, CheckCircle2,
  ClipboardList, Edit3, FileBarChart2, AlertCircle, Send,
  MapPin, Package, Trash2, Download, FileText,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PFIOption {
  pfi_id: number;
  pfi_number: string;
  location_name: string;
  product_name: string;
  product_unit?: string;
  product_unit_label?: string;
  opening_balance: string;
  sold_today: string;
  remaining_balance: string;
  price: string;
}

interface FormFields {
  pfi_id: string;
  location: string;
  yesterday_carried_over_loading: string;
  product_brought_forward: string;
  litres_sold_today: string;
  price: string;
  tank_balance: string;
  num_trucks_sold: string;
  amount_paid: string;
  total_sales_amount: string;
  differentials: string;
  loading_left_over: string;
  bank_name: string;
  account_number: string;
  remarks: string;
}

// A day's sales can happen at more than one price (e.g. different loads sold
// at different rates). litres_sold_today/price/total_sales_amount on
// FormFields are derived from these — total litres, weighted average price,
// and total sales — so every downstream consumer of those three scalar
// fields (PDF, history table, admin exports) keeps working unchanged.
interface PriceBand {
  price: string;
  litres: string;
}
const EMPTY_BAND: PriceBand = { price: '', litres: '' };

interface ReportEntry {
  id: number;
  date?: string;
  location?: string;
  pfi_number?: string;
  yesterday_carried_over_loading?: unknown;
  product_brought_forward?: unknown;
  litres_sold_today?: unknown;
  price?: unknown;
  price_bands?: Array<{ price: unknown; litres: unknown }>;
  tank_balance?: unknown;
  num_trucks_sold?: unknown;
  amount_paid?: unknown;
  total_sales_amount?: unknown;
  differentials?: unknown;
  loading_left_over?: unknown;
  bank_name?: string;
  account_number?: string;
  remarks?: string;
  updated_at?: string;
  submitted_by_name?: string;
}

const EMPTY: FormFields = {
  pfi_id: '', location: '', yesterday_carried_over_loading: '', product_brought_forward: '',
  litres_sold_today: '', price: '', tank_balance: '', num_trucks_sold: '',
  amount_paid: '', total_sales_amount: '', differentials: '', loading_left_over: '',
  bank_name: '', account_number: '', remarks: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const UNIT_LABELS: Record<string, string> = { litres: 'Litres', kg: 'kg', ton: 'ton' };
const getPfiUnitLabel = (p?: PFIOption | null) =>
  p?.product_unit_label || UNIT_LABELS[(p?.product_unit || 'litres').toLowerCase()] || 'Litres';

const rawNum = (s: string) => s.replace(/,/g, '').trim();
const toNum  = (s: string) => { const n = Number(rawNum(s)); return Number.isFinite(n) ? n : 0; };

/** Bands from a saved entry, falling back to a single band from the legacy
 * scalar price/litres_sold_today for reports submitted before bands existed. */
const bandsFromEntry = (entry: { price_bands?: Array<{ price: unknown; litres: unknown }>; price?: unknown; litres_sold_today?: unknown }): PriceBand[] => {
  if (entry.price_bands && entry.price_bands.length > 0) {
    return entry.price_bands.map(b => ({
      price: numVal(b.price, true),
      litres: numVal(b.litres),
    }));
  }
  const price = numVal(entry.price, true);
  const litres = numVal(entry.litres_sold_today);
  return price || litres ? [{ price, litres }] : [{ ...EMPTY_BAND }];
};

const bandsToText = (bands: PriceBand[]): string => {
  const parts = bands
    .filter(b => toNum(b.price) > 0 || toNum(b.litres) > 0)
    .map(b => `₦${toNum(b.price).toLocaleString()}×${toNum(b.litres).toLocaleString()}L`);
  return parts.length > 1 ? parts.join(', ') : '—';
};

const numVal = (v: unknown, decimal = false): string => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimal ? 4 : 0 });
};

const display = (v: unknown, money = false): string => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return 'NIL';
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return money ? `₦${s}` : s;
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────
function generatePDF(form: FormFields, date: string, staffName: string, pfiNumber: string, unitLabel: string, priceBands: PriceBand[] = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16, CW = W - M * 2;
  const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm');

  type RGB = [number, number, number];
  const NAVY:  RGB = [15, 23, 42];
  const GREEN: RGB = [5, 150, 105];
  const DARK:  RGB = [15, 23, 42];
  const WHITE: RGB = [255, 255, 255];
  const LBLBG: RGB = [243, 245, 248];
  const BORDER: RGB = [210, 215, 225];

  const fmt = (v: string, money = false) => {
    const n = Number((v || '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n === 0) return 'NIL';
    const s = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return money ? `NGN ${s}` : s;
  };

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 46, 'F');
  doc.setFillColor(...GREEN); doc.rect(0, 42, W, 4, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text('SOROMAN ENERGY LIMITED', M, 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...WHITE);
  doc.text('STAFF DAILY SALES REPORT', M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${generatedAt}`, M, 39);
  doc.setFillColor(...GREEN); doc.roundedRect(W - M - 50, 14, 50, 16, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
  doc.text((date || format(new Date(), 'dd MMM yyyy')).toUpperCase(), W - M - 25, 23.5, { align: 'center' });

  const ROW_H = 7, SEC_H = 7, LABEL_W = 80, VALUE_W = CW - LABEL_W;
  type TableEntry = { kind: 'section'; title: string } | { kind: 'row'; label: string; value: string; highlight?: boolean };

  const entries: TableEntry[] = [
    { kind: 'row', label: 'REPORT DATE',  value: (date || '—').toUpperCase() },
    { kind: 'row', label: 'LOCATION',     value: (form.location || '—').toUpperCase() },
    { kind: 'row', label: 'PFI NUMBER',   value: (pfiNumber || '—').toUpperCase() },
    { kind: 'row', label: 'SUBMITTED BY', value: staffName.toUpperCase() },
    { kind: 'section', title: `LOADING & OPENING FIGURES` },
    { kind: 'row', label: `YESTERDAY'S CARRIED OVER (${unitLabel.toUpperCase()})`, value: fmt(form.yesterday_carried_over_loading) },
    { kind: 'row', label: `PRODUCT BROUGHT FORWARD (${unitLabel.toUpperCase()})`,  value: fmt(form.product_brought_forward), highlight: true },
    { kind: 'section', title: 'SALES FIGURES' },
    { kind: 'row', label: `QTY SOLD TODAY (${unitLabel.toUpperCase()})`, value: fmt(form.litres_sold_today), highlight: true },
    { kind: 'row', label: `AVG. PRICE PER ${unitLabel.toUpperCase()}`,   value: fmt(form.price, true), highlight: true },
    ...(priceBands.length > 1
      ? priceBands
          .filter(b => Number(rawNum(b.price)) > 0 || Number(rawNum(b.litres)) > 0)
          .map((b, i): TableEntry => ({
            kind: 'row',
            label: `  PRICE ${i + 1} (${unitLabel.toUpperCase()})`,
            value: `${fmt(b.litres)} @ ${fmt(b.price, true)}`,
          }))
      : []),
    { kind: 'row', label: `TANK BALANCE (${unitLabel.toUpperCase()})`,   value: fmt(form.tank_balance) },
    { kind: 'row', label: 'NO. OF TRUCKS SOLD',                          value: fmt(form.num_trucks_sold) },
    { kind: 'section', title: 'FINANCIAL FIGURES' },
    { kind: 'row', label: 'AMOUNT PAID',        value: fmt(form.amount_paid, true) },
    { kind: 'row', label: 'TOTAL SALES AMOUNT', value: fmt(form.total_sales_amount, true), highlight: true },
    { kind: 'row', label: 'DIFFERENTIALS',      value: fmt(form.differentials, true) },
    { kind: 'row', label: `LOADING LEFT OVER (${unitLabel.toUpperCase()})`, value: fmt(form.loading_left_over) },
    { kind: 'section', title: 'BANK DETAILS' },
    { kind: 'row', label: 'BANK NAME',      value: (form.bank_name || '—').toUpperCase() },
    { kind: 'row', label: 'ACCOUNT NUMBER', value: (form.account_number || '—').toUpperCase() },
  ];

  let Y = 52;
  const totalH = entries.reduce((s, e) => s + (e.kind === 'section' ? SEC_H : ROW_H), 0);
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.rect(M, Y, CW, totalH, 'S');

  entries.forEach((entry, ei) => {
    const isLast = ei === entries.length - 1;
    if (entry.kind === 'section') {
      doc.setFillColor(...NAVY); doc.rect(M, Y, CW, SEC_H, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WHITE);
      doc.text(entry.title, M + 4, Y + 4.8);
      Y += SEC_H;
    } else {
      doc.setFillColor(...LBLBG); doc.rect(M, Y, LABEL_W, ROW_H, 'F');
      doc.setFillColor(...(entry.highlight ? ([236, 253, 245] as RGB) : ([255, 255, 255] as RGB)));
      doc.rect(M + LABEL_W, Y, VALUE_W, ROW_H, 'F');
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
      doc.line(M + LABEL_W, Y, M + LABEL_W, Y + ROW_H);
      if (!isLast) doc.line(M, Y + ROW_H, M + CW, Y + ROW_H);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(70, 80, 100);
      doc.text(entry.label, M + 4, Y + 4.8);
      doc.setFont('helvetica', entry.highlight ? 'bold' : 'normal');
      doc.setFontSize(8); doc.setTextColor(...(entry.highlight ? GREEN : DARK));
      doc.text(entry.value, M + LABEL_W + 5, Y + 4.8);
      Y += ROW_H;
    }
  });

  Y += 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(70, 80, 100);
  doc.text('REMARKS', M, Y); Y += 4;
  const REMARKS_H = 28;
  doc.setFillColor(249, 250, 251); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, REMARKS_H, 'FD');
  if (form.remarks?.trim()) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(160, 170, 185);
    doc.text('No remarks provided.', M + 4, Y + 8);
  }
  Y += REMARKS_H + 14;

  const SIG_W = (CW - 12) / 2;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.line(M, Y, M + SIG_W, Y);
  doc.line(M + SIG_W + 12, Y, M + SIG_W + 12 + SIG_W, Y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text('STAFF SIGNATURE / DATE', M, Y + 5);
  doc.text('AUTHORISED BY / DATE', M + SIG_W + 12, Y + 5);

  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...GREEN); doc.rect(0, H - 12, W, 1.5, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text('Soroman Energy Limited — Confidential', M, H - 4.5);
  doc.text(`Page 1 of 1  •  ${generatedAt}`, W - M, H - 4.5, { align: 'right' });

  const safe = (date || format(new Date(), 'yyyy-MM-dd')).replace(/-/g, '');
  doc.save(`StaffDailySalesReport_${safe}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field component
// ─────────────────────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, prefix, suffix, multiline, readOnly = false, highlight = false, decimal = false, text = false, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; multiline?: boolean;
  readOnly?: boolean; highlight?: boolean; decimal?: boolean; text?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none z-10">{prefix}</span>}
        {multiline ? (
          <textarea value={value} onChange={e => onChange(e.target.value)} disabled={readOnly} rows={2} placeholder="Optional…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 disabled:bg-slate-50 transition-all resize-none" />
        ) : text ? (
          <input type="text" value={value} onChange={e => onChange(e.target.value)} disabled={readOnly}
            placeholder={placeholder || 'Optional…'}
            className={`w-full rounded-lg border py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:border-green-400 disabled:bg-slate-50 transition-all ${prefix ? 'pl-8 pr-3' : suffix ? 'pl-3 pr-10' : 'px-3'} ${highlight ? 'border-green-300 bg-green-50/40 focus:ring-green-500/30' : 'border-slate-200 bg-white focus:ring-green-500/30'}`} />
        ) : (
          <input type="text" inputMode="numeric" value={value} disabled={readOnly} placeholder="0"
            onChange={e => {
              const raw = rawNum(e.target.value);
              if (!raw) { onChange(''); return; }
              const dotIdx = decimal ? raw.indexOf('.') : -1;
              if (dotIdx === -1) {
                const n = Number(raw);
                onChange(Number.isFinite(n) ? n.toLocaleString() : raw);
                return;
              }
              const intPart = raw.slice(0, dotIdx);
              const decPart = raw.slice(dotIdx + 1).replace(/\./g, '');
              const n = Number(intPart || '0');
              onChange(`${Number.isFinite(n) ? n.toLocaleString() : intPart}.${decPart}`);
            }}
            className={`w-full rounded-lg border py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:border-green-400 disabled:bg-slate-50 transition-all ${prefix ? 'pl-8 pr-3' : suffix ? 'pl-3 pr-10' : 'px-3'} ${highlight ? 'border-green-300 bg-green-50/40 focus:ring-green-500/30' : 'border-slate-200 bg-white focus:ring-green-500/30'}`} />
        )}
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View dialog (read-only)
// ─────────────────────────────────────────────────────────────────────────────
function ViewDialog({ entry, onClose, onRedownload }: { entry: ReportEntry | null; onClose: () => void; onRedownload: (e: ReportEntry) => void }) {
  if (!entry) return null;
  const rows: [string, string][] = [
    ['Report Date',      entry.date || '—'],
    ['Location',         entry.location || '—'],
    ['PFI Number',       entry.pfi_number || '—'],
    ['Submitted By',     (entry.submitted_by_name || '—').replace(TAG_RE, '').trim()],
    ['Yesterday Carryover', display(entry.yesterday_carried_over_loading)],
    ['Product Brought Fwd', display(entry.product_brought_forward)],
    ['Qty Sold Today',   display(entry.litres_sold_today)],
    ['Avg. Price Per Litre', display(entry.price, true)],
    ['Price Breakdown',  bandsToText(bandsFromEntry(entry))],
    ['Tank Balance',     display(entry.tank_balance)],
    ['No. Trucks Sold',  display(entry.num_trucks_sold)],
    ['Amount Paid',      display(entry.amount_paid, true)],
    ['Total Sales',      display(entry.total_sales_amount, true)],
    ['Differentials',    display(entry.differentials, true)],
    ['Loading Left Over',display(entry.loading_left_over)],
    ['Bank Name',        entry.bank_name || '—'],
    ['Account Number',   entry.account_number || '—'],
    ['Remarks',          entry.remarks || '—'],
  ];
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Report — {entry.date} · {entry.location}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 mt-2">
          {rows.map(([label, val]) => (
            <div key={label} className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">{label}</span>
              <span className="text-xs text-slate-800 font-medium text-right">{val}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" className="gap-1.5 bg-slate-800 hover:bg-slate-900 text-white" onClick={() => { onRedownload(entry); onClose(); }}>
            <Download size={13} /> Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────────────────────────────────────
// Tag embedded in submitted_by_name to distinguish which page submitted the report.
// Format: "John Doe [PRODUCT_MANAGER]" — the suffix is stripped for display purposes.
const TAG_RE = /\s*\[([A-Z_]+)\]$/;

const PAGE_LABELS: Record<string, string> = {
  PRODUCT_MANAGER: 'Product Manager Reports',
  SALES_MANAGER:   'Sales Manager Reports',
};

export function DailyReportPanel({ pageRole, initialOpen }: { pageRole: 'PRODUCT_MANAGER' | 'SALES_MANAGER'; initialOpen?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const rawUser = localStorage.getItem('user') || sessionStorage.getItem('user') || '{}';
  let currentUser: { full_name?: string; email?: string } = {};
  try { currentUser = JSON.parse(rawUser); } catch { /* ignore */ }
  const staffName = localStorage.getItem('fullname') || currentUser.full_name || currentUser.email || 'Unknown';
  // Name stored with page role tag for filtering
  const taggedName = `${staffName} [${pageRole}]`;

  const [showForm, setShowForm]             = useState(!!initialOpen);
  const [editDate, setEditDate]             = useState(today);
  const [form, setForm]                     = useState<FormFields>(EMPTY);
  const [priceBands, setPriceBands]         = useState<PriceBand[]>([{ ...EMPTY_BAND }]);
  const [histPage, setHistPage]             = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewEntry, setViewEntry]           = useState<ReportEntry | null>(null);
  const submittedSnapshot = useRef<{ form: FormFields; priceBands: PriceBand[]; date: string; pfiNumber: string; unitLabel: string } | null>(null);

  const set = useCallback((key: keyof FormFields) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value })), []);

  const updateBand = useCallback((idx: number, key: keyof PriceBand) => (value: string) =>
    setPriceBands(prev => prev.map((b, i) => (i === idx ? { ...b, [key]: value } : b))), []);
  const addBand = useCallback(() => setPriceBands(prev => [...prev, { ...EMPTY_BAND }]), []);
  const removeBand = useCallback((idx: number) =>
    setPriceBands(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)), []);

  const pfiQuery = useQuery({
    queryKey: ['staff-pfi-data', editDate],
    queryFn: () => apiClient.admin.getStaffReportPFIData(editDate),
    staleTime: 30_000,
    enabled: showForm,
  });

  // Fetch enough pages to find matching entries — we over-fetch then filter client-side by tag.
  // Page size 50 keeps round-trips low for typical history volumes.
  const histQuery = useQuery({
    queryKey: ['staff-report-history', pageRole, histPage],
    queryFn: () => apiClient.admin.getStaffReportHistory(histPage, 50, false),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const pfis: PFIOption[] = pfiQuery.data?.pfis ?? [];
  const selectedPfi = pfis.find(p => String(p.pfi_id) === form.pfi_id);
  const unitLabel = getPfiUnitLabel(selectedPfi);

  // Auto-fill when PFI selected — seeds a single starting price band, which
  // the staff member can then split into more bands if today's sales
  // happened at more than one price.
  useEffect(() => {
    if (!form.pfi_id) return;
    const pfi = pfis.find(p => String(p.pfi_id) === form.pfi_id);
    if (!pfi) return;
    setForm(prev => ({
      ...prev,
      location: pfi.location_name,
      product_brought_forward: numVal(pfi.remaining_balance),
    }));
    setPriceBands([{ price: numVal(pfi.price, true), litres: numVal(pfi.sold_today) }]);
  }, [form.pfi_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calculate — litres_sold_today/price/total_sales_amount are derived
  // from the price bands: total litres, weighted average price, total sales.
  useEffect(() => {
    const litres = priceBands.reduce((s, b) => s + toNum(b.litres), 0);
    const totalSales = priceBands.reduce((s, b) => s + toNum(b.litres) * toNum(b.price), 0);
    const price = litres > 0 ? totalSales / litres : 0;
    const opening = toNum(form.product_brought_forward);
    const carryover = toNum(form.yesterday_carried_over_loading);
    const amountPaid = toNum(form.amount_paid);
    const tankBalance = opening + carryover - litres;
    const differentials = amountPaid - totalSales;
    setForm(prev => ({
      ...prev,
      litres_sold_today: litres > 0 ? litres.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
      price: price > 0 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '',
      total_sales_amount: totalSales > 0 ? totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
      tank_balance: tankBalance > 0 ? tankBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
      differentials: (amountPaid > 0 || totalSales > 0) ? differentials.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '',
    }));
  }, [priceBands, form.product_brought_forward, form.yesterday_carried_over_loading, form.amount_paid]);

  const openEdit = (rpt: ReportEntry) => {
    setEditDate(String(rpt.date ?? today));
    const matchedPfi = pfis.find(p => p.pfi_number === String(rpt.pfi_number ?? ''));
    setForm({
      pfi_id: matchedPfi ? String(matchedPfi.pfi_id) : '',
      location: String(rpt.location ?? ''),
      yesterday_carried_over_loading: numVal(rpt.yesterday_carried_over_loading),
      product_brought_forward: numVal(rpt.product_brought_forward),
      litres_sold_today: numVal(rpt.litres_sold_today),
      price: numVal(rpt.price, true),
      tank_balance: numVal(rpt.tank_balance),
      num_trucks_sold: numVal(rpt.num_trucks_sold),
      amount_paid: numVal(rpt.amount_paid),
      total_sales_amount: numVal(rpt.total_sales_amount),
      differentials: numVal(rpt.differentials),
      loading_left_over: numVal(rpt.loading_left_over),
      bank_name: String(rpt.bank_name ?? ''),
      account_number: String(rpt.account_number ?? ''),
      remarks: String(rpt.remarks ?? ''),
    });
    setPriceBands(bandsFromEntry(rpt));
    setShowForm(true);
  };

  const handleRedownload = (rpt: ReportEntry) => {
    const f: FormFields = {
      pfi_id: '',
      location: String(rpt.location ?? ''),
      yesterday_carried_over_loading: numVal(rpt.yesterday_carried_over_loading),
      product_brought_forward: numVal(rpt.product_brought_forward),
      litres_sold_today: numVal(rpt.litres_sold_today),
      price: numVal(rpt.price, true),
      tank_balance: numVal(rpt.tank_balance),
      num_trucks_sold: numVal(rpt.num_trucks_sold),
      amount_paid: numVal(rpt.amount_paid),
      total_sales_amount: numVal(rpt.total_sales_amount),
      differentials: numVal(rpt.differentials),
      loading_left_over: numVal(rpt.loading_left_over),
      bank_name: String(rpt.bank_name ?? ''),
      account_number: String(rpt.account_number ?? ''),
      remarks: String(rpt.remarks ?? ''),
    };
    const cleanName = staffName.replace(TAG_RE, '').trim();
    generatePDF(f, String(rpt.date ?? ''), cleanName, String(rpt.pfi_number ?? ''), 'Litres', bandsFromEntry(rpt));
  };

  const mutation = useMutation({
    mutationFn: () => apiClient.admin.submitStaffDailyReport({
      date: editDate,
      location: form.location,
      pfi_number: pfis.find(p => String(p.pfi_id) === form.pfi_id)?.pfi_number || '',
      submitted_by_name: taggedName,
      yesterday_carried_over_loading: rawNum(form.yesterday_carried_over_loading) || '0',
      product_brought_forward: rawNum(form.product_brought_forward) || '0',
      litres_sold_today: rawNum(form.litres_sold_today) || '0',
      price: rawNum(form.price) || '0',
      price_bands: priceBands
        .filter(b => toNum(b.price) > 0 || toNum(b.litres) > 0)
        .map(b => ({ price: rawNum(b.price) || '0', litres: rawNum(b.litres) || '0' })),
      tank_balance: rawNum(form.tank_balance) || '0',
      num_trucks_sold: rawNum(form.num_trucks_sold) || '0',
      amount_paid: rawNum(form.amount_paid) || '0',
      total_sales_amount: rawNum(form.total_sales_amount) || '0',
      differentials: rawNum(form.differentials) || '0',
      loading_left_over: rawNum(form.loading_left_over) || '0',
      bank_name: form.bank_name.trim(),
      account_number: form.account_number.trim(),
      remarks: form.remarks,
    }),
    onSuccess: () => {
      toast({ title: 'Report saved!', description: `Submitted for ${form.location} on ${editDate}.` });
      if (submittedSnapshot.current) {
        const { form: f, priceBands: bands, date, pfiNumber, unitLabel: ul } = submittedSnapshot.current;
        generatePDF(f, date, staffName.replace(TAG_RE, '').trim(), pfiNumber, ul, bands);
        submittedSnapshot.current = null;
      }
      setShowForm(false);
      setForm(EMPTY);
      setPriceBands([{ ...EMPTY_BAND }]);
      qc.invalidateQueries({ queryKey: ['staff-report-history'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteStaffDailyReport(id),
    onSuccess: () => {
      toast({ title: 'Report deleted' });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['staff-report-history'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      setConfirmDeleteId(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.location.trim()) {
      toast({ title: 'Select a PFI first', variant: 'destructive' });
      return;
    }
    submittedSnapshot.current = {
      form: { ...form },
      priceBands: priceBands.map(b => ({ ...b })),
      date: editDate,
      pfiNumber: pfis.find(p => String(p.pfi_id) === form.pfi_id)?.pfi_number || '',
      unitLabel,
    };
    mutation.mutate();
  };

  // Filter by page-role tag embedded in submitted_by_name
  const history = ((histQuery.data?.results ?? []) as ReportEntry[]).filter(r => {
    const by = String(r.submitted_by_name ?? '');
    const match = by.match(TAG_RE);
    return match ? match[1] === pageRole : false;
  });
  const histCount  = history.length;
  const totalPages = Math.ceil(histCount / 10) || 1;

  return (
    <>
      {/* View dialog */}
      <ViewDialog entry={viewEntry} onClose={() => setViewEntry(null)} onRedownload={handleRedownload} />

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setForm(EMPTY); setPriceBands([{ ...EMPTY_BAND }]); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-5 py-4 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2 text-base font-bold">
                <ClipboardList size={16} />
                {editDate === today ? "Today's Daily Sales Report" : `Report for ${editDate}`}
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-green-200 mt-1">Select a PFI to start your report. Fields will auto-fill from live data.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Date picker */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Report Date</span>
              <input type="date" title="Report Date" value={editDate} max={today}
                onChange={e => setEditDate(e.target.value || today)}
                className="ml-auto rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all" />
            </div>

            {/* PFI selector */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white text-[9px] font-bold">1</span>
                Select PFI
              </p>
              {!showForm ? null : pfiQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 size={14} className="animate-spin" /> Loading PFIs…</div>
              ) : pfis.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <AlertCircle size={14} /> No PFIs found for this date.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {pfis.map(pfi => {
                    const isSelected = form.pfi_id === String(pfi.pfi_id);
                    return (
                      <button key={pfi.pfi_id} type="button" onClick={() => setForm(prev => ({ ...prev, pfi_id: String(pfi.pfi_id) }))}
                        className={`text-left rounded-xl border p-3 transition-all ${isSelected ? 'border-green-500 bg-green-50 shadow-sm shadow-green-100' : 'border-slate-200 bg-white hover:border-green-300 hover:bg-green-50/30'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${isSelected ? 'text-green-700' : 'text-slate-800'}`}>{pfi.pfi_number}</p>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {pfi.location_name}
                              <span className="text-slate-300 mx-1">·</span>
                              <Package size={10} /> {pfi.product_name}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 size={15} className="text-green-600 shrink-0" />}
                        </div>
                        <div className="mt-1.5 flex gap-3 text-[10px]">
                          <span className="text-slate-500">Remaining: <strong className={Number(pfi.remaining_balance) <= 0 ? 'text-red-500' : 'text-slate-700'}>{Number(pfi.remaining_balance).toLocaleString(undefined, { maximumFractionDigits: 0 })} {getPfiUnitLabel(pfi)}</strong></span>
                          <span className="text-slate-500">Sold: <strong className={Number(pfi.sold_today) > 0 ? 'text-emerald-700' : 'text-slate-400'}>{Number(pfi.sold_today).toLocaleString(undefined, { maximumFractionDigits: 0 })} {getPfiUnitLabel(pfi)}</strong></span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {form.location && (
                <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <MapPin size={12} className="text-green-500" /> Location: <strong>{form.location}</strong>
                </div>
              )}
            </div>

            {/* Form fields */}
            {form.pfi_id && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white text-[9px] font-bold">2</span>
                  Confirm &amp; Fill Details
                </p>

                <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Loading &amp; Opening Figures</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Yesterday's Carried Over" value={form.yesterday_carried_over_loading} onChange={set('yesterday_carried_over_loading')} suffix={unitLabel} />
                    <Field label="Product Brought Forward" value={form.product_brought_forward} onChange={set('product_brought_forward')} suffix={unitLabel} highlight />
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Sales Figures</legend>

                  {/* Price bands — a day can have sales at more than one price */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Prices &amp; Litres Sold Today
                      </label>
                      <button type="button" onClick={addBand}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-800 shrink-0">
                        <Plus size={12} /> Add Price
                      </button>
                    </div>

                    <div className="space-y-2">
                      {priceBands.map((band, idx) => (
                        <div key={idx} className="flex items-end gap-2">
                          <span className="mb-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <Field label={`Price per ${unitLabel}`} value={band.price} onChange={updateBand(idx, 'price')} prefix="₦" highlight decimal />
                          </div>
                          <div className="flex-1">
                            <Field label="Litres at this Price" value={band.litres} onChange={updateBand(idx, 'litres')} suffix={unitLabel} highlight />
                          </div>
                          <button type="button" onClick={() => removeBand(idx)} disabled={priceBands.length === 1}
                            title="Remove this price"
                            className="mb-2.5 shrink-0 text-red-400 hover:text-red-600 disabled:text-slate-200 disabled:cursor-not-allowed transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-slate-600">
                        Total Qty Sold: <strong className="text-slate-800">{form.litres_sold_today || '0'} {unitLabel}</strong>
                      </span>
                      <span className="text-slate-600">
                        Total Sales: <strong className="text-emerald-700">₦{form.total_sales_amount || '0'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tank Balance" value={form.tank_balance} onChange={set('tank_balance')} suffix={unitLabel} highlight />
                    <Field label="No. of Trucks Sold" value={form.num_trucks_sold} onChange={set('num_trucks_sold')} />
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Financial Figures</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Amount Paid" value={form.amount_paid} onChange={set('amount_paid')} prefix="₦" />
                    <Field label="Total Sales Amount" value={form.total_sales_amount} onChange={set('total_sales_amount')} prefix="₦" highlight />
                    <Field label="Differentials" value={form.differentials} onChange={set('differentials')} prefix="₦" highlight />
                    <Field label="Loading Left Over" value={form.loading_left_over} onChange={set('loading_left_over')} suffix={unitLabel} />
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Bank Details</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Bank Name" value={form.bank_name} onChange={set('bank_name')} text placeholder="e.g. Zenith Bank" />
                    <Field label="Account Number" value={form.account_number} onChange={set('account_number')} text placeholder="e.g. 1234567890" />
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-slate-200 p-4">
                  <Field label="Remarks" value={form.remarks} onChange={set('remarks')} multiline />
                </fieldset>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setForm(EMPTY); setPriceBands([{ ...EMPTY_BAND }]); }}>
                <X size={13} className="mr-1" /> Cancel
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending || !form.pfi_id}
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white min-w-[160px]">
                {mutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Send size={13} /> Submit &amp; Download</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Report button (trigger) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileBarChart2 size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">{PAGE_LABELS[pageRole] ?? 'Daily Sales Reports'}</h2>
            {histCount > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{histCount}</span>
            )}
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white shadow-sm"
            onClick={() => { setEditDate(today); setForm(EMPTY); setPriceBands([{ ...EMPTY_BAND }]); setShowForm(true); }}
          >
            <Plus size={13} /> Enter Report
          </Button>
        </div>

        {/* History */}
        {histQuery.isLoading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
            <Loader2 size={15} className="animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
            <ClipboardList size={28} className="text-slate-200" />
            <p className="text-sm text-slate-400">No reports submitted yet.</p>
            <p className="text-xs text-slate-300">Click <strong className="text-slate-500">Enter Report</strong> to submit your first report.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Location</th>
                    <th className="px-4 py-2.5 text-left">PFI</th>
                    <th className="px-4 py-2.5 text-right">Qty Sold</th>
                    <th className="px-4 py-2.5 text-right">Total Amount</th>
                    <th className="px-4 py-2.5 text-right">Submitted</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice((histPage - 1) * 10, histPage * 10).map((rpt, i) => {
                    const isPending = confirmDeleteId === rpt.id;
                    return (
                      <tr key={rpt.id} className={`text-sm border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="px-4 py-3 font-medium text-slate-800">{rpt.date || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{rpt.location || '—'}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{rpt.pfi_number || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{display(rpt.litres_sold_today)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{display(rpt.total_sales_amount, true)}</td>
                        <td className="px-4 py-3 text-right text-slate-400 text-xs">
                          {rpt.updated_at ? format(parseISO(rpt.updated_at), 'dd MMM, HH:mm') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-xs text-red-600 font-medium">Delete?</span>
                              <button type="button" onClick={() => deleteMutation.mutate(rpt.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">Yes</button>
                              <span className="text-slate-300">|</span>
                              <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-500 hover:text-slate-700">No</button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-3">
                              <button type="button" title="View report" onClick={() => setViewEntry(rpt)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-700 transition-colors">
                                <FileText size={12} /> View
                              </button>
                              <button type="button" title="Edit report" onClick={() => openEdit(rpt)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 transition-colors">
                                <Edit3 size={12} /> Edit
                              </button>
                              <button type="button" title="Download PDF" onClick={() => handleRedownload(rpt)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                                <Download size={12} /> PDF
                              </button>
                              <button type="button" title="Delete report" onClick={() => setConfirmDeleteId(rpt.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <span className="text-xs text-slate-400">
                  Showing {(histPage - 1) * 10 + 1}–{Math.min(histPage * 10, histCount)} of {histCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                    disabled={histPage <= 1 || histQuery.isFetching} onClick={() => setHistPage(p => p - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-xs text-slate-600 font-medium">{histPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                    disabled={histPage >= totalPages || histQuery.isFetching} onClick={() => setHistPage(p => p + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
