/**
 * AdminReportsPage — daily reports hub, grouped by location.
 * Each location section shows sub-tables per role.
 * Excel: one sheet per location. PDF: per-location sections.
 * Summary cards show global totals for the filtered period.
 */
import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';
import {
  Loader2, CalendarDays, FileSpreadsheet, FileText,
  MapPin, Fuel, X, Package, FileBarChart2,
  ShieldCheck, BarChart2, Banknote, TrendingUp, Monitor, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TAG_RE = /\s*\[([A-Z_]+)\]$/;
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const fmtDate = (d: string) => {
  try { return format(new Date(`${d}T00:00:00`), 'dd MMM yyyy'); }
  catch { return d; }
};

const toNum = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Screen & Excel: full unicode (₦ and —)
const fmt = (v: unknown, money = false) => {
  const n = toNum(v);
  if (n === 0) return '—';
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return money ? `₦${s}` : s;
};

// PDF only: strip characters that helvetica cannot render
const pdfSafe = (s: string) =>
  s.replace(/₦/g, '').replace(/—/g, '-').replace(/₦/g, '').trim() || '-';

const getTag = (r: Entry) =>
  TAG_RE.exec(String(r.submitted_by_name ?? ''))?.[1] ?? '';

type Entry = Record<string, unknown> & { id: number };
type RoleTag = 'SALES_MANAGER' | 'PRODUCT_MANAGER' | 'SECURITY' | 'COMMISSIONS' | 'IT_COMPLIANCE';

// ─── Column definitions ───────────────────────────────────────────────────────

type ColDef = {
  header: string;
  right?: boolean;
  excelWidth: number;
  pdfWidth?: number; // mm — explicit width hint for PDF autoTable
  cell: (r: Entry) => string;
};

type RoleDef = {
  tag: RoleTag;
  label: string;
  headerHex: string;
  headerBg: string;
  columns: ColDef[];
};

// Commission remarks helper
const commRemarks = (r: Entry): string => {
  const raw = String(r.remarks ?? '');
  const c = raw.match(/Customers:\s*(\d+)/)?.[1];
  const o = raw.match(/Orders:\s*(\d+)/)?.[1];
  return [c ? `Cust: ${c}` : '', o ? `Ord: ${o}` : ''].filter(Boolean).join(' | ') || '—';
};

const compRates = (r: Entry) =>
  String(r.remarks ?? '').match(/^RATES:\s*(.+?)(?:\n\n|$)/s)?.[1]?.trim() ?? '—';

const compRemarks = (r: Entry) =>
  String(r.remarks ?? '').replace(/^RATES:\s*.+?(?:\n\n|$)/s, '').trim() || '—';

// Sales Manager and Product Manager share the same columns
// (Location is now the section grouping, so it's removed from columns)
const SM_PM_COLS: ColDef[] = [
  { header: 'PFI',           excelWidth: 12, pdfWidth: 14, cell: r => String(r.pfi_number ?? '') || '—' },
  { header: 'Submitted By',  excelWidth: 22, pdfWidth: 26, cell: r => String(r.submitted_by_name ?? '').replace(TAG_RE, '').trim() || '—' },
  { header: 'Qty Sold (L)',  excelWidth: 14, pdfWidth: 16, right: true, cell: r => fmt(r.litres_sold_today) },
  { header: 'Price / L',     excelWidth: 12, pdfWidth: 14, right: true, cell: r => fmt(r.price, true) },
  { header: 'Total Sales',   excelWidth: 18, pdfWidth: 20, right: true, cell: r => fmt(r.total_sales_amount, true) },
  { header: 'Amt Paid',      excelWidth: 18, pdfWidth: 20, right: true, cell: r => fmt(r.amount_paid, true) },
  { header: 'Differentials', excelWidth: 16, pdfWidth: 18, right: true, cell: r => fmt(r.differentials, true) },
  { header: 'Trucks',        excelWidth: 9,  pdfWidth: 12, right: true, cell: r => fmt(r.num_trucks_sold) },
  { header: 'Left Over',     excelWidth: 11, pdfWidth: 14, right: true, cell: r => fmt(r.loading_left_over) },
  { header: 'Bank',          excelWidth: 18, pdfWidth: 18, cell: r => String(r.bank_name ?? '') || '—' },
  { header: 'Acct No.',      excelWidth: 16, pdfWidth: 16, cell: r => String(r.account_number ?? '') || '—' },
  { header: 'Remarks',       excelWidth: 26, cell: r => String(r.remarks ?? '') || '—' },
];

const ROLES: RoleDef[] = [
  {
    tag: 'SALES_MANAGER',
    label: 'Sales Manager',
    headerHex: '1E3A8A',
    headerBg: 'bg-blue-800',
    columns: SM_PM_COLS,
  },
  {
    tag: 'PRODUCT_MANAGER',
    label: 'Product Manager',
    headerHex: '581C87',
    headerBg: 'bg-purple-800',
    columns: SM_PM_COLS,
  },
  {
    tag: 'SECURITY',
    label: 'Security Gate',
    headerHex: '9A3412',
    headerBg: 'bg-orange-800',
    columns: [
      { header: 'PFI',           excelWidth: 12, pdfWidth: 14, cell: r => String(r.pfi_number ?? '') || '—' },
      { header: 'Submitted By',  excelWidth: 22, pdfWidth: 26, cell: r => String(r.submitted_by_name ?? '').replace(TAG_RE, '').trim() || '—' },
      { header: 'Carried Over',  excelWidth: 14, pdfWidth: 18, right: true, cell: r => fmt(r.yesterday_carried_over_loading) },
      { header: 'Trucks Exited', excelWidth: 14, pdfWidth: 18, right: true, cell: r => fmt(r.num_trucks_sold) },
      { header: 'Trucks Left',   excelWidth: 12, pdfWidth: 16, right: true, cell: r => fmt(r.loading_left_over) },
      { header: 'Remarks',       excelWidth: 30, cell: r => String(r.remarks ?? '') || '—' },
    ],
  },
  {
    tag: 'COMMISSIONS',
    label: 'Commissions',
    headerHex: '064E3B',
    headerBg: 'bg-emerald-900',
    columns: [
      { header: 'PFI',             excelWidth: 12, pdfWidth: 14, cell: r => String(r.pfi_number ?? '') || '—' },
      { header: 'Submitted By',    excelWidth: 22, pdfWidth: 26, cell: r => String(r.submitted_by_name ?? '').replace(TAG_RE, '').trim() || '—' },
      { header: 'Litres Sold',     excelWidth: 14, pdfWidth: 16, right: true, cell: r => fmt(r.litres_sold_today) },
      { header: 'Trucks',          excelWidth: 10, pdfWidth: 12, right: true, cell: r => fmt(r.num_trucks_sold) },
      { header: 'Commission Paid', excelWidth: 18, pdfWidth: 20, right: true, cell: r => fmt(r.amount_paid, true) },
      { header: 'Cust / Orders',   excelWidth: 16, pdfWidth: 16, cell: r => commRemarks(r) },
      { header: 'Remarks',         excelWidth: 26, cell: r => String(r.remarks ?? '').replace(/Customers:\s*\d+\s*\|\s*Orders:\s*\d+\s*\n?\n?/, '').trim() || '—' },
    ],
  },
  {
    tag: 'IT_COMPLIANCE',
    label: 'IT Compliance',
    headerHex: '1E293B',
    headerBg: 'bg-slate-800',
    columns: [
      { header: 'PFI',           excelWidth: 12, pdfWidth: 14, cell: r => String(r.pfi_number ?? '') || '—' },
      { header: 'Submitted By',  excelWidth: 22, pdfWidth: 26, cell: r => String(r.submitted_by_name ?? '').replace(TAG_RE, '').trim() || '—' },
      { header: 'Orders',        excelWidth: 12, pdfWidth: 14, right: true, cell: r => fmt(r.num_trucks_sold) },
      { header: 'Total Litres',  excelWidth: 14, pdfWidth: 16, right: true, cell: r => fmt(r.litres_sold_today) },
      { header: 'Rates for Day', excelWidth: 24, pdfWidth: 30, cell: r => compRates(r) },
      { header: 'Remarks',       excelWidth: 28, cell: r => compRemarks(r) },
    ],
  },
];

// Prepends a "Role" column so each row shows its role in tables/exports
const withRoleCol = (role: RoleDef): ColDef[] => [
  { header: 'Role', excelWidth: 18, pdfWidth: 24, cell: () => role.label },
  ...role.columns,
];

// ─── Location section builder ─────────────────────────────────────────────────

type RoleRows = { role: RoleDef; rows: Entry[] };
type LocationSection = { location: string; roleRows: RoleRows[] };

function buildLocationSections(entries: Entry[]): LocationSection[] {
  // 1. Group by location
  const byLocation = new Map<string, Entry[]>();
  for (const r of entries) {
    const loc = (String(r.location ?? '').trim()) || 'Unknown';
    if (!byLocation.has(loc)) byLocation.set(loc, []);
    byLocation.get(loc)!.push(r);
  }

  const sections: LocationSection[] = [];

  // 2. Sort locations alphabetically
  for (const [location, locEntries] of [...byLocation.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // 3. Within each location, group by role tag
    const byTag = new Map<string, Entry[]>();
    for (const r of locEntries) {
      const tag = getTag(r);
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(r);
    }

    // 4. Keep only roles that have at least one entry for this location
    const roleRows: RoleRows[] = ROLES
      .filter(role => (byTag.get(role.tag)?.length ?? 0) > 0)
      .map(role => ({ role, rows: byTag.get(role.tag)! }));

    if (roleRows.length > 0) {
      sections.push({ location, roleRows });
    }
  }

  return sections;
}

// ─── PDF export ───────────────────────────────────────────────────────────────

type JsPDFAT = jsPDF & { lastAutoTable?: { finalY: number } };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function exportPDF(
  sections: LocationSection[],
  dateLabel: string,
  locLabel: string,
  pfiLabel: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' }) as JsPDFAT;
  const PW = 297, M = 10, CW = PW - M * 2;

  // Masthead on page 1
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PW, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('SOROMAN ENERGY - DAILY REPORTS', PW / 2, 11.5, { align: 'center' });

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 18, PW, 8, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Date: ${dateLabel}    Location: ${locLabel}    PFI: ${pfiLabel}    Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    PW / 2, 23, { align: 'center' },
  );

  let curY = 30;

  for (const { location, roleRows } of sections) {
    // Location header bar
    if (curY > 165) { doc.addPage(); curY = 10; }
    doc.setFillColor(15, 23, 42);
    doc.rect(M, curY, CW, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(location.toUpperCase(), M + 4, curY + 6);
    const locTotal = roleRows.reduce((s, rr) => s + rr.rows.length, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${locTotal} ${locTotal === 1 ? 'entry' : 'entries'}`, M + CW - 3, curY + 6, { align: 'left' });
    curY += 10;

    for (const { role, rows } of roleRows) {
      if (curY > 168) { doc.addPage(); curY = 10; }

      const [rr, gg, bb] = hexToRgb(role.headerHex);

      // Role sub-header bar
      doc.setFillColor(rr, gg, bb);
      doc.rect(M, curY, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(role.label.toUpperCase(), M + 3, curY + 4.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(
        `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`,
        M + CW - 3, curY + 4.8, { align: 'right' },
      );
      curY += 7;

      // Build effective columns with Role prepended
      const effCols = withRoleCol(role);

      // Column styles: pin explicit widths + right-align numeric columns
      const colStyles: Record<number, object> = {};
      effCols.forEach((c, i) => {
        const s: Record<string, unknown> = {};
        if (c.pdfWidth) s.cellWidth = c.pdfWidth;
        if (c.right) s.halign = 'right';
        if (Object.keys(s).length) colStyles[i] = s;
      });

      autoTable(doc, {
        startY: curY,
        head: [effCols.map(c => c.header)],
        body: rows.map(r => effCols.map(c => pdfSafe(c.cell(r)))),
        margin: { left: M, right: M },
        styles: {
          font: 'helvetica',
          fontSize: 7,
          cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          textColor: [30, 41, 59],
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [51, 65, 85],
          fontStyle: 'bold',
          fontSize: 6.5,
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: colStyles,
        didDrawPage: hookData => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(148, 163, 184);
          doc.text(`Page ${hookData.pageNumber ?? 1}`, PW - M, 207, { align: 'right' });
          doc.text('Soroman Energy Dashboard', M, 207);
        },
      });

      curY = (doc.lastAutoTable?.finalY ?? curY) + 5;
    }

    curY += 5; // gap between locations
  }

  doc.save(`Soroman Reports - ${dateLabel.replace(/[/\\*?:[\]]/g, '-')}.pdf`);
}

// ─── Excel export ─────────────────────────────────────────────────────────────

async function exportExcel(
  sections: LocationSection[],
  dateLabel: string,
  locLabel: string,
  pfiLabel: string,
) {
  const WHITE  = 'FFFFFFFF';
  const BAND   = 'FFF8FAFC';
  const BORDER = 'FFB0C4DE';
  const NAVY   = 'FF0F172A';
  const thin   = { style: 'thin' as const, color: { argb: BORDER } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };

  // Maximum columns across all roles (+1 for the Role column prepended by withRoleCol)
  const MAX_COLS = Math.max(...ROLES.map(r => r.columns.length)) + 1;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Soroman Dashboard';
  wb.created = new Date();

  for (const { location, roleRows } of sections) {
    const ws = wb.addWorksheet(location.slice(0, 31), { views: [{ showGridLines: false }] });

    // Default column widths — overridden per role section below
    for (let i = 1; i <= MAX_COLS; i++) ws.getColumn(i).width = 16;

    let rowIdx = 1;
    const lastCol = ws.getColumn(MAX_COLS).letter;

    // Location title row
    ws.mergeCells(`A${rowIdx}:${lastCol}${rowIdx}`);
    const titleCell = ws.getCell(`A${rowIdx}`);
    titleCell.value = `${location.toUpperCase()} — ${dateLabel.toUpperCase()}`;
    titleCell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rowIdx).height = 26;
    rowIdx++;

    // Meta row
    ws.mergeCells(`A${rowIdx}:${lastCol}${rowIdx}`);
    const metaCell = ws.getCell(`A${rowIdx}`);
    metaCell.value = `Location: ${locLabel}   PFI: ${pfiLabel}   Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`;
    metaCell.font = { name: 'Calibri', size: 8, color: { argb: 'FFCBD5E1' }, italic: true };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rowIdx).height = 14;
    rowIdx++;

    // Blank spacer
    ws.getRow(rowIdx).height = 6;
    rowIdx++;

    for (const { role, rows } of roleRows) {
      const cols = withRoleCol(role);
      const hexFull = `FF${role.headerHex}`;

      // Update column widths for this role's columns
      cols.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        col.width = Math.max((col.width as number) ?? 0, c.excelWidth);
      });

      // Role header row — spans MAX_COLS
      ws.mergeCells(`A${rowIdx}:${lastCol}${rowIdx}`);
      const roleCell = ws.getCell(`A${rowIdx}`);
      roleCell.value = `${role.label.toUpperCase()}  (${rows.length} ${rows.length === 1 ? 'entry' : 'entries'})`;
      roleCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
      roleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexFull } };
      roleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.getRow(rowIdx).height = 20;
      rowIdx++;

      // Column header row
      const hdrRow = ws.getRow(rowIdx);
      hdrRow.height = 18;
      cols.forEach((c, i) => {
        const cell = hdrRow.getCell(i + 1);
        cell.value = c.header.toUpperCase();
        cell.font = { name: 'Calibri', bold: true, size: 8.5, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { horizontal: c.right ? 'right' : 'left', vertical: 'middle', indent: 1 };
        cell.border = borders;
      });
      rowIdx++;

      // Data rows
      rows.forEach((row, i) => {
        const dr = ws.getRow(rowIdx);
        dr.height = 15;
        cols.forEach((c, j) => {
          const cell = dr.getCell(j + 1);
          cell.value = c.cell(row);
          cell.font = { name: 'Calibri', size: 8.5 };
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: i % 2 === 0 ? WHITE : BAND },
          };
          cell.alignment = {
            horizontal: c.right ? 'right' : 'left',
            vertical: 'middle', indent: 1, wrapText: false,
          };
          cell.border = borders;
        });
        rowIdx++;
      });

      // Blank spacer between role sections
      ws.getRow(rowIdx).height = 8;
      rowIdx++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Soroman Reports - ${dateLabel.replace(/[/\\*?:[\]]/g, '-')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Screen components ────────────────────────────────────────────────────────

function RoleSubTable({ role, rows }: { role: RoleDef; rows: Entry[] }) {
  const cols = withRoleCol(role);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">#</th>
              {cols.map(c => (
                <th key={c.header}
                  className={cn(
                    'px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap',
                    c.right ? 'text-right' : 'text-left',
                  )}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id ?? i)} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                {cols.map(c => (
                  <td key={c.header}
                    className={cn(
                      'px-3 py-2 text-slate-700 whitespace-nowrap',
                      c.right ? 'text-right font-medium' : '',
                    )}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationSection({ section }: { section: LocationSection }) {
  const totalEntries = section.roleRows.reduce((s, rr) => s + rr.rows.length, 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      {/* Location header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-900">
        <MapPin size={14} className="text-slate-400 shrink-0" />
        <span className="text-sm font-bold text-white tracking-wide">{section.location}</span>
        <span className="rounded-full bg-white/15 border border-white/25 px-2.5 py-0.5 text-xs font-semibold text-white">
          {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Role sub-tables, separated by a thin divider */}
      <div className="divide-y divide-slate-100">
        {section.roleRows.map(({ role, rows }) => (
          <RoleSubTable key={role.tag} role={role} rows={rows} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Period = 'today' | 'yesterday' | 'custom';

export default function AdminReportsPage() {
  const [period, setPeriod]             = useState<Period>('today');
  const [customDate, setCustomDate]     = useState(todayStr());
  const [locationFilter, setLocation]   = useState('all');
  const [pfiFilter, setPfi]             = useState('all');
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingXLS, setExportingXLS] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [recipientEmails, setRecipientEmails] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const { toast } = useToast();

  const selectedDate = useMemo(() => {
    if (period === 'today')     return todayStr();
    if (period === 'yesterday') return format(subDays(new Date(), 1), 'yyyy-MM-dd');
    return customDate;
  }, [period, customDate]);

  const dateLabel = useMemo(() => {
    if (period === 'today')     return `Today, ${format(new Date(), 'dd MMM yyyy')}`;
    if (period === 'yesterday') return `Yesterday, ${format(subDays(new Date(), 1), 'dd MMM yyyy')}`;
    return fmtDate(customDate);
  }, [period, customDate]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-reports', selectedDate],
    queryFn: () => apiClient.admin.listStaffDailyEntries(selectedDate),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const allEntries: Entry[] = useMemo(() => (data?.reports ?? []) as Entry[], [data]);

  const filteredEntries = useMemo(() => allEntries.filter(r => {
    if (locationFilter !== 'all' && String(r.location ?? '').trim() !== locationFilter) return false;
    if (pfiFilter !== 'all' && String(r.pfi_number ?? '').trim() !== pfiFilter) return false;
    return true;
  }), [allEntries, locationFilter, pfiFilter]);

  const uniqueLocations = useMemo(() =>
    [...new Set(allEntries.map(r => String(r.location ?? '').trim()).filter(Boolean))].sort(),
    [allEntries]);

  const uniquePfis = useMemo(() =>
    [...new Set(allEntries.map(r => String(r.pfi_number ?? '').trim()).filter(Boolean))].sort(),
    [allEntries]);

  const locationSections = useMemo(
    () => buildLocationSections(filteredEntries),
    [filteredEntries],
  );

  // ── Summary card totals (from filteredEntries) ───────────────────────────
  const totalLitres = filteredEntries.reduce((s, r) => s + toNum(r.litres_sold_today), 0);

  const totalSales = filteredEntries
    .filter(r => getTag(r) === 'SALES_MANAGER' || getTag(r) === 'PRODUCT_MANAGER')
    .reduce((s, r) => s + toNum(r.total_sales_amount), 0);

  const totalCommission = filteredEntries
    .filter(r => getTag(r) === 'COMMISSIONS')
    .reduce((s, r) => s + toNum(r.amount_paid), 0);

  const totalTrucks = filteredEntries
    .filter(r => getTag(r) === 'SECURITY')
    .reduce((s, r) => s + toNum(r.num_trucks_sold), 0);

  const summaryCards: SummaryCard[] = [
    // {
    //   title: 'Total Reports',
    //   value: isLoading ? '…' : String(filteredEntries.length),
    //   description: `${locationSections.length} location${locationSections.length !== 1 ? 's' : ''}`,
    //   icon: <FileBarChart2 size={18} />,
    //   tone: 'neutral',
    // },
    {
      title: 'Total Litres',
      value: isLoading ? '…' : totalLitres.toLocaleString('en-US'),
      // description: 'All roles combined',
      icon: <TrendingUp size={18} />,
      tone: 'blue',
    },
    {
      title: 'Total Sales',
      value: isLoading ? '…' : `₦${totalSales.toLocaleString('en-US')}`,
      // description: 'SM + PM combined',
      icon: <BarChart2 size={18} />,
      tone: 'green',
    },
    {
      title: 'Commission Paid',
      value: isLoading ? '…' : `₦${totalCommission.toLocaleString('en-US')}`,
      // description: 'Commissions role',
      icon: <Banknote size={18} />,
      tone: 'amber',
    },
    {
      title: 'Trucks Exited',
      value: isLoading ? '…' : String(totalTrucks),
      // description: 'Security gate total',
      icon: <ShieldCheck size={18} />,
      tone: 'neutral',
    },
  ];

  const locLabel  = locationFilter === 'all' ? 'All Locations' : locationFilter;
  const pfiLabel  = pfiFilter === 'all' ? 'All PFIs' : pfiFilter;
  const hasFilters = locationFilter !== 'all' || pfiFilter !== 'all';

  const handleSendEmail = async () => {
    const recipients = recipientEmails
      .split(/[\n,]+/)
      .map(address => address.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      toast({ title: 'Add recipients', description: 'Enter at least one email address before sending.', variant: 'destructive' });
      return;
    }

    if (allEntries.length === 0) {
      toast({ title: 'No report data', description: 'There is nothing to email for this date yet.', variant: 'destructive' });
      return;
    }

    setSendingEmail(true);
    try {
      const res = await apiClient.admin.sendStaffDailyReportEmail(selectedDate, recipients);
      toast({
        title: 'Report Sent',
        description: res.message || `The daily report for ${dateLabel} was emailed to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`,
      });
      setShowEmailComposer(false);
    } catch (error: any) {
      toast({ title: 'Send Failed', description: error.message || 'Could not send the report.', variant: 'destructive' });
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePDF = async () => {
    setExportingPDF(true);
    try { await exportPDF(locationSections, dateLabel, locLabel, pfiLabel); }
    finally { setExportingPDF(false); }
  };

  const handleExcel = async () => {
    setExportingXLS(true);
    try { await exportExcel(locationSections, dateLabel, locLabel, pfiLabel); }
    finally { setExportingXLS(false); }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* Page header */}
            <PageHeader
              title="Staff Reports"
              description="Daily staff submissions for every PFI & Location."
              actions={
                <div className="flex items-center gap-2">
                  {/* <Button variant="outline" size="sm" className="gap-2"
                    onClick={handlePDF}
                    disabled={exportingPDF || filteredEntries.length === 0 || isLoading}>
                    {exportingPDF
                      ? <Loader2 size={14} className="animate-spin" />
                      : <FileText size={14} />}
                    Export PDF
                  </Button> */}
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={() => setShowEmailComposer(v => !v)}>
                    <Mail size={14} />
                    {showEmailComposer ? 'Hide Email' : 'Email Report'}
                  </Button>
                  <Button variant="default" size="sm" className="gap-2"
                    onClick={handleExcel}
                    disabled={exportingXLS || filteredEntries.length === 0 || isLoading}>
                    {exportingXLS
                      ? <Loader2 size={14} className="animate-spin" />
                      : <FileSpreadsheet size={14} />}
                    Download Report
                  </Button>
                </div>
              }
            />

            {showEmailComposer && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Send this report by email</p>
                    <p className="text-xs text-slate-500">
                      Enter recipients (comma or new-line separated) and we'll email the full report for {dateLabel}.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="report-recipients" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipients</label>
                  <textarea
                    id="report-recipients"
                    rows={4}
                    value={recipientEmails}
                    onChange={e => setRecipientEmails(e.target.value)}
                    placeholder="name@company.com, another@company.com"
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <Button size="sm" className="gap-2" onClick={handleSendEmail} disabled={sendingEmail}>
                    {sendingEmail
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Mail size={14} />}
                    {sendingEmail ? 'Sending…' : 'Send Report'}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Filter panel ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Date period */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(['today', 'yesterday'] as Period[]).map(p => (
                    <button key={p} type="button"
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                        period === p
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}>
                      {p === 'today' ? 'Today' : 'Yesterday'}
                    </button>
                  ))}

                  {/* Custom date picker */}
                  <div className={`px-3 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-all ${
                    period === 'custom'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}>
                    <CalendarDays size={11} />
                    <input
                      aria-label="Pick a date"
                      type="date"
                      max={todayStr()}
                      value={customDate}
                      onChange={e => { setCustomDate(e.target.value); setPeriod('custom'); }}
                      className={cn(
                        'bg-transparent outline-none text-xs cursor-pointer',
                        period === 'custom' ? 'text-white' : 'text-slate-600',
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Scope filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <select
                    aria-label="Filter by location"
                    value={locationFilter}
                    onChange={e => setLocation(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="all">All Locations</option>
                    {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Fuel size={12} /> PFI
                  </p>
                  <select
                    aria-label="Filter by PFI"
                    value={pfiFilter}
                    onChange={e => setPfi(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300">
                    <option value="all">All PFIs</option>
                    {uniquePfis.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Active filter chips + count */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {locationFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button type="button" onClick={() => setLocation('all')} title="Remove" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Fuel size={10} />{pfiFilter}
                      <button type="button" onClick={() => setPfi('all')} title="Remove" className="ml-0.5 hover:text-slate-900"><X size={10} /></button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 h-8 text-xs"
                      onClick={() => { setLocation('all'); setPfi('all'); }}>
                      <X size={13} /> Clear filters
                    </Button>
                  )}
                  {!isLoading && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} shown
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Summary cards ── */}
            <SummaryCards
              cards={summaryCards}
              gridClassName="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2"
            />

            {/* ── Location sections ── */}
            {isLoading ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm py-16 flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-slate-300" />
                <p className="text-sm text-slate-400">Loading reports…</p>
              </div>
            ) : isError ? (
              <div className="bg-white rounded-lg border border-red-200 shadow-sm p-10 text-center">
                <FileBarChart2 className="mx-auto text-red-200 mb-3" size={40} />
                <p className="text-slate-600 font-medium">Failed to load reports</p>
                <p className="text-sm text-slate-400 mt-1">Check your connection and try again.</p>
              </div>
            ) : locationSections.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-10 text-center">
                <Package className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="text-slate-500 font-medium">No reports submitted yet</p>
                <p className="text-sm text-slate-400 mt-1">Reports will appear here once staff submit them for this date.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {locationSections.map(section => (
                  <LocationSection key={section.location} section={section} />
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
