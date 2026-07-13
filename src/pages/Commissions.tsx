//
// COMMISSIONS — ₦1/litre (orders before 1 Jul 2026) or ₦0.50/litre (from 1 Jul 2026) paid to the order's customer (Facilitator) once
// tickets have been generated for that order. Shows the truck breakdown per
// order, lets finance confirm payout (with a confirmation dialog so a stray
// click can't mark something paid), and exports a daily commission report.
//
import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CommaInput } from '@/components/ui/comma-input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, X, CalendarDays, Truck, Package, Clock, CheckCircle2, XCircle,
  MapPin, FileText, RefreshCw, AlertTriangle, Banknote, ClipboardList, Download,
  Loader2, Settings2,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  format, parseISO, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear,
  isAfter, isBefore, startOfDay, endOfDay,
} from 'date-fns';
import { apiClient, fetchAllPages } from '@/api/client';
import { getOrderReference } from '@/lib/orderReference';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Truck {
  id: number;
  truck_number?: string | null;
  quantity_litres?: number | string | null;
  ticket_status?: string | null;
  created_at?: string | null;
}

interface Order {
  id: number;
  user: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    phone?: string;
    companyName?: string;
    company_name?: string;
  };
  companyName?: string;
  company_name?: string;
  customer?: { companyName?: string; company_name?: string };
  location_name?: string;
  state?: string;
  status: string;
  created_at: string;
  products: Array<{ name?: string }>;
  quantity?: number | string;
  reference?: string;
  pfi_id?: number | null;
  pfi_number?: string | null;
  payment_confirmed_at?: string | null;
  payment_confirmed_by_name?: string | null;
  ticket_generated_at?: string | null;
  ticket_generated_by_name?: string | null;
  commission_amount?: string | number | null;
  commission_paid_at?: string | null;
  commission_paid_by_name?: string | null;
  commission_bank_name?: string | null;
  commission_account_name?: string | null;
  commission_account_number?: string | null;
  trucks?: Truck[];
}

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
type CommissionStatusFilter = 'all' | 'pending' | 'paid';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

// Per-location, tiered ₦/litre commission rate — mirrors
// LocationCommissionRate.rate_for_qty() on the backend, which is the source
// of truth once a commission is actually confirmed. A location with no
// configured rate falls back to the flat ₦0.5/litre default.
type LocationRate = { below: number; mid: number; above: number };
type RatesByLocation = Record<string, LocationRate>;
const DEFAULT_RATE: LocationRate = { below: 0.5, mid: 0.5, above: 0.5 };

const getCommissionRate = (rates: RatesByLocation, locationName: string, qtyLitres: number): number => {
  const rate = rates[locationName] || DEFAULT_RATE;
  if (qtyLitres >= 1_000_000) return rate.above;
  if (qtyLitres >= 500_000) return rate.mid;
  return rate.below;
};

const toNum = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number) => n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

const fmtDateTime = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const getCustomerName = (o: Order): string => {
  const fn = o.user?.first_name ?? '';
  const ln = o.user?.last_name ?? '';
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return (
    o.companyName || o.company_name ||
    o.customer?.companyName || o.customer?.company_name ||
    o.user?.email || '—'
  );
};

const getCompanyName = (o: Order): string =>
  o.user?.companyName || o.user?.company_name ||
  o.companyName || o.company_name ||
  o.customer?.companyName || o.customer?.company_name || '—';

const getPhone = (o: Order): string => o.user?.phone_number || o.user?.phone || '—';
const getLocation = (o: Order): string => o.location_name || o.state || '—';
const getPfiNumber = (o: Order): string => o.pfi_number || '—';

const getTrucks = (o: Order): Truck[] => o.trucks ?? [];

const getTotalQty = (o: Order): number => {
  const trucks = getTrucks(o);
  if (trucks.length > 0) return trucks.reduce((s, t) => s + toNum(t.quantity_litres), 0);
  return toNum(o.quantity);
};

const getCommissionAmount = (rates: RatesByLocation, o: Order): number => {
  if (o.commission_paid_at) return toNum(o.commission_amount);
  const qty = getTotalQty(o);
  return qty * getCommissionRate(rates, getLocation(o), qty);
};

const isPaid = (o: Order): boolean => Boolean(o.commission_paid_at);

const matchesPreset = (iso: string, preset: TimePreset): boolean => {
  try {
    const d = parseISO(iso);
    switch (preset) {
      case 'today': return isToday(d);
      case 'yesterday': return isYesterday(d);
      case 'week': return isThisWeek(d, { weekStartsOn: 1 });
      case 'month': return isThisMonth(d);
      case 'year': return isThisYear(d);
      case 'all': return true;
      default: return true;
    }
  } catch { return false; }
};

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Date Range' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Daily Commission Report — types & PDF generator
// ═══════════════════════════════════════════════════════════════════════════

interface DailyReportForm {
  location: string;
  pfi: string;
  date: string;
  litresSoldToday: string;
  numberOfTrucks: string;
  numberOfCustomers: string;
  numberOfOrders: string;
  totalCommissionPaid: string;
  staffNameAndDate: string;
  remarks: string;
}

