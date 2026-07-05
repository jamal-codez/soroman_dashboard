/**
 * MyReportPage — role-scoped report submission and history.
 * Roles served:
 *   5  Security      → Gate report
 *   9  Sales Manager → Daily sales report (DailyReportPanel)
 *  10  Product Mgr   → Daily sales report (DailyReportPanel)
 *  15/16 Commissions → Commission daily report
 *  18  IT Compliance → Compliance observation report
 */
import React, { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { DailyReportPanel } from '@/components/DailyReportPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CommaInput } from '@/components/ui/comma-input';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/client';
import {
  ClipboardList, Plus, Loader2, CheckCircle2, Download, FileText,
  Trash2, ChevronLeft, ChevronRight, FileBarChart2, ShieldCheck, Banknote,
} from 'lucide-react';

// ─── Shared helpers ─────────────────────────────────────────────────────────

const TAG_RE = /\s*\[([A-Z_]+)\]$/;

const readScopedLocations = (): string[] => {
  try { return JSON.parse(localStorage.getItem('location_names') || '[]') as string[]; }
  catch { return []; }
};

const readScopedPfis = (): string[] => {
  try { return JSON.parse(localStorage.getItem('pfi_numbers') || '[]') as string[]; }
  catch { return []; }
};

const today = () => format(new Date(), 'yyyy-MM-dd');

const display = (v: unknown, money = false): string => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return '—';
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return money ? `₦${s}` : s;
};

type ReportEntry = Record<string, unknown> & { id: number };

// ─── PDF helpers ─────────────────────────────────────────────────────────────

