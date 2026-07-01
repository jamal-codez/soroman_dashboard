//
// COMMISSIONS — ₦1 per litre paid to the order's customer (Facilitator) once
// tickets have been generated for that order. Shows the truck breakdown per
// order, lets finance confirm payout (with a confirmation dialog so a stray
// click can't mark something paid), and exports a daily commission report.
//
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  MapPin, FileText, RefreshCw, AlertTriangle, Banknote,
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

const COMMISSION_RATE = 1; // ₦1 per litre

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

const getCommissionAmount = (o: Order): number =>
  o.commission_paid_at ? toNum(o.commission_amount) : getTotalQty(o) * COMMISSION_RATE;

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
// Confirm Payout Dialog
// ═══════════════════════════════════════════════════════════════════════════

const ConfirmPayoutDialog = ({
  order,
  open,
  onClose,
  onConfirmed,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const ref = getOrderReference(order);
  const amount = getCommissionAmount(order);
  const qty = getTotalQty(order);

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
              <span className="text-slate-500">Commission (₦{COMMISSION_RATE}/L)</span>
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
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function Commissions() {
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

  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['commissions-orders'],
    queryFn: () => fetchAllPages<Order>(
      p => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
    ),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Eligibility: only orders that have had tickets generated.
  const eligibleOrders: Order[] = useMemo(
    () => (data?.results ?? []).filter(o => Boolean(o.ticket_generated_at)),
    [data],
  );

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
    const totalPaid = paidOrders.reduce((s, o) => s + getCommissionAmount(o), 0);
    const totalPending = pendingOrders.reduce((s, o) => s + getCommissionAmount(o), 0);

    return [
      { title: 'Eligible Orders', value: String(totalOrders), icon: <FileText size={20} />, tone: 'neutral', description: `${totalTrucks} truck${totalTrucks !== 1 ? 's' : ''}` },
      { title: 'Total Qty Loaded (L)', value: totalQty > 0 ? fmtQty(totalQty) : '0', icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'Commission Pending', value: fmt(totalPending), icon: <Clock size={20} />, tone: pendingOrders.length > 0 ? 'amber' : 'neutral', description: `${pendingOrders.length} order${pendingOrders.length !== 1 ? 's' : ''}` },
      { title: 'Commission Paid', value: fmt(totalPaid), icon: <Banknote size={20} />, tone: 'green', description: `${paidOrders.length} order${paidOrders.length !== 1 ? 's' : ''}` },
    ];
  }, [filteredOrders]);

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
    const totalCommission = filteredOrders.reduce((s, o) => s + getCommissionAmount(o), 0);
    const totalPaid = filteredOrders.filter(isPaid).reduce((s, o) => s + getCommissionAmount(o), 0);
    const totalPending = filteredOrders.filter(o => !isPaid(o)).reduce((s, o) => s + getCommissionAmount(o), 0);

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
        `N${getCommissionAmount(o).toLocaleString()}`,
        isPaid(o) ? 'PAID' : 'PENDING',
        o.commission_paid_by_name || '—',
      ].map(v => String(v).toUpperCase());
    });

    const totalsRow = [
      'TOTAL', '', '', '', '', '', '',
      totalQty.toLocaleString(), `N${totalCommission.toLocaleString()}`, '', '',
    ];

    const safeLabel = String(periodLabel).replace(/[/\\*?:[\]]/g, '-');
    const fileName = `COMMISSION REPORT ${safeLabel} - ${format(new Date(), 'ddMMyy')}`;

    return { headingBlock, headers, rows, totalsRow, fileName, safeLabel };
  };

  const COLUMN_ALIGN: Array<'left' | 'center' | 'right'> = [
    'left', 'left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'left', 'left',
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

      const widths = [18, 18, 22, 16, 16, 14, 30, 12, 14, 12, 18];
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

      const colWidthsMm = [20, 20, 26, 18, 18, 16, 40, 14, 16, 14, 22];
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
              description="₦1/litre commission owed to facilitators on ticket-generated orders — confirm payouts and export daily reports."
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel} disabled={filteredOrders.length === 0}>
                    <FileText size={15} /> Export Excel
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPDF} disabled={filteredOrders.length === 0}>
                    <FileText size={15} /> Export PDF
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Refresh
                  </Button>
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
                  <button title="Clear search" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
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
                      <button onClick={() => { setTimePreset('month'); setCustomFrom(''); setCustomTo(''); setCalRange({}); }} title="Remove date filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      {statusFilter === 'paid' ? 'Paid' : 'Pending'}
                      <button onClick={() => setStatusFilter('all')} title="Remove status filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {locationFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button onClick={() => setLocationFilter('all')} title="Remove location filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <FileText size={10} />{pfiFilter}
                      <button onClick={() => setPfiFilter('all')} title="Remove PFI filter" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Search size={10} />"{searchQuery}"
                      <button onClick={() => setSearchQuery('')} title="Clear search" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
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
                        const commission = getCommissionAmount(o);
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
      />
    </div>
  );
}
