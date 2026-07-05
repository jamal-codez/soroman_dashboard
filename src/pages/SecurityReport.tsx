import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { MobileNav } from "@/components/MobileNav";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, FileSpreadsheet, FileText, Loader2, ListChecks, TruckIcon, Fuel, MapPin, SlidersHorizontal, ClipboardList, CheckCircle2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";

// ═══════════════════════════════════════════════════════════════════════════
// Daily Gate Report — form, PDF generator, dialog
// ═══════════════════════════════════════════════════════════════════════════

interface GateReportForm {
  location: string;
  pfi: string;
  date: string;
  carriedOverYesterday: string;
  trucksExitedToday: string;
  trucksLeftOverToday: string;
  staffNameAndDate: string;
  remarks: string;
}

const readScopedLocations = (): string[] => {
  try { return JSON.parse(localStorage.getItem("location_names") || "[]") as string[]; }
  catch { return []; }
};

const readScopedPfis = (): string[] => {
  try { return JSON.parse(localStorage.getItem("pfi_numbers") || "[]") as string[]; }
  catch { return []; }
};

const buildInitialGateForm = (): GateReportForm => {
  const fullname = localStorage.getItem("fullname") || "";
  const today = format(new Date(), "yyyy-MM-dd");
  return {
    location: "",
    pfi: "",
    date: today,
    carriedOverYesterday: "",
    trucksExitedToday: "",
    trucksLeftOverToday: "",
    staffNameAndDate: fullname ? `${fullname} — ${format(new Date(), "dd MMM yyyy")}` : "",
    remarks: "",
  };
};