function buildPdfBase(title: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16, CW = W - M * 2;
  const now = format(new Date(), 'dd MMM yyyy, HH:mm');
  type RGB = [number, number, number];
  const NAVY: RGB = [15, 23, 42];
  const ACCENT: RGB = [37, 99, 235];
  const WHITE: RGB = [255, 255, 255];

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 46, 'F');
  doc.setFillColor(...ACCENT); doc.rect(0, 42, W, 4, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text('SOROMAN ENERGY LIMITED', M, 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...WHITE);
  doc.text(title, M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${now}`, M, 39);

  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F');
  doc.setFillColor(...ACCENT); doc.rect(0, H - 12, W, 1.5, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text('Soroman Energy Limited — Confidential', M, H - 4.5);
  doc.text(`Page 1 of 1  •  ${now}`, W - M, H - 4.5, { align: 'right' });

  return { doc, W, M, CW };
}

function buildRows(doc: jsPDF, M: number, CW: number, startY: number,
  rows: Array<{ label: string; value: string; highlight?: boolean }>) {
  const ROW_H = 8, LABEL_W = 80, VALUE_W = CW - LABEL_W;
  type RGB = [number, number, number];
  const LBLBG: RGB = [243, 245, 248], BORDER: RGB = [210, 215, 225];
  const BLUE: RGB = [37, 99, 235], DARK: RGB = [15, 23, 42], HILITE: RGB = [235, 242, 255];

  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.rect(M, startY, CW, rows.length * ROW_H, 'S');

  let Y = startY;
  rows.forEach((row, i) => {
    doc.setFillColor(...LBLBG); doc.rect(M, Y, LABEL_W, ROW_H, 'F');
    doc.setFillColor(...(row.highlight ? HILITE : ([255, 255, 255] as RGB))); doc.rect(M + LABEL_W, Y, VALUE_W, ROW_H, 'F');
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
    doc.line(M + LABEL_W, Y, M + LABEL_W, Y + ROW_H);
    if (i < rows.length - 1) doc.line(M, Y + ROW_H, M + CW, Y + ROW_H);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(70, 80, 100);
    doc.text(row.label, M + 4, Y + 5.5);
    doc.setFont('helvetica', row.highlight ? 'bold' : 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(...(row.highlight ? BLUE : DARK));
    doc.text(row.value, M + LABEL_W + 5, Y + 5.5);
    Y += ROW_H;
  });
  return Y;
}

// ═══════════════════════════════════════════════════════════════════════════
// GATE REPORT PANEL (Security — role 5)
// ═══════════════════════════════════════════════════════════════════════════

interface GateForm {
  location: string; pfi: string; date: string;
  carriedOverYesterday: string; trucksExitedToday: string;
  trucksLeftOverToday: string; remarks: string;
}

const EMPTY_GATE: GateForm = {
  location: '', pfi: '', date: today(),
  carriedOverYesterday: '', trucksExitedToday: '', trucksLeftOverToday: '', remarks: '',
};

function generateGatePDF(form: GateForm) {
  const { doc, M, CW } = buildPdfBase('DAILY GATE REPORT');
  const rows = [
    { label: 'LOCATION', value: (form.location || '—').toUpperCase() },
    { label: 'PFI', value: (form.pfi || '—').toUpperCase() },
    { label: 'DATE', value: form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy').toUpperCase() : '—' },
    { label: 'CARRIED OVER (YESTERDAY)', value: (form.carriedOverYesterday || '—').toUpperCase(), highlight: true },
    { label: 'TRUCKS EXITED TODAY', value: (form.trucksExitedToday || '—').toUpperCase(), highlight: true },
    { label: 'LOADING LEFT OVER TODAY', value: (form.trucksLeftOverToday || '—').toUpperCase(), highlight: true },
    { label: 'STAFF NAME', value: (localStorage.getItem('fullname') || '—').toUpperCase() },
  ];
  let Y = buildRows(doc, M, CW, 54, rows);
  if (form.remarks.trim()) {
    Y += 10;
    const H_REM = 32;
    doc.setFillColor(249, 250, 251); doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.3);
    doc.rect(M, Y, CW, H_REM, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  }
  const safe = (form.date || today()).replace(/-/g, '');
  const loc = (form.location || 'GATE').replace(/[/\\*?:[\]]/g, '-');
  doc.save(`GateReport_${loc}_${safe}.pdf`);
}

function GateReportPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staffName = localStorage.getItem('fullname') || 'Unknown';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<GateForm>(EMPTY_GATE);
  const [histPage, setHistPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewEntry, setViewEntry] = useState<ReportEntry | null>(null);

  const set = (f: keyof GateForm) => (v: string) => setForm(p => ({ ...p, [f]: v }));

  const scopedLocations = useMemo(() => readScopedLocations(), []);
  const scopedPfis = useMemo(() => readScopedPfis(), []);

  // Also fetch all available locations/pfis as fallback for admin-level access
  const filterOptsQuery = useQuery({
    queryKey: ['my-report-filter-opts'],
    queryFn: () => apiClient.admin.getSecurityFilterOptions(),
    staleTime: 60_000,
  });
  const allLocations = filterOptsQuery.data?.locations.map(l => l.name) ?? [];
  const allPfis = filterOptsQuery.data?.pfis.map(p => p.pfi_number) ?? [];
  const locations = scopedLocations.length ? scopedLocations : allLocations;
  const pfis = scopedPfis.length ? scopedPfis : allPfis;

  const histQuery = useQuery({
    queryKey: ['my-report-history', 'SECURITY', histPage],
    queryFn: () => apiClient.admin.getStaffReportHistory(histPage, 50, false),
    staleTime: 15_000,
  });

  const history = ((histQuery.data?.results ?? []) as ReportEntry[]).filter(r => {
    const tag = TAG_RE.exec(String(r.submitted_by_name ?? ''))?.[1];
    return tag === 'SECURITY';
  });
  const totalPages = Math.ceil(history.length / 10) || 1;

  const mutation = useMutation({
    mutationFn: () => apiClient.admin.submitStaffDailyReport({
      date: form.date,
      location: form.location,
      pfi_number: form.pfi,
      submitted_by_name: `${staffName} [SECURITY]`,
      yesterday_carried_over_loading: form.carriedOverYesterday || '0',
      num_trucks_sold: form.trucksExitedToday || '0',
      loading_left_over: form.trucksLeftOverToday || '0',
      remarks: form.remarks,
    }),
    onSuccess: () => {
      generateGatePDF(form);
      toast({ title: 'Gate report saved', description: `${form.location} · ${form.date}` });
      setShowForm(false);
      setForm(EMPTY_GATE);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'SECURITY'] });
    },
    onError: (err: Error) => toast({ title: 'Failed', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteStaffDailyReport(id),
    onSuccess: () => {
      toast({ title: 'Report deleted' });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'SECURITY'] });
    },
    onError: (err: Error) => { toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }); setConfirmDeleteId(null); },
  });

  const redownload = (r: ReportEntry) => generateGatePDF({
    location: String(r.location ?? ''), pfi: String(r.pfi_number ?? ''),
    date: String(r.date ?? ''), carriedOverYesterday: String(r.yesterday_carried_over_loading ?? ''),
    trucksExitedToday: String(r.num_trucks_sold ?? ''), trucksLeftOverToday: String(r.loading_left_over ?? ''),
    remarks: String(r.remarks ?? ''),
  });

  return (
    <>
      {/* View entry dialog */}
      {viewEntry && (
        <Dialog open onOpenChange={open => { if (!open) setViewEntry(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Gate Report — {String(viewEntry.date ?? '')} · {String(viewEntry.location ?? '')}</DialogTitle>
              <DialogDescription className="sr-only">View gate report details</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 mt-2 text-sm">
              {[
                ['Date', String(viewEntry.date ?? '—')],
                ['Location', String(viewEntry.location ?? '—')],
                ['PFI', String(viewEntry.pfi_number ?? '—')],
                ['Carried Over (Yesterday)', display(viewEntry.yesterday_carried_over_loading)],
                ['Trucks Exited Today', display(viewEntry.num_trucks_sold)],
                ['Loading Left Over', display(viewEntry.loading_left_over)],
                ['Remarks', String(viewEntry.remarks ?? '—')],
              ].map(([l, v]) => (
                <div key={l} className="flex gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <span className="w-44 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">{l}</span>
                  <span className="text-slate-800 font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setViewEntry(null)}>Close</Button>
              <Button size="sm" className="gap-1.5 bg-slate-800 text-white" onClick={() => { redownload(viewEntry); setViewEntry(null); }}>
                <Download size={13} /> Download PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setForm(EMPTY_GATE); } }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600" /> Daily Gate Report
            </DialogTitle>
            <DialogDescription>Enter today's gate figures.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location <span className="text-red-500">*</span></Label>
                <select aria-label="Location" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.location} onChange={e => set('location')(e.target.value)}>
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>PFI</Label>
                <select aria-label="PFI" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.pfi} onChange={e => set('pfi')(e.target.value)}>
                  <option value="">Select PFI</option>
                  {pfis.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.date} onChange={e => set('date')(e.target.value)} />
            </div>
            <div className="h-px bg-slate-100" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gate Figures</p>
            <div className="space-y-3">
              {([
                ['carriedOverYesterday', 'No. of Yesterday Carried Over Loading'],
                ['trucksExitedToday', 'No. of Trucks Sold / Exited Today'],
                ['trucksLeftOverToday', 'No. of Trucks Loading Left Over Today'],
              ] as const).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label>{label}</Label>
                  <CommaInput placeholder="0" value={form[field]} onValueChange={v => set(field)(v)} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <textarea rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any additional notes…" value={form.remarks} onChange={e => set('remarks')(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_GATE); }}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.location || !form.date}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              {mutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> Submit &amp; Download</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileBarChart2 size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">My Gate Reports</h2>
            {history.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{history.length}</span>}
          </div>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => { setForm(EMPTY_GATE); setShowForm(true); }}>
            <Plus size={13} /> Enter Report
          </Button>
        </div>
        <ReportHistoryTable
          rows={history.slice((histPage - 1) * 10, histPage * 10)}
          loading={histQuery.isLoading}
          columns={[
            { header: 'Date', render: r => String(r.date ?? '—') },
            { header: 'Location', render: r => String(r.location ?? '—') },
            { header: 'PFI', render: r => String(r.pfi_number ?? '—') },
            { header: 'Trucks Exited', right: true, render: r => display(r.num_trucks_sold) },
            { header: 'Left Over', right: true, render: r => display(r.loading_left_over) },
          ]}
          confirmDeleteId={confirmDeleteId}
          onSetDeleteId={setConfirmDeleteId}
          onConfirmDelete={id => deleteMutation.mutate(id)}
          onView={r => setViewEntry(r)}
          onDownload={redownload}
        />
        <HistoryPager page={histPage} total={totalPages} onPrev={() => setHistPage(p => p - 1)} onNext={() => setHistPage(p => p + 1)} count={history.length} />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION REPORT PANEL (Commissions — roles 15/16)
// ═══════════════════════════════════════════════════════════════════════════

interface CommForm {
  location: string; pfi: string; date: string;
  litresSoldToday: string; numberOfTrucks: string;
  numberOfCustomers: string; numberOfOrders: string;
  totalCommissionPaid: string; remarks: string;
}

const EMPTY_COMM: CommForm = {
  location: '', pfi: '', date: today(),
  litresSoldToday: '', numberOfTrucks: '', numberOfCustomers: '',
  numberOfOrders: '', totalCommissionPaid: '', remarks: '',
};

function generateCommissionPDF(form: CommForm, staffName: string) {
  const { doc, M, CW } = buildPdfBase('DAILY COMMISSION REPORT');
  const fmtNum = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toLocaleString() : '—'; };
  const rows = [
    { label: 'LOCATION', value: (form.location || '—').toUpperCase() },
    { label: 'PFI', value: (form.pfi || '—').toUpperCase() },
    { label: 'DATE', value: form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy').toUpperCase() : '—' },
    { label: 'LITRES SOLD TODAY', value: fmtNum(form.litresSoldToday) + ' LITRES', highlight: true },
    { label: 'NO. OF TRUCKS SOLD', value: fmtNum(form.numberOfTrucks) },
    { label: 'NO. OF CUSTOMERS', value: fmtNum(form.numberOfCustomers) },
    { label: 'NO. OF ORDERS', value: fmtNum(form.numberOfOrders) },
    { label: 'TOTAL COMMISSION PAID', value: `NGN ${Number(form.totalCommissionPaid || '0').toLocaleString('en-NG', { minimumFractionDigits: 2 })}`, highlight: true },
    { label: 'STAFF NAME', value: staffName.toUpperCase() },
  ];
  let Y = buildRows(doc, M, CW, 54, rows);
  if (form.remarks.trim()) {
    Y += 10;
    const H_REM = 32;
    doc.setFillColor(249, 250, 251); doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.3);
    doc.rect(M, Y, CW, H_REM, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  }
  const safe = (form.date || today()).replace(/-/g, '');
  const loc = (form.location || 'COMM').replace(/[/\\*?:[\]]/g, '-');
  doc.save(`CommissionReport_${loc}_${safe}.pdf`);
}

function CommissionReportPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staffName = localStorage.getItem('fullname') || 'Unknown';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CommForm>(EMPTY_COMM);
  const [histPage, setHistPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewEntry, setViewEntry] = useState<ReportEntry | null>(null);

  const set = (f: keyof CommForm) => (v: string) => setForm(p => ({ ...p, [f]: v }));

  const scopedLocations = useMemo(() => readScopedLocations(), []);
  const scopedPfis = useMemo(() => readScopedPfis(), []);
  const filterOptsQuery = useQuery({
    queryKey: ['my-report-filter-opts'],
    queryFn: () => apiClient.admin.getSecurityFilterOptions(),
    staleTime: 60_000,
  });
  const locations = scopedLocations.length ? scopedLocations : (filterOptsQuery.data?.locations.map(l => l.name) ?? []);
  const pfis = scopedPfis.length ? scopedPfis : (filterOptsQuery.data?.pfis.map(p => p.pfi_number) ?? []);

  const histQuery = useQuery({
    queryKey: ['my-report-history', 'COMMISSIONS', histPage],
    queryFn: () => apiClient.admin.getStaffReportHistory(histPage, 50, false),
    staleTime: 15_000,
  });

  const history = ((histQuery.data?.results ?? []) as ReportEntry[]).filter(r => {
    const tag = TAG_RE.exec(String(r.submitted_by_name ?? ''))?.[1];
    return tag === 'COMMISSIONS';
  });
  const totalPages = Math.ceil(history.length / 10) || 1;

  const buildRemarks = (f: CommForm) => {
    const meta = `Customers: ${f.numberOfCustomers || '0'} | Orders: ${f.numberOfOrders || '0'}`;
    return f.remarks.trim() ? `${meta}\n\n${f.remarks.trim()}` : meta;
  };

  const mutation = useMutation({
    mutationFn: () => apiClient.admin.submitStaffDailyReport({
      date: form.date,
      location: form.location,
      pfi_number: form.pfi,
      submitted_by_name: `${staffName} [COMMISSIONS]`,
      litres_sold_today: form.litresSoldToday || '0',
      num_trucks_sold: form.numberOfTrucks || '0',
      amount_paid: form.totalCommissionPaid || '0',
      remarks: buildRemarks(form),
    }),
    onSuccess: () => {
      generateCommissionPDF(form, staffName);
      toast({ title: 'Commission report saved', description: `${form.location} · ${form.date}` });
      setShowForm(false);
      setForm(EMPTY_COMM);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'COMMISSIONS'] });
    },
    onError: (err: Error) => toast({ title: 'Failed', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteStaffDailyReport(id),
    onSuccess: () => {
      toast({ title: 'Report deleted' });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'COMMISSIONS'] });
    },
    onError: (err: Error) => { toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }); setConfirmDeleteId(null); },
  });

  const redownload = (r: ReportEntry) => {
    const remarksStr = String(r.remarks ?? '');
    const custMatch = remarksStr.match(/Customers:\s*(\d+)/);
    const ordMatch = remarksStr.match(/Orders:\s*(\d+)/);
    const cleanRemarks = remarksStr.replace(/Customers:\s*\d+\s*\|\s*Orders:\s*\d+\s*\n?\n?/, '');
    generateCommissionPDF({
      location: String(r.location ?? ''), pfi: String(r.pfi_number ?? ''),
      date: String(r.date ?? ''),
      litresSoldToday: String(Number(r.litres_sold_today ?? 0).toLocaleString()),
      numberOfTrucks: String(r.num_trucks_sold ?? ''),
      numberOfCustomers: custMatch?.[1] ?? '—',
      numberOfOrders: ordMatch?.[1] ?? '—',
      totalCommissionPaid: String(Number(r.amount_paid ?? 0).toLocaleString()),
      remarks: cleanRemarks.trim(),
    }, staffName);
  };

  return (
    <>
      {viewEntry && (
        <Dialog open onOpenChange={open => { if (!open) setViewEntry(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Commission Report — {String(viewEntry.date ?? '')} · {String(viewEntry.location ?? '')}</DialogTitle>
              <DialogDescription className="sr-only">View commission report</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 mt-2 text-sm">
              {[
                ['Date', String(viewEntry.date ?? '—')],
                ['Location', String(viewEntry.location ?? '—')],
                ['PFI', String(viewEntry.pfi_number ?? '—')],
                ['Litres Sold', display(viewEntry.litres_sold_today)],
                ['Trucks', display(viewEntry.num_trucks_sold)],
                ['Commission Paid', display(viewEntry.amount_paid, true)],
                ['Notes', String(viewEntry.remarks ?? '—')],
              ].map(([l, v]) => (
                <div key={l} className="flex gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <span className="w-40 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">{l}</span>
                  <span className="text-slate-800 font-medium break-words">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setViewEntry(null)}>Close</Button>
              <Button size="sm" className="gap-1.5 bg-slate-800 text-white" onClick={() => { redownload(viewEntry); setViewEntry(null); }}>
                <Download size={13} /> Download PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setForm(EMPTY_COMM); } }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote size={18} className="text-emerald-600" /> Daily Commission Report
            </DialogTitle>
            <DialogDescription>Enter today's commission figures.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location <span className="text-red-500">*</span></Label>
                <select aria-label="Location" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.location} onChange={e => set('location')(e.target.value)}>
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>PFI</Label>
                <select aria-label="PFI" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.pfi} onChange={e => set('pfi')(e.target.value)}>
                  <option value="">Select PFI</option>
                  {pfis.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.date} onChange={e => set('date')(e.target.value)} />
            </div>
            <div className="h-px bg-slate-100" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Commission Figures</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['litresSoldToday', 'Litres Sold Today'],
                ['numberOfTrucks', 'No. of Trucks Sold'],
                ['numberOfCustomers', 'No. of Customers'],
                ['numberOfOrders', 'No. of Orders'],
              ] as const).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label>{label}</Label>
                  <CommaInput placeholder="0" value={form[field]} onValueChange={v => set(field)(v)} />
                </div>
              ))}
              <div className="col-span-2 space-y-1.5">
                <Label>Total Commission Paid (₦)</Label>
                <CommaInput placeholder="0" value={form.totalCommissionPaid} onValueChange={v => set('totalCommissionPaid')(v)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <textarea rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any additional notes…" value={form.remarks} onChange={e => set('remarks')(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_COMM); }}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.location || !form.date}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              {mutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> Submit &amp; Download</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileBarChart2 size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">My Commission Reports</h2>
            {history.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{history.length}</span>}
          </div>
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => { setForm(EMPTY_COMM); setShowForm(true); }}>
            <Plus size={13} /> Enter Report
          </Button>
        </div>
        <ReportHistoryTable
          rows={history.slice((histPage - 1) * 10, histPage * 10)}
          loading={histQuery.isLoading}
          columns={[
            { header: 'Date', render: r => String(r.date ?? '—') },
            { header: 'Location', render: r => String(r.location ?? '—') },
            { header: 'PFI', render: r => String(r.pfi_number ?? '—') },
            { header: 'Litres Sold', right: true, render: r => display(r.litres_sold_today) },
            { header: 'Commission', right: true, render: r => display(r.amount_paid, true) },
          ]}
          confirmDeleteId={confirmDeleteId}
          onSetDeleteId={setConfirmDeleteId}
          onConfirmDelete={id => deleteMutation.mutate(id)}
          onView={r => setViewEntry(r)}
          onDownload={redownload}
        />
        <HistoryPager page={histPage} total={totalPages} onPrev={() => setHistPage(p => p - 1)} onNext={() => setHistPage(p => p + 1)} count={history.length} />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// IT COMPLIANCE REPORT PANEL (role 18)
// ═══════════════════════════════════════════════════════════════════════════

interface CompForm {
  location: string; pfi: string; date: string;
  numberOfOrders: string;
  totalLitres: string;
  rates: string;      // free-text: e.g. "₦300/L standard, ₦350/L bulk"
  remarks: string;
}

const EMPTY_COMP: CompForm = {
  location: '', pfi: '', date: today(),
  numberOfOrders: '', totalLitres: '', rates: '', remarks: '',
};

function generateCompliancePDF(form: CompForm, staffName: string) {
  const { doc, M, CW } = buildPdfBase('IT COMPLIANCE REPORT');
  const fmtNum = (v: string) => { const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n.toLocaleString() : '—'; };
  const rows = [
    { label: 'LOCATION',            value: (form.location || '—').toUpperCase() },
    { label: 'PFI',                 value: (form.pfi || '—').toUpperCase() },
    { label: 'DATE',                value: form.date ? format(new Date(form.date + 'T00:00:00'), 'dd MMM yyyy').toUpperCase() : '—' },
    { label: 'NO. OF ORDERS TODAY', value: fmtNum(form.numberOfOrders), highlight: true },
    { label: 'TOTAL LITRES',        value: fmtNum(form.totalLitres) + (form.totalLitres ? ' LITRES' : ''), highlight: true },
    { label: 'RATES FOR THE DAY',   value: (form.rates || '—').toUpperCase(), highlight: true },
    { label: 'SUBMITTED BY',        value: staffName.toUpperCase() },
  ];
  let Y = buildRows(doc, M, CW, 54, rows);

  if (form.remarks.trim()) {
    Y += 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(70, 80, 100);
    doc.text('REMARKS', M, Y); Y += 4;
    const H = 32;
    doc.setFillColor(249, 250, 251); doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.3);
    doc.rect(M, Y, CW, H, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  }

  const safe = (form.date || today()).replace(/-/g, '');
  const loc = (form.location || 'ITC').replace(/[/\\*?:[\]]/g, '-');
  doc.save(`ComplianceReport_${loc}_${safe}.pdf`);
}

function ComplianceReportPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staffName = localStorage.getItem('fullname') || 'Unknown';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CompForm>(EMPTY_COMP);
  const [histPage, setHistPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewEntry, setViewEntry] = useState<ReportEntry | null>(null);

  const set = (f: keyof CompForm) => (v: string) => setForm(p => ({ ...p, [f]: v }));

  const filterOptsQuery = useQuery({
    queryKey: ['my-report-filter-opts'],
    queryFn: () => apiClient.admin.getSecurityFilterOptions(),
    staleTime: 60_000,
  });
  const scopedLocations = useMemo(() => readScopedLocations(), []);
  const scopedPfis = useMemo(() => readScopedPfis(), []);
  const locations = scopedLocations.length ? scopedLocations : (filterOptsQuery.data?.locations.map(l => l.name) ?? []);
  const pfis = scopedPfis.length ? scopedPfis : (filterOptsQuery.data?.pfis.map(p => p.pfi_number) ?? []);

  const histQuery = useQuery({
    queryKey: ['my-report-history', 'IT_COMPLIANCE', histPage],
    queryFn: () => apiClient.admin.getStaffReportHistory(histPage, 50, false),
    staleTime: 15_000,
  });

  const history = ((histQuery.data?.results ?? []) as ReportEntry[]).filter(r => {
    const tag = TAG_RE.exec(String(r.submitted_by_name ?? ''))?.[1];
    return tag === 'IT_COMPLIANCE';
  });
  const totalPages = Math.ceil(history.length / 10) || 1;

  // Encode extra fields into remarks for storage; stored fields: orders, litres come from API columns
  const buildRemarks = (f: CompForm) => {
    const parts: string[] = [];
    if (f.rates.trim()) parts.push(`RATES: ${f.rates.trim()}`);
    if (f.remarks.trim()) parts.push(f.remarks.trim());
    return parts.join('\n\n');
  };

  const parseEntry = (r: ReportEntry) => {
    const remarksRaw = String(r.remarks ?? '');
    const ratesMatch = remarksRaw.match(/^RATES:\s*(.+?)(?:\n\n|$)/s);
    const rates = ratesMatch?.[1]?.trim() ?? '';
    const remarks = remarksRaw.replace(/^RATES:\s*.+?(?:\n\n|$)/s, '').trim();
    return { rates, remarks };
  };

  const mutation = useMutation({
    mutationFn: () => apiClient.admin.submitStaffDailyReport({
      date: form.date,
      location: form.location,
      pfi_number: form.pfi,
      submitted_by_name: `${staffName} [IT_COMPLIANCE]`,
      num_trucks_sold: form.numberOfOrders || '0',
      litres_sold_today: form.totalLitres || '0',
      remarks: buildRemarks(form),
    }),
    onSuccess: () => {
      generateCompliancePDF(form, staffName);
      toast({ title: 'Compliance report saved', description: `${form.location} · ${form.date}` });
      setShowForm(false);
      setForm(EMPTY_COMP);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'IT_COMPLIANCE'] });
    },
    onError: (err: Error) => toast({ title: 'Failed', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteStaffDailyReport(id),
    onSuccess: () => {
      toast({ title: 'Report deleted' });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ['my-report-history', 'IT_COMPLIANCE'] });
    },
    onError: (err: Error) => { toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }); setConfirmDeleteId(null); },
  });

  const redownload = (r: ReportEntry) => {
    const { rates, remarks } = parseEntry(r);
    generateCompliancePDF({
      location: String(r.location ?? ''), pfi: String(r.pfi_number ?? ''),
      date: String(r.date ?? ''),
      numberOfOrders: String(r.num_trucks_sold ?? ''),
      totalLitres: String(r.litres_sold_today ?? ''),
      rates, remarks,
    }, staffName);
  };

  return (
    <>
      {viewEntry && (
        <Dialog open onOpenChange={open => { if (!open) setViewEntry(null); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Compliance Report — {String(viewEntry.date ?? '')} · {String(viewEntry.location ?? '')}</DialogTitle>
              <DialogDescription className="sr-only">View compliance report</DialogDescription>
            </DialogHeader>
            {(() => {
              const { rates, remarks } = parseEntry(viewEntry);
              return (
                <div className="space-y-1.5 mt-2 text-sm">
                  {[
                    ['Date',              String(viewEntry.date ?? '—')],
                    ['Location',          String(viewEntry.location ?? '—')],
                    ['PFI',               String(viewEntry.pfi_number ?? '—')],
                    ['Orders Today',      display(viewEntry.num_trucks_sold)],
                    ['Total Litres',      display(viewEntry.litres_sold_today)],
                    ['Rates for the Day', rates || '—'],
                    ['Remarks',           remarks || '—'],
                  ].map(([l, v]) => (
                    <div key={l} className="flex gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <span className="w-36 shrink-0 text-xs font-semibold text-slate-400 uppercase tracking-wide pt-0.5">{l}</span>
                      <span className="text-slate-800 font-medium break-words">{v}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setViewEntry(null)}>Close</Button>
              <Button size="sm" className="gap-1.5 bg-slate-800 text-white" onClick={() => { redownload(viewEntry); setViewEntry(null); }}>
                <Download size={13} /> Download PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setForm(EMPTY_COMP); } }}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList size={18} className="text-slate-600" /> IT Compliance Report
            </DialogTitle>
            <DialogDescription>Record today's compliance figures for this location.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location <span className="text-red-500">*</span></Label>
                <select aria-label="Location" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.location} onChange={e => set('location')(e.target.value)}>
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>PFI (optional)</Label>
                <select aria-label="PFI" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.pfi} onChange={e => set('pfi')(e.target.value)}>
                  <option value="">All PFIs</option>
                  {pfis.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.date} onChange={e => set('date')(e.target.value)} />
            </div>

            <div className="h-px bg-slate-100" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Figures</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>No. of Orders Today</Label>
                <CommaInput placeholder="0" value={form.numberOfOrders} onValueChange={v => set('numberOfOrders')(v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Total Litres</Label>
                <CommaInput placeholder="0" value={form.totalLitres} onValueChange={v => set('totalLitres')(v)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Rates for the Day</Label>
              <Input
                placeholder="e.g. ₦300/L standard, ₦350/L bulk"
                value={form.rates}
                onChange={e => set('rates')(e.target.value)}
              />
              <p className="text-xs text-slate-400">Enter all applicable rates, separated by commas if multiple.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <textarea rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any additional notes…"
                value={form.remarks} onChange={e => set('remarks')(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_COMP); }}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.location || !form.date}
              className="gap-1.5">
              {mutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={13} /> Submit &amp; Download</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileBarChart2 size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">My Compliance Reports</h2>
            {history.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{history.length}</span>}
          </div>
          <Button size="sm" className="gap-1.5 shadow-sm" onClick={() => { setForm(EMPTY_COMP); setShowForm(true); }}>
            <Plus size={13} /> Enter Report
          </Button>
        </div>
        <ReportHistoryTable
          rows={history.slice((histPage - 1) * 10, histPage * 10)}
          loading={histQuery.isLoading}
          columns={[
            { header: 'Date',     render: r => String(r.date ?? '—') },
            { header: 'Location', render: r => String(r.location ?? '—') },
            { header: 'PFI',      render: r => String(r.pfi_number ?? '—') },
            { header: 'Orders',   right: true, render: r => display(r.num_trucks_sold) },
            { header: 'Litres',   right: true, render: r => display(r.litres_sold_today) },
            { header: 'Submitted', right: true, render: r => r.updated_at ? format(parseISO(String(r.updated_at)), 'dd MMM, HH:mm') : '—' },
          ]}
          confirmDeleteId={confirmDeleteId}
          onSetDeleteId={setConfirmDeleteId}
          onConfirmDelete={id => deleteMutation.mutate(id)}
          onView={r => setViewEntry(r)}
          onDownload={redownload}
        />
        <HistoryPager page={histPage} total={totalPages} onPrev={() => setHistPage(p => p - 1)} onNext={() => setHistPage(p => p + 1)} count={history.length} />
      </div>
    </>
  );
}

// ─── Reusable sub-components ─────────────────────────────────────────────────

type ColDef = {
  header: string;
  right?: boolean;
  render: (r: ReportEntry) => React.ReactNode;
};

function ReportHistoryTable({ rows, loading, columns, confirmDeleteId, onSetDeleteId, onConfirmDelete, onView, onDownload }: {
  rows: ReportEntry[];
  loading: boolean;
  columns: ColDef[];
  confirmDeleteId: number | null;
  onSetDeleteId: (id: number | null) => void;
  onConfirmDelete: (id: number) => void;
  onView: (r: ReportEntry) => void;
  onDownload: (r: ReportEntry) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
        <Loader2 size={15} className="animate-spin" /> Loading history…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
        <ClipboardList size={28} className="text-slate-200" />
        <p className="text-sm text-slate-400">No reports submitted yet.</p>
        <p className="text-xs text-slate-300">Click <strong className="text-slate-500">Enter Report</strong> to submit your first.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
            {columns.map(c => (
              <th key={c.header} className={`px-4 py-2.5 ${c.right ? 'text-right' : 'text-left'}`}>{c.header}</th>
            ))}
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={`text-sm border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
              {columns.map(c => (
                <td key={c.header} className={`px-4 py-3 ${c.right ? 'text-right' : ''} text-slate-700`}>{c.render(r)}</td>
              ))}
              <td className="px-4 py-3 text-right">
                {confirmDeleteId === r.id ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-red-600 font-medium">Delete?</span>
                    <button type="button" onClick={() => onConfirmDelete(r.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">Yes</button>
                    <span className="text-slate-300">|</span>
                    <button type="button" onClick={() => onSetDeleteId(null)} className="text-xs text-slate-500 hover:text-slate-700">No</button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-3">
                    <button type="button" onClick={() => onView(r)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-700">
                      <FileText size={12} /> View
                    </button>
                    <button type="button" onClick={() => onDownload(r)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                      <Download size={12} /> PDF
                    </button>
                    <button type="button" title="Delete report" onClick={() => onSetDeleteId(r.id)} className="inline-flex items-center gap-1 text-xs font-medium text-red-400 hover:text-red-600">
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPager({ page, total, onPrev, onNext, count }: {
  page: number; total: number; onPrev: () => void; onNext: () => void; count: number;
}) {
  if (total <= 1 || count === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
      <span className="text-xs text-slate-400">
        Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, count)} of {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={onPrev}>
          <ChevronLeft size={14} />
        </Button>
        <span className="text-xs text-slate-600 font-medium">{page} / {total}</span>
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= total} onClick={onNext}>
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_LABELS: Record<number, string> = {
  0: 'Reports',
  5: 'My Gate Report',
  9: 'My Daily Sales Report',
  10: 'My Daily Sales Report',
  15: 'My Commission Report',
  16: 'My Commission Report',
  18: 'My Compliance Report',
};

const ROLE_DESCRIPTIONS: Record<number, string> = {
  0: 'Submit reports on behalf of any role. Select the report type below.',
  5: 'Submit and review your daily gate reports. Each submission generates a downloadable PDF.',
  9: 'Submit and review your daily sales reports for the locations you manage.',
  10: 'Submit and review your daily product sales reports.',
  15: 'Submit and review your daily commission reports.',
  16: 'Submit and review your daily commission reports.',
  18: 'Submit and review your IT compliance observation reports.',
};

type AdminReportTab = 'sales_manager' | 'product_manager' | 'security' | 'commissions' | 'compliance';

const ADMIN_TABS: { key: AdminReportTab; label: string }[] = [
  { key: 'sales_manager',   label: 'Sales Manager' },
  { key: 'product_manager', label: 'Product Manager' },
  { key: 'security',        label: 'Security Gate' },
  { key: 'commissions',     label: 'Commissions' },
  { key: 'compliance',      label: 'IT Compliance' },
];

function AdminReportSelector() {
  const [tab, setTab] = useState<AdminReportTab>('sales_manager');
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 flex-wrap">
        {ADMIN_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 h-9 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-slate-800 ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      {tab === 'sales_manager'   && <DailyReportPanel pageRole="SALES_MANAGER" />}
      {tab === 'product_manager' && <DailyReportPanel pageRole="PRODUCT_MANAGER" />}
      {tab === 'security'        && <GateReportPanel />}
      {tab === 'commissions'     && <CommissionReportPanel />}
      {tab === 'compliance'      && <ComplianceReportPanel />}
    </div>
  );
}

export default function MyReportPage() {
  const role = Number(localStorage.getItem('role') ?? '-1');

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PageHeader
              title={ROLE_LABELS[role] ?? 'My Report'}
              description={ROLE_DESCRIPTIONS[role] ?? 'Submit and review your reports.'}
            />

            {role === 0  && <AdminReportSelector />}
            {role === 9  && <DailyReportPanel pageRole="SALES_MANAGER" />}
            {role === 10 && <DailyReportPanel pageRole="PRODUCT_MANAGER" />}
            {role === 5  && <GateReportPanel />}
            {(role === 15 || role === 16) && <CommissionReportPanel />}
            {role === 18 && <ComplianceReportPanel />}

            {![0, 5, 9, 10, 15, 16, 18].includes(role) && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 flex flex-col items-center gap-3 text-center">
                <ClipboardList size={36} className="text-slate-200" />
                <p className="text-slate-500 font-medium">Your role doesn't have a report assigned yet.</p>
                <p className="text-xs text-slate-400">Contact your administrator if you believe this is an error.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