const EMPTY_DAILY_REPORT: DailyReportForm = {
  location: '',
  pfi: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  litresSoldToday: '',
  numberOfTrucks: '',
  numberOfCustomers: '',
  numberOfOrders: '',
  totalCommissionPaid: '',
  staffNameAndDate: '',
  remarks: '',
};

const generateDailyReportPDF = (form: DailyReportForm) => {
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
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text('DAILY COMMISSION REPORT', M, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${generatedAt}`, M, 39);

  const dateStr = form.date
    ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy').toUpperCase()
    : format(new Date(), 'dd MMM yyyy').toUpperCase();
  doc.setFillColor(...GREEN);
  doc.roundedRect(W - M - 50, 14, 50, 16, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(dateStr, W - M - 25, 23.5, { align: 'center' });

  // ── Table ─────────────────────────────────────────────────────────
  let Y = 54;
  const ROW_H = 8;
  const LABEL_W = 72;
  const VALUE_W = CW - LABEL_W;

  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: 'LOCATION', value: (form.location || '—').toUpperCase() },
    { label: 'PFI', value: (form.pfi || '—').toUpperCase() },
    { label: 'DATE', value: form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy').toUpperCase() : '—' },
    { label: 'LITRES SOLD TODAY', value: form.litresSoldToday ? `${Number(form.litresSoldToday.replace(/,/g, '')).toLocaleString()} LITRES` : '—' },
    { label: 'NO. OF TRUCKS SOLD', value: (form.numberOfTrucks || '—').toUpperCase() },
    { label: 'NO. OF CUSTOMERS', value: (form.numberOfCustomers || '—').toUpperCase() },
    { label: 'NO. OF ORDERS', value: (form.numberOfOrders || '—').toUpperCase() },
    { label: 'TOTAL COMMISSION PAID', value: form.totalCommissionPaid ? `NGN ${Number(form.totalCommissionPaid.replace(/,/g, '')).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '—', highlight: true },
    { label: 'STAFF NAME & DATE', value: (form.staffNameAndDate || '—').toUpperCase() },
  ];

  // Outer border
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, rows.length * ROW_H, 'S');

  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;

    // Label cell background
    doc.setFillColor(...LBLBG);
    doc.rect(M, Y, LABEL_W, ROW_H, 'F');

    // Value cell background
    if (row.highlight) {
      doc.setFillColor(236, 253, 245);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(M + LABEL_W, Y, VALUE_W, ROW_H, 'F');

    // Vertical divider
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(M + LABEL_W, Y, M + LABEL_W, Y + ROW_H);

    // Row bottom border
    if (!isLast) {
      doc.line(M, Y + ROW_H, M + CW, Y + ROW_H);
    }

    // Label text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(70, 80, 100);
    doc.text(row.label, M + 4, Y + 5.5);

    // Value text
    doc.setFont('helvetica', row.highlight ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...(row.highlight ? GREEN : DARK));
    doc.text(row.value, M + LABEL_W + 5, Y + 5.5);

    Y += ROW_H;
  });

  // ── Remarks ────────────────────────────────────────────────────────
  Y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 100);
  doc.text('REMARKS', M, Y);
  Y += 4;

  const REMARKS_H = 36;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, REMARKS_H, 'FD');

  if (form.remarks.trim()) {
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

  Y += REMARKS_H + 18;

  // ── Signatures ─────────────────────────────────────────────────────
  const SIG_W = (CW - 12) / 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(M, Y, M + SIG_W, Y);
  doc.line(M + SIG_W + 12, Y, M + SIG_W + 12 + SIG_W, Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('PREPARED BY / DATE', M, Y + 5);
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

  const safeDate = form.date || format(new Date(), 'yyyy-MM-dd');
  const safeLoc = (form.location || 'REPORT').replace(/[/\\*?:[\]]/g, '-');
  doc.save(`DAILY COMMISSION REPORT - ${safeLoc} - ${safeDate}.pdf`);
};

// ═══════════════════════════════════════════════════════════════════════════
// Daily Report Entry Dialog
// ═══════════════════════════════════════════════════════════════════════════

const readScopedLocations = (): string[] => {
  try { return JSON.parse(localStorage.getItem('location_names') || '[]') as string[]; }
  catch { return []; }
};

const readScopedPfis = (): string[] => {
  try { return JSON.parse(localStorage.getItem('pfi_numbers') || '[]') as string[]; }
  catch { return []; }
};

const buildInitialForm = (): DailyReportForm => {
  const fullname = localStorage.getItem('fullname') || '';
  const today = format(new Date(), 'yyyy-MM-dd');
  const staffLine = fullname ? `${fullname} — ${format(new Date(), 'dd MMM yyyy')}` : '';
  return { ...EMPTY_DAILY_REPORT, date: today, staffNameAndDate: staffLine };
};

const DailyReportDialog = ({
  open, onClose,
  locations: propLocations,
  pfis: propPfis,
}: {
  open: boolean;
  onClose: () => void;
  locations?: string[];
  pfis?: string[];
}) => {
  const [form, setForm] = useState<DailyReportForm>(buildInitialForm);
  const [submitted, setSubmitted] = useState(false);

  const scopedLocations = propLocations?.length ? propLocations : readScopedLocations();
  const scopedPfis = propPfis?.length ? propPfis : readScopedPfis();

  const set = (field: keyof DailyReportForm) => (v: string) =>
    setForm(f => ({ ...f, [field]: v }));

  const handleSubmit = () => {
    if (!form.location || !form.date) return;
    generateDailyReportPDF(form);
    setSubmitted(true);
  };

  const handleDownload = () => {
    generateDailyReportPDF(form);
  };

  const handleClose = () => {
    setForm(buildInitialForm());
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <ClipboardList className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Daily Commission Report</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                {submitted ? 'Report ready — download your PDF below.' : 'Fill in the report details for today.'}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Enter daily commission report details</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-5 py-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="text-emerald-600" size={24} />
              </div>
              <div>
                <p className="font-semibold text-emerald-800">Report Submitted</p>
                <p className="text-sm text-emerald-700 mt-0.5">
                  {form.location} · {form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy') : ''}
                </p>
              </div>
            </div>

            {/* Summary preview */}
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
              {[
                ['Location', form.location || '—'],
                ['PFI', form.pfi || '—'],
                ['Date', form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy') : '—'],
                ['Litres Sold Today', form.litresSoldToday ? `${Number(form.litresSoldToday.replace(/,/g, '')).toLocaleString()} L` : '—'],
                ['No. of Trucks Sold', form.numberOfTrucks || '—'],
                ['No. of Customers', form.numberOfCustomers || '—'],
                ['No. of Orders', form.numberOfOrders || '—'],
                ['Total Commission Paid', form.totalCommissionPaid ? `₦${Number(form.totalCommissionPaid.replace(/,/g, '')).toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '—'],
                ['Staff Name & Date', form.staffNameAndDate || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center px-4 py-2.5">
                  <span className="w-44 text-xs font-medium text-slate-500 uppercase tracking-wide shrink-0">{label}</span>
                  <span className={`font-medium ${label === 'Total Commission Paid' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</span>
                </div>
              ))}
              {form.remarks && (
                <div className="px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Remarks</span>
                  <span className="text-slate-700 text-sm">{form.remarks}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">

            {/* Location + PFI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Location <span className="text-red-500">*</span>
                </Label>
                <select
                  aria-label="Location"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.location}
                  onChange={e => set('location')(e.target.value)}
                >
                  <option value="">Select location</option>
                  {scopedLocations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                {scopedLocations.length === 0 && (
                  <p className="text-xs text-slate-400">No locations assigned to your account.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">PFI</Label>
                <select
                  aria-label="PFI"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.pfi}
                  onChange={e => set('pfi')(e.target.value)}
                >
                  <option value="">Select PFI</option>
                  {scopedPfis.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {scopedPfis.length === 0 && (
                  <p className="text-xs text-slate-400">No PFIs assigned to your account.</p>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Date <span className="text-red-500">*</span>
              </Label>
              <Input type="date" value={form.date} onChange={e => set('date')(e.target.value)} />
            </div>

            <div className="h-px bg-slate-100" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Daily Figures</p>

            {/* Quantities */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Litres Sold Today</Label>
                <CommaInput placeholder="e.g. 45,000" value={form.litresSoldToday} onValueChange={set('litresSoldToday')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">No. of Trucks Sold</Label>
                <Input type="number" min="0" placeholder="e.g. 3" value={form.numberOfTrucks} onChange={e => set('numberOfTrucks')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">No. of Customers</Label>
                <Input type="number" min="0" placeholder="e.g. 5" value={form.numberOfCustomers} onChange={e => set('numberOfCustomers')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">No. of Orders</Label>
                <Input type="number" min="0" placeholder="e.g. 8" value={form.numberOfOrders} onChange={e => set('numberOfOrders')(e.target.value)} />
              </div>
            </div>

            {/* Commission */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Total Commission Paid (₦)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
                <CommaInput
                  className="pl-7"
                  placeholder="e.g. 45,000.00"
                  value={form.totalCommissionPaid}
                  onValueChange={set('totalCommissionPaid')}
                />
              </div>
            </div>

            {/* Staff name & date — auto-filled from logged-in user */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Staff Name &amp; Date</Label>
              <Input
                value={form.staffNameAndDate}
                readOnly
                className="bg-slate-50 text-slate-600 cursor-default"
              />
              <p className="text-xs text-slate-400">Auto-filled from your login session.</p>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Remarks</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any additional notes or observations…"
                value={form.remarks}
                onChange={e => set('remarks')(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose}>
            {submitted ? 'Close' : 'Cancel'}
          </Button>
          {submitted ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleDownload}>
              <Download size={15} /> Download PDF
            </Button>
          ) : (
            <Button
              className="gap-2"
              onClick={handleSubmit}
              disabled={!form.location.trim() || !form.date}
            >
              <CheckCircle2 size={15} /> Submit Report
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Confirm Payout Dialog
// ═══════════════════════════════════════════════════════════════════════════

const ConfirmPayoutDialog = ({
  order,
  open,
  onClose,
  onConfirmed,
  rates,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  rates: RatesByLocation;
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const ref = getOrderReference(order);
  const amount = getCommissionAmount(rates, order);
  const qty = getTotalQty(order);
  const rate = getCommissionRate(rates, getLocation(order), qty);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.admin.confirmCommissionPayment(order.id);
      onConfirmed();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm commission payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Banknote className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Confirm Commission Payout</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                Ref: <span className="font-mono font-semibold text-amber-700">{ref}</span>
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Confirm commission payout for this order</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <p className="text-sm text-slate-700">
              You're about to mark this order's commission as <span className="font-semibold">paid</span> to{' '}
              <span className="font-semibold">{getCustomerName(order)}</span>.
            </p>
            <div className="flex items-center justify-between text-sm pt-1 border-t border-amber-200">
              <span className="text-slate-500">Total Quantity</span>
              <span className="font-semibold text-slate-800">{fmtQty(qty)} L</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Commission (₦{rate}/L)</span>
              <span className="font-bold text-emerald-700">{fmt(amount)}</span>
            </div>
          </div>

          {(order.commission_bank_name || order.commission_account_number) && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pay to (customer's account)</p>
              {order.commission_bank_name && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Bank</span>
                  <span className="font-semibold text-slate-800">{order.commission_bank_name}</span>
                </div>
              )}
              {order.commission_account_name && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Account Name</span>
                  <span className="font-semibold text-slate-800">{order.commission_account_name}</span>
                </div>
              )}
              {order.commission_account_number && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Account Number</span>
                  <span className="font-mono font-bold text-slate-900">{order.commission_account_number}</span>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            This action is recorded against your account and cannot be undone from this page.
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <><RefreshCw size={13} className="animate-spin" /> Confirming…</>
            ) : (
              <><CheckCircle2 size={13} /> Confirm Pay</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Commission Rates Dialog — per-location, tiered ₦/litre rates
// ═══════════════════════════════════════════════════════════════════════════

type RateEntry = {
  location_id: number;
  location_name: string;
  rate_below_500k: string;
  rate_500k_to_1m: string;
  rate_above_1m: string;
};

const CommissionRateRow = ({ rate, onSaved }: { rate: RateEntry; onSaved: () => void }) => {
  const [below, setBelow] = useState(rate.rate_below_500k);
  const [mid, setMid] = useState(rate.rate_500k_to_1m);
  const [above, setAbove] = useState(rate.rate_above_1m);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = below !== rate.rate_below_500k || mid !== rate.rate_500k_to_1m || above !== rate.rate_above_1m;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.admin.setCommissionRate(rate.location_id, {
        rate_below_500k: below,
        rate_500k_to_1m: mid,
        rate_above_1m: above,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate.');
    } finally {
      setSaving(false);
    }
  };

  const applyFlat = () => {
    // Convenience for "one rate for every order regardless of quantity"
    // locations — copies the first tier's value into the other two.
    setMid(below);
    setAbove(below);
  };

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-800 whitespace-nowrap">{rate.location_name}</TableCell>
      <TableCell>
        <Input type="number" step="0.01" min="0" value={below} onChange={e => setBelow(e.target.value)} className="w-24 h-9" />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" min="0" value={mid} onChange={e => setMid(e.target.value)} className="w-24 h-9" />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" min="0" value={above} onChange={e => setAbove(e.target.value)} className="w-24 h-9" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={applyFlat} title="Copy the first tier's rate into the other two">
            Flat
          </Button>
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave} className="gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Save
          </Button>
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </TableCell>
    </TableRow>
  );
};

const CommissionRatesDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['commission-rates'],
    queryFn: () => apiClient.admin.getCommissionRates(),
    staleTime: 30_000,
    enabled: open,
  });

  const rates = data?.results ?? [];

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['commission-rates'] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <Settings2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Commission Rates</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                Set the ₦/litre commission per location, by order quantity tier.
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Set per-location, tiered commission rates</DialogDescription>
        </DialogHeader>

        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Want a flat rate for a location regardless of quantity? Set the "Below 500k" rate, then click
          <span className="font-semibold"> Flat</span> to copy it into the other two tiers.
        </p>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" size={22} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold text-slate-700">Location</TableHead>
                  <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Below 500k (₦/L)</TableHead>
                  <TableHead className="font-semibold text-slate-700 whitespace-nowrap">500k–1m (₦/L)</TableHead>
                  <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Above 1m (₦/L)</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[140px]">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map(rate => (
                  <CommissionRateRow key={rate.location_id} rate={rate} onSaved={handleSaved} />
                ))}
                {rates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-400 py-6">No locations found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function Commissions() {
  const routeLocation = useLocation();
  const autoOpenReport = new URLSearchParams(routeLocation.search).get('report') === 'true';

  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [calRange, setCalRange] = useState<{ from?: Date; to?: Date }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommissionStatusFilter>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [pfiFilter, setPfiFilter] = useState('all');

  const [payoutOrder, setPayoutOrder] = useState<Order | null>(null);
  const [dailyReportOpen, setDailyReportOpen] = useState(autoOpenReport);

  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['commissions-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const ratesQuery = useQuery({
    queryKey: ['commission-rates'],
    queryFn: () => apiClient.admin.getCommissionRates(),
    staleTime: 30_000,
  });

  const [ratesDialogOpen, setRatesDialogOpen] = useState(false);

  const ratesByLocation: RatesByLocation = useMemo(() => {
    const map: RatesByLocation = {};
    (ratesQuery.data?.results ?? []).forEach(r => {
      map[r.location_name] = {
        below: toNum(r.rate_below_500k),
        mid: toNum(r.rate_500k_to_1m),
        above: toNum(r.rate_above_1m),
      };
    });
    return map;
  }, [ratesQuery.data]);

  // No eligibility gate — every order shows up here as soon as it's created.
  const eligibleOrders: Order[] = useMemo(() => data?.results ?? [], [data]);

  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    eligibleOrders.forEach(o => { const l = getLocation(o); if (l !== '—') s.add(l); });
    return Array.from(s).sort();
  }, [eligibleOrders]);

  const uniquePfis = useMemo(() => {
    const s = new Set<string>();
    eligibleOrders.forEach(o => { const pfi = getPfiNumber(o); if (pfi !== '—') s.add(pfi); });
    return Array.from(s).sort();
  }, [eligibleOrders]);

  const filteredOrders = useMemo(() => {
    return eligibleOrders.filter(o => {
      const dateStr = o.created_at;
      if (timePreset === 'custom') {
        if (customFrom || customTo) {
          try {
            const d = parseISO(dateStr);
            if (customFrom && isBefore(d, startOfDay(parseISO(customFrom)))) return false;
            if (customTo && isAfter(d, endOfDay(parseISO(customTo)))) return false;
          } catch { return false; }
        }
      } else if (!matchesPreset(dateStr, timePreset)) return false;

      if (statusFilter !== 'all') {
        const paid = isPaid(o);
        if (statusFilter === 'paid' && !paid) return false;
        if (statusFilter === 'pending' && paid) return false;
      }

      if (locationFilter !== 'all' && getLocation(o) !== locationFilter) return false;
      if (pfiFilter !== 'all' && getPfiNumber(o) !== pfiFilter) return false;

      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const ref = getOrderReference(o).toLowerCase();
        const name = getCustomerName(o).toLowerCase();
        const loc = getLocation(o).toLowerCase();
        const pfi = String(o.pfi_number ?? '').toLowerCase();
        const trucks = getTrucks(o).map(t => String(t.truck_number ?? '').toLowerCase()).join(' ');
        if (
          !ref.includes(q) && !name.includes(q) && !loc.includes(q) &&
          !pfi.includes(q) && !trucks.includes(q) && !String(o.id).includes(q)
        ) return false;
      }

      return true;
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [eligibleOrders, timePreset, customFrom, customTo, statusFilter, locationFilter, pfiFilter, searchQuery]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const totalOrders = filteredOrders.length;
    const totalTrucks = filteredOrders.reduce((s, o) => s + getTrucks(o).length, 0);
    const totalQty = filteredOrders.reduce((s, o) => s + getTotalQty(o), 0);
    const paidOrders = filteredOrders.filter(isPaid);
    const pendingOrders = filteredOrders.filter(o => !isPaid(o));
    const totalPaid = paidOrders.reduce((s, o) => s + getCommissionAmount(ratesByLocation, o), 0);
    const totalPending = pendingOrders.reduce((s, o) => s + getCommissionAmount(ratesByLocation, o), 0);

    return [
      { title: 'Eligible Orders', value: String(totalOrders), icon: <FileText size={20} />, tone: 'neutral', description: `${totalTrucks} truck${totalTrucks !== 1 ? 's' : ''}` },
      { title: 'Total Qty Loaded (L)', value: totalQty > 0 ? fmtQty(totalQty) : '0', icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'Commission Pending', value: fmt(totalPending), icon: <Clock size={20} />, tone: pendingOrders.length > 0 ? 'amber' : 'neutral', description: `${pendingOrders.length} order${pendingOrders.length !== 1 ? 's' : ''}` },
      { title: 'Commission Paid', value: fmt(totalPaid), icon: <Banknote size={20} />, tone: 'green', description: `${paidOrders.length} order${paidOrders.length !== 1 ? 's' : ''}` },
    ];
  }, [filteredOrders, ratesByLocation]);

  const handlePayoutConfirmed = () => {
    queryClient.invalidateQueries({ queryKey: ['commissions-orders'] });
  };

  // ── Export ──────────────────────────────────────────────────────────────
  const buildReportData = () => {
    const generatedAt = format(new Date(), 'dd MMM yyyy, HH:mm');
    const periodLabel = timePreset === 'custom' && calRange.from
      ? calRange.to
        ? `${format(calRange.from, 'dd MMM yyyy')} - ${format(calRange.to, 'dd MMM yyyy')}`
        : format(calRange.from, 'dd MMM yyyy')
      : PRESETS.find(p => p.key === timePreset)?.label || 'All Time';

    const sortedOrders = [...filteredOrders].sort((a, b) => a.created_at.localeCompare(b.created_at));

    const totalQty = filteredOrders.reduce((s, o) => s + getTotalQty(o), 0);
    const totalCommission = filteredOrders.reduce((s, o) => s + getCommissionAmount(ratesByLocation, o), 0);
    const totalPaid = filteredOrders.filter(isPaid).reduce((s, o) => s + getCommissionAmount(ratesByLocation, o), 0);
    const totalPending = filteredOrders.filter(o => !isPaid(o)).reduce((s, o) => s + getCommissionAmount(ratesByLocation, o), 0);

    const headingBlock: Array<[string, string]> = [
      ['Report Generated', generatedAt],
      ['Period', periodLabel],
      ['Location', locationFilter === 'all' ? 'ALL LOCATIONS' : locationFilter],
      ['PFI', pfiFilter === 'all' ? 'ALL PFIS' : pfiFilter],
      ['Total Orders', String(filteredOrders.length)],
      ['Total Qty Loaded (L)', totalQty.toLocaleString()],
      ['Total Commission', `N${totalCommission.toLocaleString()}`],
      ['Paid', `N${totalPaid.toLocaleString()}`],
      ['Pending', `N${totalPending.toLocaleString()}`],
    ];

    const headers = [
      'Reference', 'Date', 'Facilitator', 'Phone', 'Location', 'PFI',
      'Trucks', 'Qty (L)', 'Commission', 'Status', 'Paid By',
      'Bank Name', 'Account Name', 'Account Number',
    ];

    const rows = sortedOrders.map(o => {
      const trucks = getTrucks(o)
        .map(t => `${t.truck_number || '—'} (${fmtQty(toNum(t.quantity_litres))}L)`)
        .join(', ');
      return [
        String(getOrderReference(o) || o.id),
        fmtDateTime(o.created_at),
        getCustomerName(o),
        getPhone(o),
        getLocation(o),
        getPfiNumber(o),
        trucks || '—',
        fmtQty(getTotalQty(o)),
        `N${getCommissionAmount(ratesByLocation, o).toLocaleString()}`,
        isPaid(o) ? 'PAID' : 'PENDING',
        o.commission_paid_by_name || '—',
        o.commission_bank_name || '—',
        o.commission_account_name || '—',
        o.commission_account_number || '—',
      ].map(v => String(v).toUpperCase());
    });

    const totalsRow = [
      'TOTAL', '', '', '', '', '', '',
      totalQty.toLocaleString(), `N${totalCommission.toLocaleString()}`, '', '', '', '', '',
    ];

    const safeLabel = String(periodLabel).replace(/[/\\*?:[\]]/g, '-');
    const fileName = `COMMISSION REPORT ${safeLabel} - ${format(new Date(), 'ddMMyy')}`;

    return { headingBlock, headers, rows, totalsRow, fileName, safeLabel };
  };

  const COLUMN_ALIGN: Array<'left' | 'center' | 'right'> = [
    'left', 'left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'left', 'left',
    'left', 'left', 'left',
  ];

  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) return;
    try {
      const { headingBlock, headers, rows, totalsRow, fileName, safeLabel } = buildReportData();
      const colCount = headers.length;

      const NAVY = 'FF1E293B';
      const WHITE = 'FFFFFFFF';
      const LIGHT = 'FFF5F8FC';
      const BAND = 'FFEFF3F8';
      const TOTAL_FILL = 'FFE2E8F0';
      const BORDER_COLOR = 'FFB0C4DE';
      const thinBorder = { style: 'thin' as const, color: { argb: BORDER_COLOR } };
      const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Soroman Dashboard';
      workbook.created = new Date();
      const sheetName = `${safeLabel} COMMISSIONS`.slice(0, 31);
      const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });

      const lastColLetter = ws.getColumn(colCount).letter;
      ws.mergeCells(`A1:${lastColLetter}1`);
      const titleCell = ws.getCell('A1');
      titleCell.value = 'COMMISSION REPORT';
      titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: WHITE } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      const pairs: Array<[string, string, string, string]> = [];
      for (let i = 0; i < headingBlock.length; i += 2) {
        pairs.push([headingBlock[i][0], headingBlock[i][1], headingBlock[i + 1]?.[0] ?? '', headingBlock[i + 1]?.[1] ?? '']);
      }
      let r = 3;
      pairs.forEach(([l1, v1, l2, v2]) => {
        const row = ws.getRow(r);
        row.height = 18;
        ([[1, l1, true], [2, v1, false], [3, l2, true], [4, v2, false]] as const).forEach(([col, val, isLabel]) => {
          const cell = row.getCell(col);
          cell.value = val;
          cell.font = { name: 'Calibri', bold: isLabel, size: 10, color: { argb: 'FF1E3A5F' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLabel ? LIGHT : WHITE } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        });
        r += 1;
      });
      ws.getColumn(1).width = 22; ws.getColumn(2).width = 22;
      ws.getColumn(3).width = 22; ws.getColumn(4).width = 22;

      r += 1;
      const headerRowIdx = r;
      const headerRow = ws.getRow(headerRowIdx);
      headerRow.height = 22;
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h.toUpperCase();
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      r += 1;

      rows.forEach((row, idx) => {
        const xlRow = ws.getRow(r);
        xlRow.height = 16;
        row.forEach((val, ci) => {
          const cell = xlRow.getCell(ci + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 9.5 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? WHITE : BAND } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
        });
        r += 1;
      });

      const totalsRowXl = ws.getRow(r);
      totalsRowXl.height = 18;
      totalsRow.forEach((val, ci) => {
        const cell = totalsRowXl.getCell(ci + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: COLUMN_ALIGN[ci] || 'left' };
      });

      const widths = [18, 18, 22, 16, 16, 14, 30, 12, 14, 12, 18, 20, 24, 18];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: false }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export] Excel export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportPDF = () => {
    if (filteredOrders.length === 0) return;
    try {
      const { headingBlock, headers, rows, totalsRow, fileName } = buildReportData();
      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 297, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text('COMMISSION REPORT', 14, 10.5);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');

      const pairs: Array<[string, string, string, string]> = [];
      for (let i = 0; i < headingBlock.length; i += 2) {
        pairs.push([headingBlock[i][0], headingBlock[i][1], headingBlock[i + 1]?.[0] ?? '', headingBlock[i + 1]?.[1] ?? '']);
      }
      autoTable(doc, {
        startY: 22,
        body: pairs,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle', lineColor: [176, 196, 222], lineWidth: 0.2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
          1: { cellWidth: 60 },
          2: { fontStyle: 'bold', cellWidth: 45, fillColor: [238, 244, 251], textColor: [30, 58, 95] },
          3: { cellWidth: 60 },
        },
      });

      const colWidthsMm = [20, 20, 26, 18, 18, 16, 40, 14, 16, 14, 22, 22, 28, 22];
      const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
      colWidthsMm.forEach((w, i) => { columnStyles[i] = { cellWidth: w, halign: COLUMN_ALIGN[i] || 'left' }; });

      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
        head: [headers.map(h => h.toUpperCase())],
        body: rows,
        foot: [totalsRow],
        showFoot: 'lastPage',
        margin: { left: 7, right: 7 },
        tableWidth: 'wrap',
        theme: 'grid',
        styles: {
          fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'middle',
          lineColor: [176, 196, 222], lineWidth: 0.15,
        },
        columnStyles,
        alternateRowStyles: { fillColor: [245, 248, 252] },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6.5, halign: 'center', valign: 'middle', fontStyle: 'bold' },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, valign: 'middle' },
      });

      doc.save(`${fileName}.pdf`);
    } catch (err) {
      console.error('[Export] PDF export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const hasFilters = searchQuery || statusFilter !== 'all' || locationFilter !== 'all' ||
    pfiFilter !== 'all' || timePreset !== 'month' || customFrom || customTo;

  const clearFilters = () => {
    setTimePreset('month');
    setCustomFrom(''); setCustomTo('');
    setCalRange({});
    setSearchQuery('');
    setStatusFilter('all');
    setLocationFilter('all');
    setPfiFilter('all');
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Commissions"
              description="Per-litre commission paid to facilitators — rate depends on location and order quantity."
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setRatesDialogOpen(true)}>
                    <Banknote size={15} /> Commission Rates
                  </Button>
                  <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setDailyReportOpen(true)}>
                    <ClipboardList size={15} /> Enter Report
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel} disabled={filteredOrders.length === 0}>
                    <FileText size={15} /> Export Excel
                  </Button>
                  {/* <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPDF} disabled={filteredOrders.length === 0}>
                    <FileText size={15} /> Export PDF
                  </Button> */}
                  {/* <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Refresh
                  </Button> */}
                </div>
              }
            />

            {/* ── Filter Panel ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by facilitator, reference, truck number or PFI…"
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" title="Clear search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100" />

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.filter(p => p.key !== 'custom').map(({ key, label }) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => { setTimePreset(key); setCustomFrom(''); setCustomTo(''); setCalRange({}); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${timePreset === key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="Pick a custom date range"
                        onClick={() => setTimePreset('custom')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${timePreset === 'custom'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}`}
                      >
                        <CalendarDays size={11} />
                        {timePreset === 'custom' && calRange.from
                          ? calRange.to
                            ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                            : format(calRange.from, 'dd MMM yyyy')
                          : 'Custom Range'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: calRange.from, to: calRange.to }}
                        onSelect={r => {
                          setCalRange(r ?? {});
                          setTimePreset('custom');
                          if (r?.from) setCustomFrom(format(r.from, 'yyyy-MM-dd'));
                          if (r?.to) setCustomTo(format(r.to, 'yyyy-MM-dd'));
                          if (r?.from && r?.to) setCalOpen(false);
                        }}
                        initialFocus
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Commission Status
                  </p>
                  <select
                    aria-label="Filter by commission status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as CommissionStatusFilter)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={12} /> PFI
                  </p>
                  <select
                    aria-label="Filter by PFI"
                    value={pfiFilter}
                    onChange={e => setPfiFilter(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="all">All PFIs</option>
                    {uniquePfis.map(pfi => <option key={pfi} value={pfi}>{pfi}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {timePreset !== 'month' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} />
                      {timePreset === 'custom' && calRange.from
                        ? calRange.to ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}` : format(calRange.from, 'dd MMM yyyy')
                        : PRESETS.find(p => p.key === timePreset)?.label}
                      <button type="button" onClick={() => { setTimePreset('month'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} title="Remove date filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {statusFilter === 'paid' ? 'Paid' : 'Pending'}
                      <button type="button" onClick={() => setStatusFilter('all')} title="Remove status filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {locationFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button type="button" onClick={() => setLocationFilter('all')} title="Remove location filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <FileText size={10} />{pfiFilter}
                      <button type="button" onClick={() => setPfiFilter('all')} title="Remove PFI filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Search size={10} />"{searchQuery}"
                      <button type="button" onClick={() => setSearchQuery('')} title="Clear search" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 h-8 text-xs" onClick={clearFilters}>
                      <X size={13} /> Clear all filters
                    </Button>
                  )}
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} shown
                  </span>
                </div>
              </div>
            </div>

            <SummaryCards cards={summaryCards} />

            {/* ── Table ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : isError ? (
                <div className="p-10 text-center">
                  <XCircle className="mx-auto text-red-300 mb-3" size={40} />
                  <p className="text-slate-600 font-medium">Failed to load orders</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try Again</Button>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No eligible orders found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {eligibleOrders.length > 0 ? 'Try adjusting your filters.' : 'No ticket-generated orders yet.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="w-[48px] font-semibold text-slate-700">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Reference</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700">Facilitator</TableHead>
                        <TableHead className="font-semibold text-slate-700">Phone</TableHead>
                        <TableHead className="font-semibold text-slate-700">Location</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        <TableHead className="font-semibold text-slate-700 min-w-[180px]">Trucks</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Qty (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right">Commission</TableHead>
                        <TableHead className="font-semibold text-slate-700">Commission A/C</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[120px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((o, idx) => {
                        const ref = getOrderReference(o);
                        const trucks = getTrucks(o);
                        const qty = getTotalQty(o);
                        const commission = getCommissionAmount(ratesByLocation, o);
                        const paid = isPaid(o);
                        const company = getCompanyName(o);
                        const name = getCustomerName(o);

                        return (
                          <TableRow key={o.id} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="text-center text-slate-400">{idx + 1}</TableCell>

                            <TableCell className="text-sm text-amber-700 font-mono font-semibold whitespace-nowrap">{ref}</TableCell>

                            <TableCell className="text-slate-600 whitespace-nowrap text-sm">
                              {fmtDateTime(o.created_at)}
                            </TableCell>

                            <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                              {company !== '—' ? (
                                <div>
                                  <p className="font-semibold uppercase text-black">{company}</p>
                                  <p className="text-xs uppercase text-slate-700 font-normal">{name}</p>
                                </div>
                              ) : name}
                            </TableCell>

                            <TableCell className="text-black whitespace-nowrap text-sm">{getPhone(o)}</TableCell>

                            <TableCell className="text-slate-700 whitespace-nowrap">
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                {getLocation(o)}
                              </span>
                            </TableCell>

                            <TableCell className="text-slate-600 text-xs whitespace-nowrap">
                              {o.pfi_number ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                                  <FileText size={11} />{o.pfi_number}
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell>

                            <TableCell className="text-xs text-slate-700">
                              {trucks.length > 0 ? (
                                <div className="space-y-0.5">
                                  {trucks.map(t => (
                                    <div key={t.id} className="flex items-center gap-1.5">
                                      <Truck size={10} className="text-slate-400 shrink-0" />
                                      <span className="font-medium">{t.truck_number || '—'}</span>
                                      <span className="text-slate-400">— {fmtQty(toNum(t.quantity_litres))}L</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <span className="text-slate-400">—</span>}
                            </TableCell>

                            <TableCell className="text-right font-semibold text-black">{fmtQty(qty)}</TableCell>

                            <TableCell className="text-right font-bold text-emerald-700">{fmt(commission)}</TableCell>

                            <TableCell>
                              {o.commission_account_number ? (
                                <div className="flex flex-col text-xs leading-tight">
                                  <span className="font-mono font-semibold text-slate-900">{o.commission_account_number}</span>
                                  {o.commission_account_name && <span className="text-slate-600">{o.commission_account_name}</span>}
                                  {o.commission_bank_name && <span className="text-slate-400">{o.commission_bank_name}</span>}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {paid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                  <CheckCircle2 size={12} /> Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock size={12} /> Pending
                                </span>
                              )}
                              {paid && o.commission_paid_by_name && (
                                <p className="text-[10px] text-slate-400 mt-0.5">by {o.commission_paid_by_name}</p>
                              )}
                            </TableCell>

                            <TableCell>
                              <Button
                                size="sm"
                                variant={paid ? 'ghost' : 'outline'}
                                className={paid ? 'h-8 text-slate-400 cursor-default' : 'h-8 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50'}
                                disabled={paid}
                                onClick={() => setPayoutOrder(o)}
                              >
                                {paid ? 'Paid' : <><Banknote size={13} /> Confirm Pay</>}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && filteredOrders.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredOrders.length} of {eligibleOrders.length} eligible orders
              </p>
            )}

          </div>
        </div>
      </div>

      <ConfirmPayoutDialog
        order={payoutOrder}
        open={!!payoutOrder}
        onClose={() => setPayoutOrder(null)}
        onConfirmed={handlePayoutConfirmed}
        rates={ratesByLocation}
      />

      <CommissionRatesDialog
        open={ratesDialogOpen}
        onClose={() => setRatesDialogOpen(false)}
      />

      <DailyReportDialog
        open={dailyReportOpen}
        onClose={() => setDailyReportOpen(false)}
        locations={uniqueLocations}
        pfis={uniquePfis}
      />
    </div>
  );
}