const generateGateReportPDF = (form: GateReportForm) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16, CW = W - M * 2;
  const generatedAt = format(new Date(), "dd MMM yyyy, HH:mm");

  type RGB = [number, number, number];
  const NAVY:  RGB = [15, 23, 42];
  const BLUE:  RGB = [37, 99, 235];
  const DARK:  RGB = [15, 23, 42];
  const WHITE: RGB = [255, 255, 255];
  const LBLBG: RGB = [243, 245, 248];
  const BORDER: RGB = [210, 215, 225];

  // ── Header ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 46, "F");
  doc.setFillColor(...BLUE);
  doc.rect(0, 42, W, 4, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("SOROMAN ENERGY LIMITED", M, 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("DAILY GATE REPORT", M, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${generatedAt}`, M, 39);

  const dateStr = form.date
    ? format(new Date(form.date + "T00:00:00"), "dd MMM yyyy").toUpperCase()
    : format(new Date(), "dd MMM yyyy").toUpperCase();
  doc.setFillColor(...BLUE);
  doc.roundedRect(W - M - 50, 14, 50, 16, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(dateStr, W - M - 25, 23.5, { align: "center" });

  // ── Table ─────────────────────────────────────────────────────────
  let Y = 54;
  const ROW_H = 8;
  const LABEL_W = 86;
  const VALUE_W = CW - LABEL_W;

  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [
    { label: "LOCATION", value: (form.location || "—").toUpperCase() },
    { label: "PFI", value: (form.pfi || "—").toUpperCase() },
    { label: "DATE", value: form.date ? format(new Date(form.date + "T00:00:00"), "dd MMM yyyy").toUpperCase() : "—" },
    { label: "NO. OF YESTERDAY CARRIED OVER LOADING", value: (form.carriedOverYesterday || "—").toUpperCase(), highlight: true },
    { label: "NO. OF TRUCKS SOLD / EXITED TODAY", value: (form.trucksExitedToday || "—").toUpperCase(), highlight: true },
    { label: "NO. OF TRUCKS LOADING LEFT OVER TODAY", value: (form.trucksLeftOverToday || "—").toUpperCase(), highlight: true },
    { label: "STAFF NAME & DATE", value: (form.staffNameAndDate || "—").toUpperCase() },
  ];

  // Outer border
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, rows.length * ROW_H, "S");

  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;

    doc.setFillColor(...LBLBG);
    doc.rect(M, Y, LABEL_W, ROW_H, "F");

    doc.setFillColor(...(row.highlight ? ([235, 242, 255] as RGB) : ([255, 255, 255] as RGB)));
    doc.rect(M + LABEL_W, Y, VALUE_W, ROW_H, "F");

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(M + LABEL_W, Y, M + LABEL_W, Y + ROW_H);
    if (!isLast) doc.line(M, Y + ROW_H, M + CW, Y + ROW_H);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(70, 80, 100);
    doc.text(row.label, M + 4, Y + 5.5);

    doc.setFont("helvetica", row.highlight ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...(row.highlight ? BLUE : DARK));
    doc.text(row.value, M + LABEL_W + 5, Y + 5.5);

    Y += ROW_H;
  });

  // ── Remarks ────────────────────────────────────────────────────────
  Y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 100);
  doc.text("REMARKS", M, Y);
  Y += 4;

  const REMARKS_H = 36;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, Y, CW, REMARKS_H, "FD");

  if (form.remarks.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(form.remarks.trim(), CW - 8), M + 4, Y + 7);
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(160, 170, 185);
    doc.text("No remarks provided.", M + 4, Y + 8);
  }

  Y += REMARKS_H + 18;

  // ── Signatures ─────────────────────────────────────────────────────
  const SIG_W = (CW - 12) / 2;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(M, Y, M + SIG_W, Y);
  doc.line(M + SIG_W + 12, Y, M + SIG_W + 12 + SIG_W, Y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("PREPARED BY / DATE", M, Y + 5);
  doc.text("AUTHORISED BY / DATE", M + SIG_W + 12, Y + 5);

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setFillColor(...BLUE);
  doc.rect(0, H - 12, W, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Soroman Energy Limited — Confidential", M, H - 4.5);
  doc.text(`Page 1 of 1  •  ${generatedAt}`, W - M, H - 4.5, { align: "right" });

  const safeDate = form.date || format(new Date(), "yyyy-MM-dd");
  const safeLoc = (form.location || "REPORT").replace(/[/\\*?:[\]]/g, "-");
  doc.save(`DAILY GATE REPORT - ${safeLoc} - ${safeDate}.pdf`);
};

// ── Dialog ───────────────────────────────────────────────────────────────

function DailyGateReportDialog({
  open, onClose,
  locations: propLocations,
  pfis: propPfis,
}: {
  open: boolean;
  onClose: () => void;
  locations?: string[];
  pfis?: string[];
}) {
  const [form, setForm] = useState<GateReportForm>(buildInitialGateForm);
  const [submitted, setSubmitted] = useState(false);

  const scopedLocations = propLocations?.length ? propLocations : readScopedLocations();
  const scopedPfis = propPfis?.length ? propPfis : readScopedPfis();

  const set = (field: keyof GateReportForm) => (v: string) =>
    setForm(f => ({ ...f, [field]: v }));

  const handleSubmit = () => {
    if (!form.location || !form.date) return;
    generateGateReportPDF(form);
    setSubmitted(true);
  };

  const handleClose = () => {
    setForm(buildInitialGateForm());
    setSubmitted(false);
    onClose();
  };

  const previewRows: [string, string][] = [
    ["Location", form.location || "—"],
    ["PFI", form.pfi || "—"],
    ["Date", form.date ? format(new Date(form.date + "T00:00:00"), "dd MMM yyyy") : "—"],
    ["No. of Yesterday Carried Over Loading", form.carriedOverYesterday || "—"],
    ["No. of Trucks Sold/Exited Today", form.trucksExitedToday || "—"],
    ["No. of Trucks Loading Left Over Today", form.trucksLeftOverToday || "—"],
    ["Staff Name & Date", form.staffNameAndDate || "—"],
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Daily Gate Report</h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                {submitted ? "Report ready — download your PDF below." : "Fill in today's gate figures."}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Enter daily gate report details</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-5 py-4">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-5 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <CheckCircle2 className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="font-semibold text-blue-800">Report Submitted</p>
                <p className="text-sm text-blue-700 mt-0.5">
                  {form.location} · {form.date ? format(new Date(form.date + "T00:00:00"), "dd MMM yyyy") : ""}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
              {previewRows.map(([label, value]) => (
                <div key={label} className="flex items-start px-4 py-2.5 gap-3">
                  <span className="w-52 text-xs font-medium text-slate-500 uppercase tracking-wide shrink-0 pt-0.5">{label}</span>
                  <span className="font-medium text-slate-800">{value}</span>
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
                  onChange={e => set("location")(e.target.value)}
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
                  onChange={e => set("pfi")(e.target.value)}
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
              <Input type="date" value={form.date} onChange={e => set("date")(e.target.value)} />
            </div>

            <div className="h-px bg-slate-100" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gate Figures</p>

            {/* Truck counts */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  No. of Yesterday Carried Over Loading
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 2"
                  value={form.carriedOverYesterday}
                  onChange={e => set("carriedOverYesterday")(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  No. of Trucks Sold/Exited Today
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  value={form.trucksExitedToday}
                  onChange={e => set("trucksExitedToday")(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  No. of Trucks Loading Left Over Today
                </Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 1"
                  value={form.trucksLeftOverToday}
                  onChange={e => set("trucksLeftOverToday")(e.target.value)}
                />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Staff name — auto-filled */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Staff Name &amp; Date</Label>
              <Input
                value={form.staffNameAndDate}
                readOnly
                className="bg-slate-50 text-slate-600 cursor-default"
              />
              <p className="text-xs text-slate-400">Auto-filled from your login session.</p>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Remarks</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Any additional notes or observations…"
                value={form.remarks}
                onChange={e => set("remarks")(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose}>
            {submitted ? "Close" : "Cancel"}
          </Button>
          {submitted ? (
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => generateGateReportPDF(form)}
            >
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
}

// ═══════════════════════════════════════════════════════════════════════════

const fmt = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
};

const ALL = "__all__";

type Period = "today" | "yesterday" | "week" | "month" | "year" | "all" | "custom";
type CustomMode = "day" | "range";

const PERIOD_OPTIONS: [Period, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["year", "This Year"],
  ["all", "All Time"],
  ["custom", "Custom"],
];

export default function SecurityReportPage() {
  const { toast } = useToast();
  const routeLocation = useLocation();
  const todayKey = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const autoOpenReport = new URLSearchParams(routeLocation.search).get("report") === "true";

  const [period, setPeriod] = useState<Period>("today");
  const [customMode, setCustomMode] = useState<CustomMode>("day");
  const [customDay, setCustomDay] = useState(todayKey);
  const [customFrom, setCustomFrom] = useState(todayKey);
  const [customTo, setCustomTo] = useState(todayKey);
  const [pfiId, setPfiId] = useState<string>(ALL);
  const [locationId, setLocationId] = useState<string>(ALL);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);
  const [gateReportOpen, setGateReportOpen] = useState(autoOpenReport);

  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date();
    switch (period) {
      case "today":
        return { dateFrom: todayKey, dateTo: todayKey };
      case "yesterday": {
        const y = format(subDays(today, 1), "yyyy-MM-dd");
        return { dateFrom: y, dateTo: y };
      }
      case "week":
        return { dateFrom: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), dateTo: todayKey };
      case "month":
        return { dateFrom: format(startOfMonth(today), "yyyy-MM-dd"), dateTo: todayKey };
      case "year":
        return { dateFrom: format(startOfYear(today), "yyyy-MM-dd"), dateTo: todayKey };
      case "all":
        return { dateFrom: "", dateTo: "" };
      case "custom":
        return customMode === "day"
          ? { dateFrom: customDay, dateTo: customDay }
          : { dateFrom: customFrom, dateTo: customTo };
    }
  }, [period, customMode, customDay, customFrom, customTo, todayKey]);

  const effectivePfiId = pfiId === ALL ? "" : pfiId;
  const effectiveLocationId = locationId === ALL ? "" : locationId;
  const filterParams = { date_from: dateFrom, date_to: dateTo, pfi: effectivePfiId, location: effectiveLocationId };

  const filterOptionsQuery = useQuery({
    queryKey: ["security-filter-options"],
    queryFn: () => apiClient.admin.getSecurityFilterOptions(),
    staleTime: 60_000,
  });
  const pfiOptions = filterOptionsQuery.data?.pfis ?? [];
  const locationOptions = filterOptionsQuery.data?.locations ?? [];

  const detailQuery = useQuery({
    queryKey: ["security-exits-detail", dateFrom, dateTo, effectivePfiId, effectiveLocationId],
    queryFn: () => apiClient.admin.getSecurityExitsDetail(filterParams),
    staleTime: 15_000,
  });
  const detailRows = detailQuery.data?.results ?? [];

  const summaryQuery = useQuery({
    queryKey: ["security-exits-summary", dateFrom, dateTo, effectivePfiId, effectiveLocationId],
    queryFn: () => apiClient.admin.getSecurityExitsSummary(filterParams),
    staleTime: 15_000,
  });
  const summary = summaryQuery.data;

  const dateRangeLabel = useMemo(() => {
    if (!summary) return "—";
    const fmtDate = (d: string) => format(new Date(`${d}T00:00:00`), "dd MMM yyyy");
    if (summary.date_from && summary.date_to && summary.date_from === summary.date_to) {
      return fmtDate(summary.date_from);
    }
    return `${summary.date_from ? fmtDate(summary.date_from) : "—"} – ${summary.date_to ? fmtDate(summary.date_to) : "—"}`;
  }, [summary]);

  const summaryPairs = summary
    ? [
        ["Date", dateRangeLabel],
        ["Total Trucks for the Day", fmt(summary.total_trucks)],
        ["Cumulative Trucks Out", fmt(summary.cumulative_trucks)],
        ["Total Quantity for the Day", `${fmt(summary.quantity_litres)} Litres`],
        ["Cumulative Quantity", `${fmt(summary.cumulative_quantity_litres)} Litres`],
      ]
    : [];

  async function handleDownload(kind: "excel" | "pdf") {
    setDownloading(kind);
    try {
      if (kind === "excel") await apiClient.admin.downloadSecurityReportExcel(filterParams);
      else await apiClient.admin.downloadSecurityReportPdf(filterParams);
    } catch (e: unknown) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  }

  const isLoading = detailQuery.isLoading || summaryQuery.isLoading;
  const isError = detailQuery.isError || summaryQuery.isError;
  const noData = detailRows.length === 0;

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-6xl mx-auto space-y-5">
            <PageHeader
              title="Security Report"
              description="List of trucks cleared by security, with a summary for the selected period."
              actions={
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="gap-1.5 h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setGateReportOpen(true)}
                  >
                    <ClipboardList size={13} /> Enter Report
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 h-9 text-xs text-white hover:bg-green-500"
                    disabled={noData || !!downloading}
                    onClick={() => handleDownload("excel")}
                  >
                    {downloading === "excel"
                      ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                      : <><FileSpreadsheet size={13} /> Excel</>
                    }
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-9 text-xs"
                    disabled={noData || !!downloading}
                    onClick={() => handleDownload("pdf")}
                  >
                    {downloading === "pdf"
                      ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                      : <><FileText size={13} /> PDF</>
                    }
                  </Button>
                </div>
              }
            />

            {/* ── Filter bar ─────────────────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                  <SlidersHorizontal size={14} className="text-slate-600" />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">Filters</h3>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 w-16 shrink-0">Period</span>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 flex-wrap">
                    {PERIOD_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPeriod(key)}
                        className={cn(
                          "px-3.5 h-8 rounded-md text-xs font-semibold transition-all",
                          period === key
                            ? "bg-white shadow-sm text-blue-700 ring-1 ring-slate-200"
                            : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {period === "custom" && (
                    <>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                        {([
                          ["day", "Single Day"],
                          ["range", "Date Range"],
                        ] as [CustomMode, string][]).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setCustomMode(key)}
                            className={cn(
                              "px-3 h-7 rounded-md text-xs font-medium transition-all",
                              customMode === key
                                ? "bg-white shadow-sm text-blue-700 ring-1 ring-slate-200"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {customMode === "day" ? (
                        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white px-3 h-9 shadow-sm">
                          <CalendarDays size={14} className="text-slate-400" />
                          <input
                            aria-label="Select date"
                            type="date"
                            className="text-sm bg-transparent outline-none"
                            value={customDay}
                            max={todayKey}
                            onChange={(e) => setCustomDay(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white px-3 h-9 shadow-sm">
                          <CalendarDays size={14} className="text-slate-400" />
                          <input
                            aria-label="From date"
                            type="date"
                            className="text-sm bg-transparent outline-none"
                            value={customFrom}
                            max={customTo}
                            onChange={(e) => setCustomFrom(e.target.value)}
                          />
                          <span className="text-slate-300">–</span>
                          <input
                            aria-label="To date"
                            type="date"
                            className="text-sm bg-transparent outline-none"
                            value={customTo}
                            min={customFrom}
                            max={todayKey}
                            onChange={(e) => setCustomTo(e.target.value)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="h-px bg-slate-100" />

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 w-16 shrink-0">Scope</span>

                  <div className="flex items-center gap-1.5 min-w-[200px]">
                    <Fuel size={14} className="text-slate-400 shrink-0" />
                    <Select value={pfiId} onValueChange={setPfiId}>
                      <SelectTrigger className="h-9 shadow-sm" aria-label="Filter by PFI">
                        <SelectValue placeholder="All PFIs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All PFIs</SelectItem>
                        {pfiOptions.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.pfi_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-[200px]">
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger className="h-9 shadow-sm" aria-label="Filter by Location">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All Locations</SelectItem>
                        {locationOptions.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100">
                  <ListChecks size={14} className="text-indigo-600" />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">Truck Exits</h3>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200">
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">S/N</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Truck No</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order Ref</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Quantity</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Time of Exit</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Gantry</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Loader</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">
                          <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Loading…
                        </TableCell>
                      </TableRow>
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-red-600">
                          Failed to load report: {((detailQuery.error || summaryQuery.error) as Error)?.message || "Unknown error"}
                        </TableCell>
                      </TableRow>
                    ) : detailRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-12 text-center">
                          <TruckIcon className="mx-auto h-7 w-7 text-slate-200 mb-2" />
                          <p className="text-sm text-slate-400">No truck exits recorded for this period.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailRows.map((r, idx) => (
                        <TableRow key={`${r.order_id}-${r.truck_no}-${r.exit_time}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                          <TableCell className="text-sm text-slate-500">{idx + 1}</TableCell>
                          <TableCell className="text-sm text-slate-800">
                            {format(new Date(`${r.date}T00:00:00`), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{r.truck_no}</TableCell>
                          <TableCell className="text-sm font-mono font-semibold text-slate-700">{r.order_ref}</TableCell>
                          <TableCell className="text-sm text-right text-slate-700">{fmt(r.quantity_litres)} Litres</TableCell>
                          <TableCell className="text-sm text-slate-600">{format(new Date(r.exit_time), "HH:mm")}</TableCell>
                          <TableCell className="text-sm text-slate-600">{r.gantry ? `Arm ${r.gantry}` : "—"}</TableCell>
                          <TableCell className="text-sm text-slate-600">{r.loader_name || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>

                  {/* Vertical summary block — same table, below the truck list */}
                  {summary && !isLoading && !isError && (
                    <tfoot>
                      <TableRow className="border-t-2 border-slate-200 bg-blue-900">
                        <TableCell colSpan={8} className="py-2 text-center text-xs font-bold uppercase tracking-wide text-white">
                          Summary
                        </TableCell>
                      </TableRow>
                      {summaryPairs.map(([label, value]) => (
                        <TableRow key={label} className="bg-blue-50/60">
                          <TableCell colSpan={3} className="text-sm font-semibold text-slate-700">{label}</TableCell>
                          <TableCell colSpan={5} className="text-sm font-bold text-slate-900 text-right">{value}</TableCell>
                        </TableRow>
                      ))}
                    </tfoot>
                  )}
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DailyGateReportDialog
        open={gateReportOpen}
        onClose={() => setGateReportOpen(false)}
        locations={locationOptions.map(l => l.name)}
        pfis={pfiOptions.map(p => p.pfi_number)}
      />
    </div>
  );
}
