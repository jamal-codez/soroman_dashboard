import { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/client';
import {
  Plus, X, ChevronLeft, ChevronRight, Loader2, CheckCircle2,
  ClipboardList, Edit3, FileBarChart2, AlertCircle, Send,
  MapPin, User, Calendar, Package, Trash2
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

const UNIT_LABELS: Record<string, string> = { litres: 'Litres', kg: 'kg', ton: 'ton' };
const getPfiOptionUnitLabel = (p?: PFIOption | null): string =>
  p?.product_unit_label || UNIT_LABELS[(p?.product_unit || 'litres').toLowerCase()] || 'Litres';

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

const EMPTY: FormFields = {
  pfi_id: '',
  location: '',
  yesterday_carried_over_loading: '',
  product_brought_forward: '',
  litres_sold_today: '',
  price: '',
  tank_balance: '',
  num_trucks_sold: '',
  amount_paid: '',
  total_sales_amount: '',
  differentials: '',
  loading_left_over: '',
  bank_name: '',
  account_number: '',
  remarks: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const numVal = (v: unknown, decimal = false): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimal ? 4 : 0 });
};

const display = (v: unknown, money = false): string => {
  const s = String(v ?? '');
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return 'NIL';
  const formatted = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return money ? `₦${formatted}` : formatted;
};

const rawNum = (s: string) => s.replace(/,/g, '').trim();

const toNum = (s: string) => {
  const n = Number(rawNum(s));
  return Number.isFinite(n) ? n : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Field Component
// ─────────────────────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, prefix, suffix, multiline, readOnly = false, highlight = false, decimal = false, text = false, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; multiline?: boolean;
  readOnly?: boolean; highlight?: boolean; decimal?: boolean;
  /** Plain free-text input (no numeric formatting) — for things like bank name/account number. */
  text?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none z-10">
            {prefix}
          </span>
        )}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={readOnly}
            rows={2}
            placeholder="Optional…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 disabled:bg-slate-50 transition-all resize-none"
          />
        ) : text ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={readOnly}
            placeholder={placeholder || 'Optional…'}
            className={`w-full rounded-lg border py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:border-green-400 disabled:bg-slate-50 transition-all ${prefix ? 'pl-8 pr-3' : suffix ? 'pl-3 pr-10' : 'px-3'} ${highlight ? 'border-green-300 bg-green-50/40 focus:ring-green-500/30' : 'border-slate-200 bg-white focus:ring-green-500/30'}`}
          />
        ) : (
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
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
              const formattedInt = Number.isFinite(n) ? n.toLocaleString() : intPart;
              onChange(`${formattedInt}.${decPart}`);
            }}
            disabled={readOnly}
            placeholder="0"
            className={`w-full rounded-lg border py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:border-green-400 disabled:bg-slate-50 transition-all ${prefix ? 'pl-8 pr-3' : suffix ? 'pl-3 pr-10' : 'px-3'} ${highlight ? 'border-green-300 bg-green-50/40 focus:ring-green-500/30' : 'border-slate-200 bg-white focus:ring-green-500/30'}`}
          />
        )}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History Table Row
