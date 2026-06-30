import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { MobileNav } from "@/components/MobileNav";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, FileSpreadsheet, FileText, Loader2, ListChecks, TruckIcon, Fuel, MapPin, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const todayKey = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const [period, setPeriod] = useState<Period>("today");
  const [customMode, setCustomMode] = useState<CustomMode>("day");
  const [customDay, setCustomDay] = useState(todayKey);
  const [customFrom, setCustomFrom] = useState(todayKey);
  const [customTo, setCustomTo] = useState(todayKey);
  const [pfiId, setPfiId] = useState<string>(ALL);
  const [locationId, setLocationId] = useState<string>(ALL);
  const [downloading, setDownloading] = useState<"excel" | "pdf" | null>(null);

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
    </div>
  );
}
