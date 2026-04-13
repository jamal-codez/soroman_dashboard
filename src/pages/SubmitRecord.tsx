import { useRef, useState, useMemo } from "react";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { MobileNav } from "@/components/MobileNav";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import {
  Upload,
  X,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  FileArchive,
  User,
  Plus,
  Trash2,
  Banknote,
  BarChart3,
  Ticket,
  Receipt,
  FileCheck,
  ClipboardPen,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Record types — icons instead of emojis
// ---------------------------------------------------------------------------

const RECORD_TYPES = [
  { value: "payment_record",   label: "Payment Record",     desc: "PMS / AGO / DPK payment with rate, litres, ticket & buyer", icon: Banknote },
  { value: "daily_sales",      label: "Daily Sales Report", desc: "End-of-day volume sold, amount, ticket count",              icon: BarChart3 },
  { value: "ticket_inventory", label: "Ticket Inventory",   desc: "Tickets on hand by litre size (40k, 45k, 50k, 60k)",       icon: Ticket },
  { value: "expense_request",  label: "Expense Request",    desc: "Request money for fuel, repairs, supplies, etc.",            icon: Receipt },
  { value: "receipt",          label: "Receipt / Proof",    desc: "Upload proof of payment or purchase receipt",                icon: FileCheck },
  { value: "report",           label: "General Report",     desc: "Any other report or note for management",                   icon: ClipboardPen },
] as const;

export type RecordType = (typeof RECORD_TYPES)[number]["value"];

// ---------------------------------------------------------------------------
// Shared types & storage (used by Records.tsx)
// ---------------------------------------------------------------------------

export type RecordEntry = {
  id: string;
  type: RecordType | string;
  title: string;
  description: string;
  amount: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_data: string;
  submitted_by: string;
  submitted_by_role: string;
  status: "pending" | "approved" | "declined";
  status_note: string;
  status_changed_by: string;
  status_changed_at: string;
  created_at: string;
  extra?: Record<string, unknown>;
};

export const RECORDS_LS_KEY = "soroman_records";

export const loadRecords = (): RecordEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_LS_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveRecords = (records: RecordEntry[]) => {
  localStorage.setItem(RECORDS_LS_KEY, JSON.stringify(records));
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  "0": "Super Admin", "1": "Admin", "2": "Accounts",
  "3": "Marketing", "4": "Ticketing", "5": "Security", "6": "Transport",
};

const PRODUCTS = ["PMS", "AGO", "DPK"] as const;

// Ticket sizes in litres (not naira)
const TICKET_SIZES = [
  { key: "40k", label: "40,000 Litres" },
  { key: "45k", label: "45,000 Litres" },
  { key: "50k", label: "50,000 Litres" },
  { key: "60k", label: "60,000 Litres" },
] as const;

interface DepotState { id: number; name: string; classifier?: string }

interface PfiOption {
  id: number;
  pfi_number: string;
  status: string;
  product_name?: string;
  location_name?: string;
}

const generateId = () =>
  `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string, size = 20) => {
  if (type.includes("pdf")) return <FileText className="text-red-500" size={size} />;
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return <FileSpreadsheet className="text-green-600" size={size} />;
  if (type.includes("image")) return <FileImage className="text-blue-500" size={size} />;
  if (type.includes("zip") || type.includes("rar")) return <FileArchive className="text-amber-600" size={size} />;
  if (type.includes("word") || type.includes("document")) return <FileText className="text-blue-600" size={size} />;
  return <FileIcon className="text-slate-500" size={size} />;
};

const readFileAsBase64 = (file: globalThis.File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ---------------------------------------------------------------------------
// Sub-form data shapes
// ---------------------------------------------------------------------------

type PaymentLine = { product: string; rate: string; litres: string; ticketNo: string; buyer: string };
const emptyPaymentLine = (): PaymentLine => ({ product: "PMS", rate: "", litres: "", ticketNo: "", buyer: "" });

type DailySalesData = {
  product: string; openingVolume: string; closingVolume: string;
  volumeSold: string; amountCollected: string;
  ticketsCollected: string; ticketsRemaining: string; notes: string;
};
const emptyDailySales = (): DailySalesData => ({
  product: "PMS", openingVolume: "", closingVolume: "",
  volumeSold: "", amountCollected: "",
  ticketsCollected: "", ticketsRemaining: "", notes: "",
});

type TicketRow = { size: string; label: string; quantity: string };
const defaultTicketRows = (): TicketRow[] =>
  TICKET_SIZES.map((s) => ({ size: s.key, label: s.label, quantity: "" }));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubmitRecord() {
  const { toast } = useToast();
  const currentUser = localStorage.getItem("fullname") || "Unknown";
  const currentRole = localStorage.getItem("role") || "";

  // -- Depots from API --
  const { data: statesRaw } = useQuery<DepotState[]>({
    queryKey: ["states"],
    queryFn: async () => {
      const res = await apiClient.admin.getStates();
      return ((res as { results?: DepotState[] })?.results ?? res) as DepotState[];
    },
    staleTime: 5 * 60_000,
  });
  const depots = useMemo(
    () => (statesRaw || []).filter((s) => s.classifier?.toLowerCase() === "depot"),
    [statesRaw]
  );

  // -- PFIs from API (active + completed) --
  const { data: pfisRaw } = useQuery<PfiOption[]>({
    queryKey: ["pfis-for-records"],
    queryFn: async () => {
      const [activeRes, finishedRes] = await Promise.all([
        apiClient.admin.getPfis({ status: "active", page_size: 200 }),
        apiClient.admin.getPfis({ status: "finished", page_size: 200 }),
      ]);
      const extract = (res: unknown): PfiOption[] => {
        if (Array.isArray(res)) return res;
        if (res && typeof res === "object" && "results" in res)
          return (res as { results: PfiOption[] }).results ?? [];
        return [];
      };
      return [...extract(activeRes), ...extract(finishedRes)];
    },
    staleTime: 5 * 60_000,
  });
  const pfiOptions = useMemo(() => pfisRaw ?? [], [pfisRaw]);

  // -- shared state --
  const [selectedType, setSelectedType] = useState<RecordType>("payment_record");
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- shared PFI reference (all record types) --
  const [selectedPfiId, setSelectedPfiId] = useState("");

  // -- payment_record --
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([emptyPaymentLine()]);

  // -- daily_sales --
  const [dailySales, setDailySales] = useState<DailySalesData>(emptyDailySales());
  const [salesDepot, setSalesDepot] = useState("");

  // -- ticket_inventory --
  const [ticketRows, setTicketRows] = useState<TicketRow[]>(defaultTicketRows());
  const [ticketDepot, setTicketDepot] = useState("");

  // -- expense_request --
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseReason, setExpenseReason] = useState("");

  // -- receipt --
  const [receiptTitle, setReceiptTitle] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptVendor, setReceiptVendor] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");

  // -- report --
  const [reportTitle, setReportTitle] = useState("");
  const [reportBody, setReportBody] = useState("");

  // -----------------------------------------------------------------------
  // Resolve selected PFI for any record type
  // -----------------------------------------------------------------------
  const resolvedPfi = useMemo(() => {
    if (!selectedPfiId) return null;
    return pfiOptions.find((p) => String(p.id) === selectedPfiId) ?? null;
  }, [selectedPfiId, pfiOptions]);
  const pfiLabel = resolvedPfi?.pfi_number ?? "";
  const pfiExtra = resolvedPfi
    ? { pfi_id: resolvedPfi.id, pfi_number: resolvedPfi.pfi_number }
    : { pfi_id: null, pfi_number: null };

  // -----------------------------------------------------------------------
  // buildRecord
  // -----------------------------------------------------------------------
  const buildRecord = (): {
    title: string; description: string; amount: string;
    extra: Record<string, unknown>; fileRequired: boolean;
    valid: boolean; error?: string;
  } => {
    switch (selectedType) {
      case "payment_record": {
        const filled = paymentLines.filter((l) => l.rate && l.litres && l.buyer);
        if (filled.length === 0)
          return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Fill at least one payment line (rate, litres, buyer)." };
        const totalAmt = filled.reduce((s, l) => s + (parseFloat(l.rate) || 0) * (parseFloat(l.litres) || 0), 0);
        const desc = [
          pfiLabel && `PFI: ${pfiLabel}`,
          ...filled.map((l) => `${l.product}: ${l.rate}/ltr x ${l.litres}ltr - Ticket ${l.ticketNo || "N/A"} - ${l.buyer}`),
        ].filter(Boolean).join("\n");
        return {
          title: `Payment Record - ${filled.map((l) => l.product).join(", ")}${pfiLabel ? ` (${pfiLabel})` : ""}`,
          description: desc, amount: totalAmt.toFixed(2),
          extra: { lines: filled, ...pfiExtra },
          fileRequired: false, valid: true,
        };
      }
      case "daily_sales": {
        const d = dailySales;
        if (!d.volumeSold && !d.amountCollected)
          return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Enter at least Volume Sold or Amount Collected." };
        const desc = [
          pfiLabel && `PFI: ${pfiLabel}`,
          salesDepot && `Depot: ${salesDepot}`,
          `Product: ${d.product}`,
          d.openingVolume && `Opening Volume: ${d.openingVolume} ltr`,
          d.closingVolume && `Closing Volume: ${d.closingVolume} ltr`,
          d.volumeSold && `Volume Sold: ${d.volumeSold} ltr`,
          d.amountCollected && `Amount Collected: ${d.amountCollected}`,
          d.ticketsCollected && `Tickets Collected: ${d.ticketsCollected}`,
          d.ticketsRemaining && `Tickets Remaining: ${d.ticketsRemaining}`,
          d.notes && `Notes: ${d.notes}`,
        ].filter(Boolean).join("\n");
        return {
          title: `Daily Sales - ${d.product}${salesDepot ? ` (${salesDepot})` : ""}`,
          description: desc, amount: d.amountCollected || "",
          extra: { ...d, depot: salesDepot, ...pfiExtra }, fileRequired: false, valid: true,
        };
      }
      case "ticket_inventory": {
        const filled = ticketRows.filter((r) => r.quantity);
        if (filled.length === 0)
          return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Enter quantity for at least one ticket size." };
        const desc = [
          pfiLabel && `PFI: ${pfiLabel}`,
          ticketDepot && `Depot: ${ticketDepot}`,
          ...filled.map((r) => `${r.label}: ${r.quantity} tickets`),
        ].filter(Boolean).join("\n");
        return {
          title: `Ticket Inventory${ticketDepot ? ` - ${ticketDepot}` : ""}`,
          description: desc,
          amount: "", extra: { depot: ticketDepot, rows: filled.map((r) => ({ size: r.size, label: r.label, quantity: r.quantity })), ...pfiExtra },
          fileRequired: false, valid: true,
        };
      }
      case "expense_request": {
        if (!expenseTitle.trim())
          return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Enter what the expense is for." };
        const expDesc = [pfiLabel && `PFI: ${pfiLabel}`, expenseReason].filter(Boolean).join("\n");
        return {
          title: `Expense - ${expenseTitle.trim()}`, description: expDesc,
          amount: expenseAmount, extra: { itemTitle: expenseTitle, reason: expenseReason, ...pfiExtra },
          fileRequired: false, valid: true,
        };
      }
      case "receipt": {
        if (!receiptTitle.trim())
          return { title: "", description: "", amount: "", extra: {}, fileRequired: true, valid: false, error: "Enter what the receipt is for." };
        if (!file)
          return { title: "", description: "", amount: "", extra: {}, fileRequired: true, valid: false, error: "Please attach the receipt photo or PDF." };
        const desc = [
          pfiLabel && `PFI: ${pfiLabel}`,
          receiptVendor && `Vendor: ${receiptVendor}`,
          receiptAmount && `Amount: ${receiptAmount}`,
          receiptNotes && `Notes: ${receiptNotes}`,
        ].filter(Boolean).join("\n");
        return {
          title: `Receipt - ${receiptTitle.trim()}`, description: desc,
          amount: receiptAmount, extra: { vendor: receiptVendor, notes: receiptNotes, ...pfiExtra },
          fileRequired: true, valid: true,
        };
      }
      case "report": {
        if (!reportTitle.trim())
          return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Give your report a title." };
        const rptDesc = [pfiLabel && `PFI: ${pfiLabel}`, reportBody].filter(Boolean).join("\n");
        return { title: reportTitle.trim(), description: rptDesc, amount: "", extra: { ...pfiExtra }, fileRequired: false, valid: true };
      }
      default:
        return { title: "", description: "", amount: "", extra: {}, fileRequired: false, valid: false, error: "Unknown type" };
    }
  };

  // -----------------------------------------------------------------------
  const resetAll = () => {
    setSelectedType("payment_record");
    setFile(null); setSubmitted(false); setSelectedPfiId("");
    setPaymentLines([emptyPaymentLine()]);
    setDailySales(emptyDailySales()); setSalesDepot("");
    setTicketRows(defaultTicketRows()); setTicketDepot("");
    setExpenseTitle(""); setExpenseAmount(""); setExpenseReason("");
    setReceiptTitle(""); setReceiptAmount(""); setReceiptVendor(""); setReceiptNotes("");
    setReportTitle(""); setReportBody("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // -----------------------------------------------------------------------
  const handleSubmit = async () => {
    const built = buildRecord();
    if (!built.valid) {
      toast({ title: built.error || "Please fill required fields", variant: "destructive" });
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 10 MB allowed.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Send record to the backend API
      await apiClient.admin.createRecord({
        category: selectedType,
        title: built.title,
        description: built.description || "",
        amount: built.amount || undefined,
        extra: built.extra,
        pfi_id: built.extra?.pfi_id as number | undefined,
        pfi_number: built.extra?.pfi_number as string | undefined,
        file: file || undefined,
      });

      setSubmitted(true);
      toast({ title: "Record submitted!", description: "Your submission has been recorded." });
    } catch (err) {
      toast({ title: "Submission failed", description: String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Sub-form state helpers
  // -----------------------------------------------------------------------
  const updatePaymentLine = (idx: number, field: keyof PaymentLine, value: string) => {
    setPaymentLines((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };
  const addPaymentLine = () => setPaymentLines((prev) => [...prev, emptyPaymentLine()]);
  const removePaymentLine = (idx: number) => setPaymentLines((prev) => prev.filter((_, i) => i !== idx));
  const updateDailySales = (field: keyof DailySalesData, value: string) => setDailySales((prev) => ({ ...prev, [field]: value }));
  const updateTicketRow = (idx: number, qty: string) => setTicketRows((prev) => { const next = [...prev]; next[idx] = { ...next[idx], quantity: qty }; return next; });

  const built = buildRecord();

  // -----------------------------------------------------------------------
  // Shared depot dropdown
  // -----------------------------------------------------------------------
  const depotDropdown = (value: string, onChange: (v: string) => void, label = "Depot") => (
    <div className="space-y-1">
      <Label className="text-xs text-slate-600">{label}</Label>
      <select
        title={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Select depot</option>
        {depots.map((d) => (
          <option key={d.id} value={d.name}>{d.name}</option>
        ))}
      </select>
    </div>
  );

  // -----------------------------------------------------------------------
  // Shared PFI dropdown
  // -----------------------------------------------------------------------
  const pfiDropdown = (value: string, onChange: (v: string) => void) => {
    const active = pfiOptions.filter((p) => p.status === "active");
    const finished = pfiOptions.filter((p) => p.status !== "active");
    return (
      <div className="space-y-1">
        <Label className="text-xs text-slate-600">PFI Reference</Label>
        <select
          title="PFI Reference"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Select PFI (optional)</option>
          {active.length > 0 && (
            <optgroup label="Active PFIs">
              {active.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.pfi_number}{p.product_name ? ` \u2014 ${p.product_name}` : ""}{p.location_name ? ` (${p.location_name})` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {finished.length > 0 && (
            <optgroup label="Completed PFIs">
              {finished.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.pfi_number}{p.product_name ? ` \u2014 ${p.product_name}` : ""}{p.location_name ? ` (${p.location_name})` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Shared file picker UI
  // -----------------------------------------------------------------------
  const filePickerUI = (required: boolean) => (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-slate-800">
        Attach File{" "}
        {required ? <span className="text-red-500">*</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}
      </Label>
      <p className="text-xs text-slate-400">Photo, PDF, Excel, Word — max 10 MB</p>
      <div
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" title="Select a file" className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            {getFileIcon(file.type, 24)}
            <div className="text-left">
              <p className="text-sm font-medium text-slate-700 truncate max-w-[220px]">{file.name}</p>
              <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-1"
              onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              <X size={15} />
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Upload size={28} className="mx-auto text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Tap here to pick a file</p>
            <p className="text-xs text-slate-400">or take a photo</p>
          </div>
        )}
      </div>
    </div>
  );

  // =======================================================================
  // Sub-form renderer
  // =======================================================================
  const renderSubForm = () => {
    switch (selectedType) {
      // -- Payment Record --
      case "payment_record":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Enter each payment line — product, rate, litres, ticket number and buyer. You can add multiple lines.</p>

            {/* PFI Reference */}
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}

            {paymentLines.map((line, idx) => (
              <div key={idx} className="relative rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                {paymentLines.length > 1 && (
                  <button type="button" className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                    onClick={() => removePaymentLine(idx)} title="Remove line"><Trash2 size={16} /></button>
                )}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Line {idx + 1}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Product</Label>
                    <select title="Product" value={line.product}
                      onChange={(e) => updatePaymentLine(idx, "product", e.target.value)}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                      {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Rate (per litre)</Label>
                    <Input placeholder="e.g. 617" value={line.rate}
                      onChange={(e) => updatePaymentLine(idx, "rate", e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal" className="h-10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Litres</Label>
                    <Input placeholder="e.g. 40000" value={line.litres}
                      onChange={(e) => updatePaymentLine(idx, "litres", e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal" className="h-10" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Ticket No.</Label>
                    <Input placeholder="e.g. 00234" value={line.ticketNo}
                      onChange={(e) => updatePaymentLine(idx, "ticketNo", e.target.value)} className="h-10" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Buyer Name</Label>
                  <Input placeholder="e.g. John Okafor" value={line.buyer}
                    onChange={(e) => updatePaymentLine(idx, "buyer", e.target.value)} className="h-10" />
                </div>
                {line.rate && line.litres && (
                  <p className="text-xs text-right text-emerald-600 font-medium">
                    Line total: {((parseFloat(line.rate) || 0) * (parseFloat(line.litres) || 0)).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addPaymentLine}>
              <Plus size={15} /> Add Another Line
            </Button>
            {filePickerUI(false)}
          </div>
        );

      // -- Daily Sales --
      case "daily_sales":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Fill in the day's sales numbers — same info you send on WhatsApp.</p>
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}
            <div className="grid grid-cols-2 gap-3">
              {depotDropdown(salesDepot, setSalesDepot)}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Product</Label>
                <select title="Product" value={dailySales.product}
                  onChange={(e) => updateDailySales("product", e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Opening Volume (ltr)</Label>
                <Input placeholder="e.g. 50000" value={dailySales.openingVolume}
                  onChange={(e) => updateDailySales("openingVolume", e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Closing Volume (ltr)</Label>
                <Input placeholder="e.g. 42000" value={dailySales.closingVolume}
                  onChange={(e) => updateDailySales("closingVolume", e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Volume Sold (ltr)</Label>
                <Input placeholder="e.g. 8000" value={dailySales.volumeSold}
                  onChange={(e) => updateDailySales("volumeSold", e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Amount Collected</Label>
                <Input placeholder="e.g. 4936000" value={dailySales.amountCollected}
                  onChange={(e) => updateDailySales("amountCollected", e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Tickets Collected</Label>
                <Input placeholder="e.g. 12" value={dailySales.ticketsCollected}
                  onChange={(e) => updateDailySales("ticketsCollected", e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" className="h-10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Tickets Remaining</Label>
                <Input placeholder="e.g. 38" value={dailySales.ticketsRemaining}
                  onChange={(e) => updateDailySales("ticketsRemaining", e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" className="h-10" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <textarea placeholder="e.g. Pump 2 was down from 3pm..." value={dailySales.notes}
                onChange={(e) => updateDailySales("notes", e.target.value)} rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            {filePickerUI(false)}
          </div>
        );

      // -- Ticket Inventory --
      case "ticket_inventory":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">How many tickets do you have on hand? Fill in the count for each size.</p>
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}
            {depotDropdown(ticketDepot, setTicketDepot)}
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Ticket Size (Litres)</th>
                    <th className="px-4 py-2.5">Quantity on Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketRows.map((row, idx) => (
                    <tr key={row.size} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{row.label}</td>
                      <td className="px-4 py-2">
                        <Input placeholder="0" value={row.quantity}
                          onChange={(e) => updateTicketRow(idx, e.target.value.replace(/[^0-9]/g, ""))}
                          inputMode="numeric" className="h-9 w-32" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filePickerUI(false)}
          </div>
        );

      // -- Expense Request --
      case "expense_request":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">What do you need money for? Be specific so approval is faster.</p>
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">What is it for? <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Diesel for generator, Buy brake pads for truck" value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{"\u20A6"}</span>
                <Input placeholder="0.00" value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal" className="h-10 pl-8" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Why / Extra Details <span className="text-slate-400 font-normal">(optional)</span></Label>
              <textarea placeholder="Explain so management can approve quickly..." value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)} rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            {filePickerUI(false)}
          </div>
        );

      // -- Receipt / Proof --
      case "receipt":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Upload a receipt or proof of payment. A photo or scan is required.</p>
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">What is it for? <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Truck tyre purchase, Fuel top-up" value={receiptTitle}
                onChange={(e) => setReceiptTitle(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{"\u20A6"}</span>
                  <Input placeholder="0.00" value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                    inputMode="decimal" className="h-10 pl-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Vendor / Seller</Label>
                <Input placeholder="e.g. Dangote Cement" value={receiptVendor}
                  onChange={(e) => setReceiptVendor(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <textarea placeholder="Any extra info..." value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)} rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            {filePickerUI(true)}
          </div>
        );

      // -- General Report --
      case "report":
        return (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Write a report or note for management. This can be anything — incident, status update, observation.</p>
            {pfiDropdown(selectedPfiId, setSelectedPfiId)}
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Report Title <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Weekly operations report, Incident at Gate 3" value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Report Details</Label>
              <textarea placeholder="Write your report here..." value={reportBody}
                onChange={(e) => setReportBody(e.target.value)} rows={6}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            {filePickerUI(false)}
          </div>
        );

      default:
        return null;
    }
  };

  // =======================================================================
  // JSX
  // =======================================================================
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader title="Submit a Record" description="Fill out the form below — just like you'd send it on WhatsApp." />

            {submitted ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Record Submitted!</h2>
                  <p className="text-sm text-slate-500 max-w-sm">Your record has been submitted and is waiting for review. Management will approve or respond.</p>
                  <Button variant="outline" onClick={resetAll} className="gap-1.5 mt-2">Submit Another Record</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
                {/* Left — Type selector with icons */}
                <Card className="h-fit">
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 pt-1 pb-2">What are you submitting?</p>
                    {RECORD_TYPES.map((rt) => {
                      const Icon = rt.icon;
                      return (
                        <button key={rt.value} type="button"
                          onClick={() => setSelectedType(rt.value as RecordType)}
                          className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors flex items-start gap-2.5 ${selectedType === rt.value ? "bg-primary/10 text-primary font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                          <Icon size={18} className={`mt-0.5 flex-shrink-0 ${selectedType === rt.value ? "text-primary" : "text-slate-400"}`} />
                          <div>
                            <span className="block">{rt.label}</span>
                            <span className="block text-[11px] text-slate-400 font-normal leading-snug mt-0.5">{rt.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Right — Dynamic sub-form */}
                <Card>
                  <CardContent className="p-4 sm:p-6 space-y-5">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      {(() => { const rt = RECORD_TYPES.find((r) => r.value === selectedType); if (!rt) return null; const Icon = rt.icon; return <><Icon size={20} className="text-primary" /> {rt.label}</>; })()}
                    </h3>

                    {renderSubForm()}

                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <User size={14} className="text-slate-400 flex-shrink-0" />
                      <span>Submitting as: <strong className="text-slate-700">{currentUser}</strong> ({ROLE_LABELS[currentRole] || "Staff"})</span>
                    </div>

                    <Button onClick={handleSubmit} disabled={submitting || !built.valid}
                      className="w-full h-12 text-base font-semibold gap-2" size="lg">
                      {submitting ? "Submitting..." : (<><Upload size={18} /> Submit Record</>)}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