// ─────────────────────────────────────────────────────────────────────────────
function HistoryRow({
  rpt, idx, onEdit, onDelete, confirmId, onConfirmDelete, onCancelDelete,
}: {
  rpt: Record<string, unknown>;
  idx: number;
  onEdit: () => void;
  onDelete: () => void;
  confirmId: number | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const id = rpt.id as number;
  const isPending = confirmId === id;

  return (
    <tr className={`text-sm border-b border-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
      <td className="px-4 py-3 font-medium text-slate-800">{String(rpt.date || '—')}</td>
      <td className="px-4 py-3 text-slate-600">{String(rpt.location || '—')}</td>
      <td className="px-4 py-3 text-right text-slate-700">{display(rpt.litres_sold_today)}</td>
      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{display(rpt.total_sales_amount, true)}</td>
      <td className="px-4 py-3 text-right text-slate-500 text-xs">
        {rpt.updated_at ? format(parseISO(String(rpt.updated_at)), 'dd MMM, HH:mm') : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-red-600 font-medium">Delete?</span>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors"
            >
              Yes
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onCancelDelete}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              No
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800 transition-colors"
            >
              <Edit3 size={12} /> Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Generator
// ─────────────────────────────────────────────────────────────────────────────
function generateStaffDailyReportPDF(
  form: FormFields,
  date: string,
  staffName: string,
  pfiNumber: string,
  unitLabel: string,
) {
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

  // ── Header ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 46, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, 42, W, 4, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('SOROMAN ENERGY LIMITED', M, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...WHITE);
  doc.text('STAFF DAILY SALES REPORT', M, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${generatedAt}`, M, 39);

  doc.setFillColor(...GREEN);
  doc.roundedRect(W - M - 50, 14, 50, 16, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text((date || format(new Date(), 'dd MMM yyyy')).toUpperCase(), W - M - 25, 23.5, { align: 'center' });

  // ── Table ─────────────────────────────────────────────────────────
  const ROW_H  = 7;
  const SEC_H  = 7;
  const LABEL_W = 80;
  const VALUE_W = CW - LABEL_W;

  type TableEntry =
    | { kind: 'section'; title: string }
    | { kind: 'row'; label: string; value: string; highlight?: boolean };

  const entries: TableEntry[] = [
    { kind: 'row', label: 'REPORT DATE',   value: (date || '—').toUpperCase() },
    { kind: 'row', label: 'LOCATION',      value: (form.location || '—').toUpperCase() },
    { kind: 'row', label: 'PFI NUMBER',    value: (pfiNumber || '—').toUpperCase() },
    { kind: 'row', label: 'SUBMITTED BY',  value: staffName.toUpperCase() },

    { kind: 'section', title: `LOADING & OPENING FIGURES` },
    { kind: 'row', label: `YESTERDAY'S CARRIED OVER (${unitLabel.toUpperCase()})`, value: fmt(form.yesterday_carried_over_loading) },
    { kind: 'row', label: `PRODUCT BROUGHT FORWARD (${unitLabel.toUpperCase()})`,  value: fmt(form.product_brought_forward), highlight: true },

    { kind: 'section', title: 'SALES FIGURES' },
    { kind: 'row', label: `QTY SOLD TODAY (${unitLabel.toUpperCase()})`, value: fmt(form.litres_sold_today), highlight: true },
    { kind: 'row', label: `PRICE PER ${unitLabel.toUpperCase()}`,        value: fmt(form.price, true), highlight: true },
    { kind: 'row', label: `TANK BALANCE (${unitLabel.toUpperCase()})`,   value: fmt(form.tank_balance) },
    { kind: 'row', label: 'NO. OF TRUCKS SOLD',                          value: fmt(form.num_trucks_sold) },

    { kind: 'section', title: 'FINANCIAL FIGURES' },
    { kind: 'row', label: 'AMOUNT PAID',        value: fmt(form.amount_paid, true) },
    { kind: 'row', label: 'TOTAL SALES AMOUNT', value: fmt(form.total_sales_amount, true), highlight: true },
    { kind: 'row', label: 'DIFFERENTIALS',      value: fmt(form.differentials, true) },
    { kind: 'row', label: `LOADING LEFT OVER (${unitLabel.toUpperCase()})`, value: fmt(form.loading_left_over) },

    { kind: 'section', title: 'BANK DETAILS' },
    { kind: 'row', label: 'BANK NAME',       value: (form.bank_name || '—').toUpperCase() },
    { kind: 'row', label: 'ACCOUNT NUMBER',  value: (form.account_number || '—').toUpperCase() },
  ];

  let Y = 52;

  // Draw outer border around all rows
  const totalH = entries.reduce((sum, e) => sum + (e.kind === 'section' ? SEC_H : ROW_H), 0);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, totalH, 'S');

  let rowIdx = 0;
  entries.forEach((entry, ei) => {
    const isLast = ei === entries.length - 1;

    if (entry.kind === 'section') {
      doc.setFillColor(...NAVY);
      doc.rect(M, Y, CW, SEC_H, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text(entry.title, M + 4, Y + 4.8);
      Y += SEC_H;
      rowIdx = 0;
    } else {
      // Label cell
      doc.setFillColor(...LBLBG);
      doc.rect(M, Y, LABEL_W, ROW_H, 'F');

      // Value cell
      doc.setFillColor(...(entry.highlight ? ([236, 253, 245] as RGB) : ([255, 255, 255] as RGB)));
      doc.rect(M + LABEL_W, Y, VALUE_W, ROW_H, 'F');

      // Divider + bottom rule
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(M + LABEL_W, Y, M + LABEL_W, Y + ROW_H);
      if (!isLast) doc.line(M, Y + ROW_H, M + CW, Y + ROW_H);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(70, 80, 100);
      doc.text(entry.label, M + 4, Y + 4.8);

      doc.setFont('helvetica', entry.highlight ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...(entry.highlight ? GREEN : DARK));
      doc.text(entry.value, M + LABEL_W + 5, Y + 4.8);

      Y += ROW_H;
      rowIdx++;
    }
  });

  // ── Remarks ────────────────────────────────────────────────────────
  Y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 100);
  doc.text('REMARKS', M, Y);
  Y += 4;

  const REMARKS_H = 28;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, REMARKS_H, 'FD');

  if (form.remarks?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(160, 170, 185);
    doc.text('No remarks provided.', M + 4, Y + 8);
  }

  Y += REMARKS_H + 14;

  // ── Signatures ─────────────────────────────────────────────────────
  const SIG_W = (CW - 12) / 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(M, Y, M + SIG_W, Y);
  doc.line(M + SIG_W + 12, Y, M + SIG_W + 12 + SIG_W, Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('STAFF SIGNATURE / DATE', M, Y + 5);
  doc.text('AUTHORISED BY / DATE', M + SIG_W + 12, Y + 5);

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, H - 12, W, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Soroman Energy Limited — Confidential', M, H - 4.5);
  doc.text(`Page 1 of 1  •  ${generatedAt}`, W - M, H - 4.5, { align: 'right' });

  const safe = (date || format(new Date(), 'yyyy-MM-dd')).replace(/-/g, '');
  doc.save(`StaffDailySalesReport_${safe}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function StaffDailySalesReportForm() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Auth info from localStorage
  const rawUser = localStorage.getItem('user') || sessionStorage.getItem('user') || '{}';
  let currentUser: { full_name?: string; email?: string } = {};
  try { currentUser = JSON.parse(rawUser); } catch { /* ignore */ }
  const staffName = localStorage.getItem('fullname') || currentUser.full_name || currentUser.email || 'Unknown';

  // ── State ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editDate, setEditDate] = useState(today);
  const [form, setForm] = useState<FormFields>(EMPTY);
  const submittedSnapshot = useRef<{ form: FormFields; date: string; pfiNumber: string; unitLabel: string } | null>(null);
  const [histPage, setHistPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const set = useCallback((key: keyof FormFields) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────
  const pfiQuery = useQuery({
    queryKey: ['staff-pfi-data', today],
    queryFn: () => apiClient.admin.getStaffReportPFIData(today),
    staleTime: 30_000,
  });

  const histQuery = useQuery({
    queryKey: ['staff-report-history', histPage],
    queryFn: () => apiClient.admin.getStaffReportHistory(histPage, 10, false),
    staleTime: 15_000,
    keepPreviousData: true,
  });

  const pfis: PFIOption[] = pfiQuery.data?.pfis ?? [];
  const selectedPfiOption = pfis.find(p => String(p.pfi_id) === form.pfi_id);
  const selectedPfiUnitLabel = getPfiOptionUnitLabel(selectedPfiOption);

  // ── Auto-fill when PFI selected ─────────────────────────────────────
  useEffect(() => {
    if (!form.pfi_id) return;
    const pfi = pfis.find(p => String(p.pfi_id) === form.pfi_id);
    if (!pfi) return;

    setForm(prev => ({
      ...prev,
      location: pfi.location_name,
      product_brought_forward: numVal(pfi.remaining_balance),
      litres_sold_today: numVal(pfi.sold_today),
      price: numVal(pfi.price, true),
    }));
  }, [form.pfi_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-calculate total_sales_amount, tank_balance and differentials ──
  useEffect(() => {
    const litres = toNum(form.litres_sold_today);
    const price  = toNum(form.price);
    const opening = toNum(form.product_brought_forward);
    const carryover = toNum(form.yesterday_carried_over_loading);
    const amountPaid = toNum(form.amount_paid);

    const totalSales = litres * price;
    const tankBalance = opening + carryover - litres;
    // Differentials: gap (in Naira) between what was actually paid and the expected sales amount
    const differentials = amountPaid - totalSales;

    setForm(prev => ({
      ...prev,
      total_sales_amount: totalSales > 0
        ? totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : '',
      tank_balance: tankBalance > 0
        ? tankBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : '',
      differentials: (amountPaid > 0 || totalSales > 0)
        ? differentials.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : '',
    }));
  }, [form.litres_sold_today, form.price, form.product_brought_forward, form.yesterday_carried_over_loading, form.amount_paid]);

  // ── Load existing entry when editing ───────────────────────────────
  const existingQuery = useQuery({
    queryKey: ['staff-existing-entry', editDate, form.location],
    queryFn: () => apiClient.admin.getMyStaffDailyEntry(editDate, form.location || undefined),
    enabled: showForm && !!form.location,
    staleTime: 10_000,
  });

  // Note: deliberately NOT auto-filling the form from `existingQuery` —
  // the new-report form should always start blank. We only surface a
  // warning (below) so the user knows a resubmit will overwrite it.

  // ── Edit from history ───────────────────────────────────────────────
  const openEdit = (rpt: Record<string, unknown>) => {
    setEditDate(String(rpt.date ?? today));
    // Pre-select the PFI that was used for this entry (pfi_number is globally
    // unique) so resubmitting updates the same row instead of creating a new one.
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
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => apiClient.admin.submitStaffDailyReport({
      date: editDate,
      location: form.location,
      pfi_number: pfis.find(p => String(p.pfi_id) === form.pfi_id)?.pfi_number || '',
      submitted_by_name: staffName,
      yesterday_carried_over_loading: rawNum(form.yesterday_carried_over_loading) || '0',
      product_brought_forward: rawNum(form.product_brought_forward) || '0',
      litres_sold_today: rawNum(form.litres_sold_today) || '0',
      price: rawNum(form.price) || '0',
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
        const { form: f, date, pfiNumber, unitLabel } = submittedSnapshot.current;
        generateStaffDailyReportPDF(f, date, staffName, pfiNumber, unitLabel);
        submittedSnapshot.current = null;
      }
      setShowForm(false);
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ['staff-report-history'] });
      qc.invalidateQueries({ queryKey: ['staff-daily-list'] });
      qc.invalidateQueries({ queryKey: ['staff-report-dates'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Delete ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteStaffDailyReport(id),
    onSuccess: () => {
      toast({ title: 'Report deleted', description: 'The entry has been removed.' });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['staff-report-history'] });
      qc.invalidateQueries({ queryKey: ['staff-daily-list'] });
      qc.invalidateQueries({ queryKey: ['staff-report-dates'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      setConfirmDeleteId(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.location.trim()) {
      toast({ title: 'Select a PFI first', description: 'A PFI is required to identify the location.', variant: 'destructive' });
      return;
    }
    submittedSnapshot.current = {
      form: { ...form },
      date: editDate,
      pfiNumber: pfis.find(p => String(p.pfi_id) === form.pfi_id)?.pfi_number || '',
      unitLabel: selectedPfiUnitLabel,
    };
    mutation.mutate();
  };

  // ── Pagination ──────────────────────────────────────────────────────
  const totalPages = histQuery.data?.total_pages ?? 1;
  const histCount  = histQuery.data?.count ?? 0;
  const history    = histQuery.data?.results ?? [];

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Staff Daily Report</h1>
                <p className="text-sm text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <User size={13} />
                    <span className="font-medium text-slate-700">{staffName}</span>
                  </span>
                  <span className="mx-2 text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={13} />
                    {format(new Date(), 'EEEE, dd MMM yyyy')}
                  </span>
                </p>
              </div>
              <Button
                onClick={() => {
                  setShowForm(f => !f);
                  if (!showForm) {
                    setEditDate(today);
                    setForm(EMPTY);
                  }
                }}
                className={`gap-2 shadow-sm transition-all font-semibold ${showForm ? 'bg-slate-700 hover:bg-slate-800 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
              >
                {showForm ? <><X size={15} /> Cancel</> : <><Plus size={15} /> New Report</>}
              </Button>
            </div>

            {/* ── Form Panel ─────────────────────────────────────── */}
            {showForm && (
              <div className="rounded-2xl border border-green-200/60 bg-white shadow-md shadow-green-100/30 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">

                {/* Form header */}
                <div className="border-b border-slate-100 bg-gradient-to-r from-green-600 to-green-700 px-5 py-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ClipboardList size={16} />
                    {editDate === today ? "Today's Report" : `Report for ${editDate}`}
                  </h2>
                  <p className="text-xs text-green-200 mt-0.5">
                    Select a PFI to upload your report, you can edit any auto-filled field before submitting.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">

                  {/* ── Report Date ─── */}
                  <div className="flex items-center gap-3">
                    <Calendar size={15} className="text-green-600 shrink-0" />
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                      Report Date
                    </label>
                    <input
                      type="date"
                      title="Report Date"
                      value={editDate}
                      max={today}
                      onChange={(e) => setEditDate(e.target.value || today)}
                      className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all"
                    />
                  </div>

                  {/* ── Step 1: PFI Selection ─── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold shrink-0">1</span>
                      <span className="text-sm font-semibold text-slate-700">Select PFI</span>
                    </div>

                    {pfiQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading PFIs…
                      </div>
                    ) : pfis.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        <AlertCircle size={14} /> No PFIs found for today.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {pfis.map(pfi => {
                          const isSelected = form.pfi_id === String(pfi.pfi_id);
                          return (
                            <button
                              key={pfi.pfi_id}
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, pfi_id: String(pfi.pfi_id) }))}
                              className={`text-left rounded-xl border p-3.5 transition-all ${isSelected ? 'border-green-500 bg-green-50 shadow-sm shadow-green-100' : 'border-slate-200 bg-white hover:border-green-300 hover:bg-green-50/30'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className={`text-xs font-bold truncate ${isSelected ? 'text-green-700' : 'text-slate-800'}`}>
                                    {pfi.pfi_number}
                                  </p>
                                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    <MapPin size={10} /> {pfi.location_name}
                                    <span className="text-slate-300 mx-1">·</span>
                                    <Package size={10} /> {pfi.product_name}
                                  </p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                                )}
                              </div>
                              <div className="mt-2 flex gap-3 text-[10px]">
                                <span className="text-slate-500">
                                  Remaining: <strong className={Number(pfi.remaining_balance) <= 0 ? 'text-red-500' : 'text-slate-700'}>
                                    {Number(pfi.remaining_balance).toLocaleString(undefined, { maximumFractionDigits: 0 })} {getPfiOptionUnitLabel(pfi)}
                                  </strong>
                                </span>
                                <span className="text-slate-500">
                                  Sold: <strong className={Number(pfi.sold_today) > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                                    {Number(pfi.sold_today).toLocaleString(undefined, { maximumFractionDigits: 0 })} {getPfiOptionUnitLabel(pfi)}
                                  </strong>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Location display */}
                    {form.location && (
                      <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <MapPin size={12} className="text-green-500" />
                        Location: <strong>{form.location}</strong>
                        {/* {existingQuery.data?.report && (
                          <span className="ml-auto text-amber-600 font-semibold">⚠ An entry for this date already exists — submitting will overwrite it</span>
                        )} */}
                      </div>
                    )}
                  </div>

                  {/* ── Step 2: Fill Fields ─── */}
                  {form.pfi_id && (
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white text-[10px] font-bold shrink-0">2</span>
                        <span className="text-sm font-semibold text-slate-700">Confirm &amp; Fill Details</span>
                        {/* <span className="text-[10px] text-slate-400 ml-1">Fields in green are auto-filled or calculated — review and edit as needed</span> */}
                      </div>

                      {/* Loading Figures */}
                      <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                        <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Loading &amp; Opening Figures</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Yesterday's Carried Over Loading" value={form.yesterday_carried_over_loading} onChange={set('yesterday_carried_over_loading')} suffix={selectedPfiUnitLabel} />
                          <Field label="Product Brought Forward (Opening Qty)" value={form.product_brought_forward} onChange={set('product_brought_forward')} suffix={selectedPfiUnitLabel} highlight />
                        </div>
                      </fieldset>

                      {/* Sales Figures */}
                      <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                        <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Sales Figures</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Qty Sold Today" value={form.litres_sold_today} onChange={set('litres_sold_today')} suffix={selectedPfiUnitLabel} highlight />
                          <Field label={`Price per ${selectedPfiUnitLabel}`} value={form.price} onChange={set('price')} prefix="₦" highlight decimal />
                          <Field label="Tank Balance" value={form.tank_balance} onChange={set('tank_balance')} suffix={selectedPfiUnitLabel} highlight />
                          <Field label="No. of Trucks Sold" value={form.num_trucks_sold} onChange={set('num_trucks_sold')} />
                        </div>
                      </fieldset>

                      {/* Financial Figures */}
                      <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                        <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Financial Figures</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Amount Paid" value={form.amount_paid} onChange={set('amount_paid')} prefix="₦" />
                          <Field label="Total Sales Amount" value={form.total_sales_amount} onChange={set('total_sales_amount')} prefix="₦" highlight />
                          <Field label="Differentials" value={form.differentials} onChange={set('differentials')} prefix="₦" highlight />
                          <Field label="Loading Left Over" value={form.loading_left_over} onChange={set('loading_left_over')} suffix={selectedPfiUnitLabel} />
                        </div>
                      </fieldset>

                      {/* Payment Destination */}
                      <fieldset className="rounded-xl border border-slate-200 p-4 space-y-4">
                        <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Bank Details</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Bank Name" value={form.bank_name} onChange={set('bank_name')} text placeholder="e.g. Zenith Bank" />
                          <Field label="Account Number" value={form.account_number} onChange={set('account_number')} text placeholder="e.g. 1234567890" />
                        </div>
                      </fieldset>

                      {/* Remarks */}
                      <fieldset className="rounded-xl border border-slate-200 p-4">
                        {/* <legend className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Remarks</legend> */}
                        <Field label="Remarks" value={form.remarks} onChange={set('remarks')} multiline />
                      </fieldset>
                    </div>
                  )}

                  {/* Submit */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowForm(false); setForm(EMPTY); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={mutation.isPending || !form.pfi_id}
                      className="gap-1.5 bg-green-600 hover:bg-green-700 text-white min-w-[150px]"
                    >
                      {mutation.isPending ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving…</>
                      ) : (
                        <><Send size={14} /> Submit Report</>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Previous Submissions Table ─────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <FileBarChart2 size={16} className="text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-800">My Submission History</h2>
                  {histCount > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {histCount}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  Page {histPage} of {totalPages}
                </span>
              </div>

              {histQuery.isLoading ? (
                <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
                  <Loader2 size={15} className="animate-spin" /> Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center px-4">
                  <ClipboardList size={32} className="text-slate-200" />
                  <p className="text-sm text-slate-400">No submissions yet.</p>
                  <p className="text-xs text-slate-300">Click <strong className="text-slate-500">New Report</strong> above to submit your first report.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                          <th className="px-4 py-2.5 text-left">Date</th>
                          <th className="px-4 py-2.5 text-left">Location</th>
                          <th className="px-4 py-2.5 text-right">Qty Sold</th>
                          <th className="px-4 py-2.5 text-right">Amount</th>
                          <th className="px-4 py-2.5 text-right">Submitted</th>
                          <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((rpt, i) => (
                          <HistoryRow
                            key={`${rpt.date}-${rpt.location}`}
                            rpt={rpt}
                            idx={i}
                            onEdit={() => openEdit(rpt)}
                            onDelete={() => setConfirmDeleteId(rpt.id as number)}
                            confirmId={confirmDeleteId}
                            onConfirmDelete={() => deleteMutation.mutate(confirmDeleteId!)}
                            onCancelDelete={() => setConfirmDeleteId(null)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                      <span className="text-xs text-slate-400">
                        Showing {(histPage - 1) * 10 + 1}–{Math.min(histPage * 10, histCount)} of {histCount}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={histPage <= 1 || histQuery.isFetching}
                          onClick={() => setHistPage(p => p - 1)}
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <span className="text-xs text-slate-600 font-medium">
                          {histPage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={histPage >= totalPages || histQuery.isFetching}
                          onClick={() => setHistPage(p => p + 1)}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
