import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CommaInput } from '@/components/ui/comma-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Download, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown,
  DropletIcon, FileSearch2, Package, Banknote, Loader2, CheckCircle2, Pencil,
} from 'lucide-react';
import { apiClient, client } from '@/api/client';
import {
  downloadPfiReport, downloadAllPfisReport,
  type PfiReport, type PfiSummaryData, type AllPfisExpense,
} from '@/lib/pfiReportExcel';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type PfiStatus = 'active' | 'finished';

type BackendPfi = {
  id: number;
  pfi_number: string;
  status: PfiStatus;
  location?: string | number;
  product?: string | number;
  location_name?: string;
  product_name?: string;
  product_unit?: string;
  product_unit_label?: string;
  starting_qty_litres?: number;
  bl_qty_litres?: number | string | null;
  bl_qty_mt?: number | string | null;
  price_per_litre?: number | string | null;
  surplus_deficit_litres?: number | string | null;
  pfi_value?: number | string | null;
  total_expenses?: number | string | null;
  pending_expenses?: number | string | null;
  pending_expense_count?: number | null;
  total_cost?: number | string | null;
  landing_cost_per_litre?: number | string | null;
  revenue?: number | string | null;
  profit_loss?: number | string | null;
  notes?: string | null;
  description?: string | null;
  sold_qty_litres?: number;
  sold_qty?: number;
  created_at?: string;
  createdAt?: string;
  finished_at?: string | null;
  finishedAt?: string | null;
  orders_count?: number;
  total_quantity_litres?: number | string;
  total_amount?: number | string;
  totalAmount?: number | string;
  amount?: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  allowed_locations?: number[];
  allowed_location_names?: string[];
  delivery_allocated_qty?: number | string;
  // New PFI opening fields
  pfi_date?: string | null;
  qty_volume_mt?: number | string | null;
  audit_officer?: number | null;
  audit_officer_name?: string | null;
  product_officer?: number | null;
  product_officer_name?: string | null;
  it_compliance_officer?: number | null;
  it_compliance_officer_name?: string | null;
  security_exit_officer?: number | null;
  security_exit_officer_name?: string | null;
  commission_officer?: number | null;
  commission_officer_name?: string | null;
  sales_manager?: number | null;
  sales_manager_name?: string | null;
  // Closure data
  closure_date?: string | null;
  total_inflow?: number | string | null;
  closure_bank?: string | null;
  purchase_cost?: number | string | null;
  aggregate_expenses?: number | string | null;
  closure_handler?: string | null;
  closure_remarks?: string | null;
  vessel_broker?: string | null;
  vessel_name?: string | null;
  surveyor_name?: string | null;
  surveyor_phone?: string | null;
  // Legacy staff fields (kept for backward compat)
  marketing_person?: number | null;
  marketing_person_name?: string | null;
  finance_person?: number | null;
  finance_person_name?: string | null;
};

type BackendProduct = { id: number; name: string; unit?: string };

const UNIT_LABELS: Record<string, string> = { litres: 'Litres', kg: 'kg', ton: 'ton' };
const getUnitLabel = (unit?: string): string => UNIT_LABELS[(unit || 'litres').toLowerCase()] || 'Litres';
type BackendLocation = { id: number; name?: string; state_name?: string; state?: string };

type SortKey =
  | 'pfi_number' | 'product' | 'location' | 'starting' | 'sold'
  | 'remaining' | 'pct' | 'orders' | 'amount' | 'status' | 'created';
type SortDir = 'asc' | 'desc';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const coerceNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtCurrency = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const coerceSoldLitres = (p: BackendPfi): number => {
  const fromOrders = p.total_quantity_litres;
  const n = Number(String(fromOrders ?? '').replace(/,/g, ''));
  if (Number.isFinite(n) && n >= 0) return n;
  return coerceNumber(p.sold_qty_litres ?? p.sold_qty);
};

const coerceAmount = (p: BackendPfi, soldLitres: number): number => {
  const direct = p.total_amount ?? p.totalAmount ?? p.amount;
  const directNum = Number(String(direct ?? '').replace(/,/g, ''));
  if (Number.isFinite(directNum) && directNum >= 0) return directNum;
  const unit = p.unit_price ?? p.unitPrice;
  const unitNum = Number(String(unit ?? '').replace(/,/g, ''));
  if (Number.isFinite(unitNum) && unitNum > 0) return soldLitres * unitNum;
  return 0;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

type FinishConfirmState = { open: boolean; pfiId?: number };

const EMPTY_CREATE_FORM = {
  pfiDate: '',
  pfiNumber: '',
  description: '',
  location: '',
  product: '',
  startingQty: '',
  startingQtyMt: '',
  blQty: '',
  blQtyMt: '',
  pricePerLitre: '',
  auditOfficer: '',
  productOfficer: '',
  itComplianceOfficer: '',
  securityExitOfficer: '',
  commissionOfficer: '',
  salesManager: '',
  vesselBroker: '',
  vesselName: '',
  surveyorName: '',
  surveyorPhone: '',
};

const EMPTY_CLOSURE_FORM = {
  closureDate: '',
  totalInflow: '',
  bank: '',
  purchaseCost: '',
  aggregateExpenses: '',
  handler: '',
  remarks: '',
};

// ═══════════════════════════════════════════════════════════════════════════
// Reusable staff select
// ═══════════════════════════════════════════════════════════════════════════

function StaffSelect({
  id, label, value, onChange, options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: number; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</Label>
      <select
        id={id}
        aria-label={label}
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Unassigned</option>
        {options.map(u => (
          <option key={u.id} value={u.id}>{u.label}</option>
        ))}
      </select>
    </div>
  );
}

// Wrapping <label> element for a single form field. Hoisted to module scope —
// defining this inside renderFormFields() gave it a new function identity on
// every keystroke, which made React remount the wrapped <Input> (and drop
// focus) after every character typed.
function Field({ label, required, children, error }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 cursor-text">
      <span className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function PFIPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | PfiStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('pfi_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Create dialog ──────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState<{
    conflict?: string;
    fields?: Record<string, string[]>;
    message?: string;
  }>({});
  const [creating, setCreating] = useState(false);

  // ── Finish confirm ─────────────────────────────────────────────────
  const [finishConfirm, setFinishConfirm] = useState<FinishConfirmState>({ open: false });
  const [finishing, setFinishing] = useState(false);

  // ── Closure form ───────────────────────────────────────────────────
  const [closureTarget, setClosureTarget] = useState<BackendPfi | null>(null);
  const [closureForm, setClosureForm] = useState(EMPTY_CLOSURE_FORM);
  const [closureSaving, setClosureSaving] = useState(false);

  // ── Detail view (click row) ────────────────────────────────────────
  const [viewTarget, setViewTarget] = useState<(typeof enriched)[number] | null>(null);

  // ── Expenses (within detail view) ──────────────────────────────────
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', date: new Date().toISOString().split('T')[0], vendor: '', bank: '' });
  const [addingExpense, setAddingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

  // ── Report downloads ───────────────────────────────────────────────
  const [exportingAll, setExportingAll] = useState(false);
  const [downloadingPfiId, setDownloadingPfiId] = useState<number | null>(null);

  // ── Edit PFI ──────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<BackendPfi | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_CREATE_FORM);
  const [editAllowedLocations, setEditAllowedLocations] = useState<Set<number>>(new Set());
  const [editSaving, setEditSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<{ fields?: Record<string, string[]>; message?: string }>({});

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const pfiQuery = useQuery<{ results?: BackendPfi[] } & Record<string, unknown>>({
    queryKey: ['pfis'],
    queryFn: async () => apiClient.admin.getPfis({ page: 1, page_size: 1000 }),
    staleTime: 30_000,
    retry: 1,
  });

  const ordersQuery = useQuery<{ results?: Array<{ pfi_number?: string | null; quantity?: number | string; status?: string }> }>({
    queryKey: ['all-orders'],
    queryFn: async () => apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 }),
    staleTime: 30_000,
    retry: 1,
  });

  const pfiSoldQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    const orders = ordersQuery.data?.results ?? [];
    const CONFIRMED = new Set(['paid', 'released', 'loaded', 'sold']);
    orders.forEach(o => {
      const pfiNum = String(o.pfi_number ?? '').trim();
      if (!pfiNum) return;
      const st = String(o.status ?? '').toLowerCase();
      if (!CONFIRMED.has(st)) return;
      const q = Number(String(o.quantity ?? '').replace(/,/g, ''));
      if (Number.isFinite(q) && q > 0) map.set(pfiNum, (map.get(pfiNum) ?? 0) + q);
    });
    return map;
  }, [ordersQuery.data]);

  const productsQuery = useQuery<{ results?: BackendProduct[] } & Record<string, unknown>>({
    queryKey: ['products'],
    queryFn: async () => apiClient.admin.getProducts({ page: 1, page_size: 500 }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const productOptions = useMemo(() => {
    const rec = isRecord(productsQuery.data) ? productsQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(productsQuery.data) ? productsQuery.data : []);
    return ((raw || []) as BackendProduct[])
      .filter(p => p && typeof p.id === 'number' && typeof p.name === 'string')
      .map(p => ({ id: p.id, label: p.name, unit: p.unit }));
  }, [productsQuery.data]);

  const selectedCreateProductUnitLabel = useMemo(() => {
    const selected = productOptions.find(p => String(p.id) === String(createForm.product));
    return getUnitLabel(selected?.unit);
  }, [productOptions, createForm.product]);

  const locationsQuery = useQuery<{ results?: BackendLocation[] } & Record<string, unknown>>({
    queryKey: ['locations'],
    queryFn: async () => apiClient.admin.getStates(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const locationOptions = useMemo(() => {
    const rec = isRecord(locationsQuery.data) ? locationsQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(locationsQuery.data) ? locationsQuery.data : []);
    return ((raw || []) as BackendLocation[])
      .filter(l => l && typeof l.id === 'number')
      .map(l => ({ id: l.id, label: String(l.name ?? l.state_name ?? l.state ?? `Location ${l.id}`) }));
  }, [locationsQuery.data]);

  const usersQuery = useQuery<{ results?: Array<{ id: number; full_name: string; role: number }> } & Record<string, unknown>>({
    queryKey: ['users-for-pfi'],
    queryFn: async () => apiClient.admin.getUsers(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const staffOptions = useMemo(() => {
    const rec = isRecord(usersQuery.data) ? usersQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(usersQuery.data) ? usersQuery.data : []);
    return ((raw || []) as Array<{ id: number; full_name: string; role: number }>)
      .filter(u => u && typeof u.id === 'number')
      .map(u => ({ id: u.id, label: u.full_name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [usersQuery.data]);

  const expensesQuery = useQuery({
    queryKey: ['pfi-expenses', viewTarget?.id],
    queryFn: async () => apiClient.admin.getPfiExpenses(viewTarget!.id),
    enabled: viewTarget != null,
    staleTime: 10_000,
  });
  const expenses = expensesQuery.data ?? [];

  // ═══════════════════════════════════════════════════════════════════
  // Derived data
  // ═══════════════════════════════════════════════════════════════════

  const pfis: BackendPfi[] = useMemo(() => {
    const rec = isRecord(pfiQuery.data) ? pfiQuery.data : null;
    const raw = (rec?.results as unknown) ?? (Array.isArray(pfiQuery.data) ? pfiQuery.data : []);
    return (raw || []) as BackendPfi[];
  }, [pfiQuery.data]);

  const enriched = useMemo(() => {
    return pfis.map(p => {
      const starting = coerceNumber(p.starting_qty_litres);
      const soldFromOrders = pfiSoldQtyMap.get(p.pfi_number);
      let sold = soldFromOrders !== undefined ? soldFromOrders : coerceSoldLitres(p);
      const deliveryAllocated = coerceNumber(p.delivery_allocated_qty);
      sold += deliveryAllocated;
      const remaining = Math.max(0, starting - sold);
      const pct = starting > 0 ? Math.min(100, (sold / starting) * 100) : 0;
      const totalAmount = coerceAmount(p, sold);
      const orders = coerceNumber(p.orders_count);
      const locationLabel = String(p.location_name ?? p.location ?? '');
      const productLabel = String(p.product_name ?? p.product ?? '');
      const unitLabel = p.product_unit_label || (p.product_unit ? p.product_unit : 'Litres');
      const createdAtStr = String(p.created_at ?? p.createdAt ?? '');
      const finishedAtStr = String(p.finished_at ?? p.finishedAt ?? '');

      // Cargo cost / profit tracking — hasCostData is false until BL qty +
      // price are both entered, so we can show "—" instead of a misleading 0.
      const hasCostData = p.pfi_value != null;
      const pfiValue = hasCostData ? coerceNumber(p.pfi_value) : 0;
      const totalExpenses = coerceNumber(p.total_expenses);
      // Submitted but not yet approved — deliberately outside total cost.
      const pendingExpenses = coerceNumber(p.pending_expenses);
      const pendingExpenseCount = coerceNumber(p.pending_expense_count);
      const totalCost = hasCostData ? coerceNumber(p.total_cost) : 0;
      const revenue = coerceNumber(p.revenue ?? totalAmount);
      const profitLoss = hasCostData ? coerceNumber(p.profit_loss) : 0;
      const surplusDeficit = p.surplus_deficit_litres != null ? coerceNumber(p.surplus_deficit_litres) : null;
      // All-in cost of each sellable litre: total cost spread over the TANK
      // quantity. Null (not 0) until the cargo is costed, so it reads "—".
      const landingPerLitre = p.landing_cost_per_litre != null ? coerceNumber(p.landing_cost_per_litre) : null;

      return {
        ...p, starting, sold, remaining, pct, totalAmount, orders,
        locationLabel, productLabel, unitLabel, createdAtStr, finishedAtStr,
        hasCostData, pfiValue, totalExpenses, totalCost, revenue, profitLoss, surplusDeficit,
        landingPerLitre, pendingExpenses, pendingExpenseCount,
      };
    });
  }, [pfis, pfiSoldQtyMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter(p => status === 'all' || p.status === status)
      .filter(p => {
        if (!q) return true;
        return (
          p.pfi_number.toLowerCase().includes(q) ||
          p.locationLabel.toLowerCase().includes(q) ||
          p.productLabel.toLowerCase().includes(q)
        );
      });
  }, [enriched, search, status]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      let cmp = 0;
      switch (sortKey) {
        case 'pfi_number': cmp = a.pfi_number.localeCompare(b.pfi_number, undefined, { numeric: true }); break;
        case 'product': cmp = a.productLabel.localeCompare(b.productLabel); break;
        case 'location': cmp = a.locationLabel.localeCompare(b.locationLabel); break;
        case 'starting': cmp = a.starting - b.starting; break;
        case 'sold': cmp = a.sold - b.sold; break;
        case 'remaining': cmp = a.remaining - b.remaining; break;
        case 'pct': cmp = a.pct - b.pct; break;
        case 'orders': cmp = a.orders - b.orders; break;
        case 'amount': cmp = a.totalAmount - b.totalAmount; break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'created': cmp = a.createdAtStr.localeCompare(b.createdAtStr); break;
      }
      return cmp * dir;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════

  const totals = useMemo(() => {
    let totalStarting = 0, totalSold = 0, totalRemaining = 0, totalAmount = 0;
    let activeCount = 0, finishedCount = 0, totalOrders = 0;
    enriched.forEach(p => {
      totalStarting += p.starting;
      totalSold += p.sold;
      totalRemaining += p.remaining;
      totalAmount += p.totalAmount;
      totalOrders += p.orders;
      if (p.status === 'active') activeCount++;
      else finishedCount++;
    });
    return { totalStarting, totalSold, totalRemaining, totalAmount, activeCount, finishedCount, totalOrders, total: enriched.length };
  }, [enriched]);

  const summaryCards = useMemo((): SummaryCard[] => [
    { title: 'Active PFIs', value: String(totals.activeCount), icon: <FileSearch2 size={20} />, tone: 'green' },
    { title: 'Completed PFIs', value: String(totals.finishedCount), icon: <CheckCircle2 size={20} />, tone: 'red' },
    { title: 'Total Quantity', value: `${fmtQty(totals.totalStarting)} L`, icon: <DropletIcon size={20} />, tone: 'neutral' },
    {
      title: 'Total Sold', value: `${fmtQty(totals.totalSold)} L`,
      description: totals.totalStarting > 0 ? `${((totals.totalSold / totals.totalStarting) * 100).toFixed(1)}% sold` : undefined,
      icon: <Package size={20} />, tone: 'green',
    },
    {
      title: 'Quantity Remaining', value: `${fmtQty(totals.totalRemaining)} L`,
      icon: <DropletIcon size={20} />, tone: totals.totalRemaining > 0 ? 'amber' : 'green',
    },
    { title: 'Total Revenue', value: fmtCurrency(totals.totalAmount), icon: <Banknote size={20} />, tone: 'green' },
  ], [totals]);

  // ═══════════════════════════════════════════════════════════════════
  // Sort toggle
  // ═══════════════════════════════════════════════════════════════════

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={13} className="text-slate-400" />;
    return sortDir === 'asc' ? <ArrowUp size={13} className="text-slate-700" /> : <ArrowDown size={13} className="text-slate-700" />;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Build API payload from a form object
  // ═══════════════════════════════════════════════════════════════════

  const buildPayload = (form: typeof EMPTY_CREATE_FORM) => ({
    pfi_date: form.pfiDate || undefined,
    description: form.description.trim() || undefined,
    qty_volume_mt: form.startingQtyMt ? Number(form.startingQtyMt.replace(/,/g, '')) || undefined : undefined,
    bl_qty_litres: form.blQty ? `${Number(form.blQty.replace(/,/g, '')).toFixed(2)}` : undefined,
    bl_qty_mt: form.blQtyMt ? `${Number(form.blQtyMt.replace(/,/g, '')).toFixed(2)}` : undefined,
    price_per_litre: form.pricePerLitre ? `${Number(form.pricePerLitre.replace(/,/g, '')).toFixed(2)}` : undefined,
    audit_officer: form.auditOfficer ? Number(form.auditOfficer) : null,
    product_officer: form.productOfficer ? Number(form.productOfficer) : null,
    it_compliance_officer: form.itComplianceOfficer ? Number(form.itComplianceOfficer) : null,
    security_exit_officer: form.securityExitOfficer ? Number(form.securityExitOfficer) : null,
    commission_officer: form.commissionOfficer ? Number(form.commissionOfficer) : null,
    sales_manager: form.salesManager ? Number(form.salesManager) : null,
    vessel_broker: form.vesselBroker.trim() || undefined,
    vessel_name: form.vesselName.trim() || undefined,
    surveyor_name: form.surveyorName.trim() || undefined,
    surveyor_phone: form.surveyorPhone.trim() || undefined,
  });

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const onCreate = useCallback(async () => {
    setCreateErrors({});
    const pfi_number = createForm.pfiNumber.trim();
    const location = Number(String(createForm.location).trim());
    const product = Number(String(createForm.product).trim());
    const starting_qty_litres = String(createForm.startingQty).replace(/,/g, '').trim();
    const startingAsNumber = Number(starting_qty_litres);

    if (!pfi_number || !Number.isFinite(location) || !Number.isFinite(product) || !Number.isFinite(startingAsNumber) || startingAsNumber <= 0) {
      toast({ title: 'Missing information', description: 'Provide PFI number, location, product, and valid starting quantity.', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      await apiClient.admin.createPfi({
        pfi_number,
        location,
        product,
        starting_qty_litres: `${startingAsNumber.toFixed(2)}`,
        notes: createForm.description.trim() || undefined,
        ...buildPayload(createForm),
      });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI created', description: `${pfi_number} created.` });
    } catch (e) {
      const err = e as Error;
      const message = err?.message || 'Request failed';
      if (message.includes('409') || /conflict/i.test(message)) {
        setCreateErrors({ conflict: 'Active PFI already exists for that location + product.' });
        return;
      }
      let parsedFields: Record<string, string[]> | undefined;
      const jsonStart = message.indexOf('{');
      if (jsonStart >= 0) {
        try {
          const body = JSON.parse(message.slice(jsonStart)) as unknown;
          if (isRecord(body)) {
            const fieldErrors: Record<string, string[]> = {};
            Object.entries(body).forEach(([k, v]) => {
              if (Array.isArray(v)) fieldErrors[k] = v.map(x => String(x));
              else if (typeof v === 'string') fieldErrors[k] = [v];
            });
            if (Object.keys(fieldErrors).length) parsedFields = fieldErrors;
          }
        } catch { /* ignore */ }
      }
      setCreateErrors({ fields: parsedFields, message: parsedFields ? undefined : message });
      toast({ title: 'Failed to create PFI', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [createForm, toast, queryClient]);

  const finishPfi = useCallback(async (id: number) => {
    setFinishing(true);
    try {
      await apiClient.admin.finishPfi(id);
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI finished', description: 'This PFI is now marked as finished.' });
    } catch (e) {
      toast({ title: 'Failed to finish PFI', description: (e as Error)?.message || 'Request failed', variant: 'destructive' });
    } finally {
      setFinishing(false);
    }
  }, [toast, queryClient]);

  const openEditPfi = (p: BackendPfi) => {
    setEditTarget(p);
    setEditErrors({});
    setEditForm({
      pfiDate: p.pfi_date ? String(p.pfi_date).split('T')[0] : '',
      pfiNumber: p.pfi_number,
      description: p.description ?? p.notes ?? '',
      location: String(p.location ?? ''),
      product: String(p.product ?? ''),
      startingQty: p.starting_qty_litres != null ? String(p.starting_qty_litres) : '',
      startingQtyMt: p.qty_volume_mt != null ? String(p.qty_volume_mt) : '',
      blQty: p.bl_qty_litres != null ? String(p.bl_qty_litres) : '',
      blQtyMt: p.bl_qty_mt != null ? String(p.bl_qty_mt) : '',
      pricePerLitre: p.price_per_litre != null ? String(p.price_per_litre) : '',
      auditOfficer: p.audit_officer != null ? String(p.audit_officer) : '',
      productOfficer: p.product_officer != null ? String(p.product_officer) : '',
      itComplianceOfficer: p.it_compliance_officer != null ? String(p.it_compliance_officer) : '',
      securityExitOfficer: p.security_exit_officer != null ? String(p.security_exit_officer) : '',
      commissionOfficer: p.commission_officer != null ? String(p.commission_officer) : '',
      salesManager: p.sales_manager != null ? String(p.sales_manager) : '',
      vesselBroker: p.vessel_broker ?? '',
      vesselName: p.vessel_name ?? '',
      surveyorName: p.surveyor_name ?? '',
      surveyorPhone: p.surveyor_phone ?? '',
    });
    setEditAllowedLocations(new Set(p.allowed_locations ?? []));
  };

  const saveEditPfi = useCallback(async () => {
    if (!editTarget) return;
    setEditErrors({});

    const pfi_number = editForm.pfiNumber.trim();
    const location = Number(editForm.location);
    const product = Number(editForm.product);
    const starting_qty_litres = String(editForm.startingQty).replace(/,/g, '').trim();
    const startingAsNumber = Number(starting_qty_litres);

    if (!pfi_number || !Number.isFinite(location) || !Number.isFinite(product) || !Number.isFinite(startingAsNumber) || startingAsNumber <= 0) {
      toast({ title: 'Missing information', description: 'Provide PFI number, location, product, and valid starting quantity.', variant: 'destructive' });
      return;
    }

    setEditSaving(true);
    try {
      await apiClient.admin.updatePfi(editTarget.id, {
        pfi_number,
        location,
        product,
        starting_qty_litres: `${startingAsNumber.toFixed(2)}`,
        notes: editForm.description.trim() || undefined,
        allowed_locations: Array.from(editAllowedLocations),
        ...buildPayload(editForm),
      });
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI updated', description: `${pfi_number} saved.` });
      setEditTarget(null);
    } catch (e) {
      const err = e as Error;
      const message = err?.message || 'Request failed';
      let parsedFields: Record<string, string[]> | undefined;
      const jsonStart = message.indexOf('{');
      if (jsonStart >= 0) {
        try {
          const body = JSON.parse(message.slice(jsonStart)) as unknown;
          if (isRecord(body)) {
            const fieldErrors: Record<string, string[]> = {};
            Object.entries(body).forEach(([k, v]) => {
              if (Array.isArray(v)) fieldErrors[k] = v.map(x => String(x));
            });
            if (Object.keys(fieldErrors).length) parsedFields = fieldErrors;
          }
        } catch { /* not JSON */ }
      }
      setEditErrors(parsedFields ? { fields: parsedFields } : { message });
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editForm, editAllowedLocations, queryClient, toast]);

  const openClosureForm = (p: BackendPfi) => {
    setClosureTarget(p);
    setClosureForm({
      closureDate: new Date().toISOString().split('T')[0],
      totalInflow: p.total_inflow != null ? String(p.total_inflow) : '',
      bank: p.closure_bank ?? '',
      purchaseCost: p.purchase_cost != null ? String(p.purchase_cost) : '',
      aggregateExpenses: p.aggregate_expenses != null ? String(p.aggregate_expenses) : '',
      handler: p.closure_handler ?? '',
      remarks: p.closure_remarks ?? '',
    });
  };

  const submitClosure = useCallback(async () => {
    if (!closureTarget) return;
    setClosureSaving(true);
    try {
      await apiClient.admin.updatePfi(closureTarget.id, {
        closure_date: closureForm.closureDate || undefined,
        total_inflow: closureForm.totalInflow ? Number(closureForm.totalInflow.replace(/,/g, '')) : undefined,
        closure_bank: closureForm.bank.trim() || undefined,
        purchase_cost: closureForm.purchaseCost ? Number(closureForm.purchaseCost.replace(/,/g, '')) : undefined,
        aggregate_expenses: closureForm.aggregateExpenses ? Number(closureForm.aggregateExpenses.replace(/,/g, '')) : undefined,
        closure_handler: closureForm.handler.trim() || undefined,
        closure_remarks: closureForm.remarks.trim() || undefined,
      });
      await apiClient.admin.finishPfi(closureTarget.id);
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'PFI closed', description: `${closureTarget.pfi_number} has been marked as finished.` });
      setClosureTarget(null);
      setViewTarget(null);
    } catch (e) {
      toast({ title: 'Failed to close PFI', description: (e as Error)?.message || 'Request failed', variant: 'destructive' });
    } finally {
      setClosureSaving(false);
    }
  }, [closureTarget, closureForm, queryClient, toast]);

  const addExpense = useCallback(async () => {
    if (!viewTarget) return;
    const description = expenseForm.description.trim();
    const amount = expenseForm.amount.replace(/,/g, '').trim();
    const amountNum = Number(amount);
    if (!description || !Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Missing information', description: 'Provide a description and a valid amount.', variant: 'destructive' });
      return;
    }
    setAddingExpense(true);
    try {
      await apiClient.admin.createPfiExpense(viewTarget.id, {
        description,
        amount: amountNum.toFixed(2),
        date: expenseForm.date || undefined,
        vendor: expenseForm.vendor.trim() || undefined,
        bank_paid_from: expenseForm.bank.trim() || undefined,
      });
      setExpenseForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0], vendor: '', bank: '' });
      await queryClient.invalidateQueries({ queryKey: ['pfi-expenses', viewTarget.id] });
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
      toast({ title: 'Expense added' });
    } catch (e) {
      toast({ title: 'Failed to add expense', description: (e as Error)?.message || 'Request failed', variant: 'destructive' });
    } finally {
      setAddingExpense(false);
    }
  }, [viewTarget, expenseForm, queryClient, toast]);

  const deleteExpense = useCallback(async (expenseId: number) => {
    if (!viewTarget) return;
    setDeletingExpenseId(expenseId);
    try {
      await apiClient.admin.deletePfiExpense(expenseId);
      await queryClient.invalidateQueries({ queryKey: ['pfi-expenses', viewTarget.id] });
      await queryClient.invalidateQueries({ queryKey: ['pfis'] });
    } catch (e) {
      toast({ title: 'Failed to delete expense', description: (e as Error)?.message || 'Request failed', variant: 'destructive' });
    } finally {
      setDeletingExpenseId(null);
    }
  }, [viewTarget, queryClient, toast]);

  const selectedFinishPfi = useMemo(
    () => enriched.find(p => p.id === finishConfirm.pfiId),
    [finishConfirm.pfiId, enriched],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Excel export
  // ═══════════════════════════════════════════════════════════════════

  /** Master workbook covering every PFI currently in view. */
  const exportAllPfis = useCallback(async () => {
    if (!sorted.length || exportingAll) return;
    setExportingAll(true);
    try {
      // Expenses come from the expenses API rather than per-PFI calls so the
      // whole workbook costs one extra request regardless of PFI count.
      let expenses: AllPfisExpense[] = [];
      try {
        const res = await client.get('/expenses/?page=1&page_size=1000');
        expenses = (res?.results ?? []) as AllPfisExpense[];
      } catch {
        // An expense-service hiccup shouldn't block the PFI figures; the sheet
        // simply reports none rather than failing the whole download.
        expenses = [];
      }

      const scope = [
        status === 'all' ? 'All statuses' : status === 'active' ? 'Active PFIs' : 'Finished PFIs',
        search.trim() ? `Search: "${search.trim()}"` : '',
      ].filter(Boolean).join(' · ');

      await downloadAllPfisReport(sorted as unknown as PfiSummaryData[], expenses, scope);
      toast({ title: 'Master report downloaded', description: `${sorted.length} PFI(s) exported.` });
    } catch (e) {
      toast({ title: 'Export failed', description: (e as Error)?.message || 'Could not build the workbook', variant: 'destructive' });
    } finally {
      setExportingAll(false);
    }
  }, [sorted, exportingAll, status, search, toast]);

  /** Full workbook for one PFI — summary, confirmed payments and expenses. */
  const exportSinglePfi = useCallback(async (pfiId: number, pfiNumber: string) => {
    if (downloadingPfiId !== null) return;
    setDownloadingPfiId(pfiId);
    try {
      const report = await client.get(`/pfis/${pfiId}/report/`);
      await downloadPfiReport(report as PfiReport);
      toast({ title: 'PFI report downloaded', description: pfiNumber });
    } catch (e) {
      toast({ title: 'Download failed', description: (e as Error)?.message || 'Could not build the report', variant: 'destructive' });
    } finally {
      setDownloadingPfiId(null);
    }
  }, [downloadingPfiId, toast]);

  // ═══════════════════════════════════════════════════════════════════
  // Shared form body (used in both create and edit dialogs)
  // ═══════════════════════════════════════════════════════════════════

  const renderFormFields = (
    form: typeof EMPTY_CREATE_FORM,
    setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_CREATE_FORM>>,
    errors: Record<string, string[]> | undefined,
  ) => {
    const sel = (field: keyof typeof EMPTY_CREATE_FORM) => (v: string) =>
      setForm(f => ({ ...f, [field]: v }));

    return (
      <div className="space-y-4 py-2">

        {/* Row 1: Date + PFI No */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date">
            <Input type="date" value={form.pfiDate} onChange={e => setForm(f => ({ ...f, pfiDate: e.target.value }))} />
          </Field>
          <Field label="PFI No" required error={errors?.pfi_number?.join(' ')}>
            <Input placeholder="e.g. PFI-50" value={form.pfiNumber} onChange={e => setForm(f => ({ ...f, pfiNumber: e.target.value }))} />
          </Field>
        </div>

        {/* Description */}
        <Field label="Description">
          <Input placeholder="e.g. AGO supply from Dangote refinery" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </Field>

        {/* Location + Product */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Location" required error={errors?.location?.join(' ')}>
            <select
              aria-label="Location"
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            >
              <option value="">Select location</option>
              {locationOptions.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Product" required error={errors?.product?.join(' ')}>
            <select
              aria-label="Product"
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.product}
              onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
            >
              <option value="">Select product</option>
              {productOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        {/* Qty Volume LTR + MT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Qty Volume (Ltr)" required error={errors?.starting_qty_litres?.join(' ')}>
            <CommaInput placeholder="e.g. 1,000,000" value={form.startingQty} onValueChange={v => setForm(f => ({ ...f, startingQty: v }))} />
          </Field>
          <Field label="Qty Volume (MT)">
            <CommaInput placeholder="e.g. 820" value={form.startingQtyMt} onValueChange={v => setForm(f => ({ ...f, startingQtyMt: v }))} />
          </Field>
        </div>

        <div className="h-px bg-slate-100" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cargo Cost</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="BL Figures (Ltr)" error={errors?.bl_qty_litres?.join(' ')}>
            <CommaInput placeholder="e.g. 980,000" value={form.blQty} onValueChange={v => setForm(f => ({ ...f, blQty: v }))} />
          </Field>
          <Field label="BL Figures (MT)">
            <CommaInput placeholder="e.g. 820" value={form.blQtyMt} onValueChange={v => setForm(f => ({ ...f, blQtyMt: v }))} />
          </Field>
          <Field label="Price / Litre (₦)" error={errors?.price_per_litre?.join(' ')}>
            <CommaInput placeholder="e.g. 850" value={form.pricePerLitre} onValueChange={v => setForm(f => ({ ...f, pricePerLitre: v }))} />
          </Field>
        </div>

        {(form.blQty || form.startingQty) && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
            <div>
              <p className="text-slate-400 font-semibold uppercase">Surplus / Deficit</p>
              {(() => {
                const tank = coerceNumber(form.startingQty);
                const bl = coerceNumber(form.blQty);
                if (!form.blQty) return <p className="text-slate-400 mt-0.5">— (enter BL figures)</p>;
                const diff = tank - bl;
                return (
                  <p className={`font-bold mt-0.5 ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {diff > 0 ? '+' : ''}{fmtQty(diff)} L {diff > 0 ? '(Surplus)' : diff < 0 ? '(Deficit)' : ''}
                  </p>
                );
              })()}
            </div>
            <div>
              <p className="text-slate-400 font-semibold uppercase">PFI Value (Cargo Cost)</p>
              {form.blQty && form.pricePerLitre ? (
                <p className="font-bold mt-0.5 text-slate-700">{fmtCurrency(coerceNumber(form.blQty) * coerceNumber(form.pricePerLitre))}</p>
              ) : (
                <p className="text-slate-400 mt-0.5">— (enter BL figures &amp; price)</p>
              )}
            </div>
          </div>
        )}

        <div className="h-px bg-slate-100" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Officers</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StaffSelect id="auditOfficer" label="Audit Officer" value={form.auditOfficer} onChange={sel('auditOfficer')} options={staffOptions} />
          <StaffSelect id="productOfficer" label="Product Officer" value={form.productOfficer} onChange={sel('productOfficer')} options={staffOptions} />
          <StaffSelect id="itComplianceOfficer" label="IT Compliance Officer" value={form.itComplianceOfficer} onChange={sel('itComplianceOfficer')} options={staffOptions} />
          <StaffSelect id="securityExitOfficer" label="Security Exit Officer" value={form.securityExitOfficer} onChange={sel('securityExitOfficer')} options={staffOptions} />
          <StaffSelect id="commissionOfficer" label="Commission Officer" value={form.commissionOfficer} onChange={sel('commissionOfficer')} options={staffOptions} />
          <StaffSelect id="salesManager" label="Sales Manager" value={form.salesManager} onChange={sel('salesManager')} options={staffOptions} />
        </div>

        <div className="h-px bg-slate-100" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vessel &amp; Surveyor</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Vessel Broker">
            <Input placeholder="Broker name" value={form.vesselBroker} onChange={e => setForm(f => ({ ...f, vesselBroker: e.target.value }))} />
          </Field>
          <Field label="Vessel Name">
            <Input placeholder="e.g. MV Lagos Star" value={form.vesselName} onChange={e => setForm(f => ({ ...f, vesselName: e.target.value }))} />
          </Field>
          <Field label="Surveyor Name">
            <Input placeholder="Surveyor full name" value={form.surveyorName} onChange={e => setForm(f => ({ ...f, surveyorName: e.target.value }))} />
          </Field>
          <Field label="Surveyor Phone">
            <Input type="tel" placeholder="e.g. 08012345678" value={form.surveyorPhone} onChange={e => setForm(f => ({ ...f, surveyorPhone: e.target.value }))} />
          </Field>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = pfiQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="PFI Tracking"
              description="Track PFIs by location and product — monitor sold & remaining litres, orders, and total amounts."
              actions={
                <>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={exportAllPfis}
                    disabled={sorted.length === 0 || exportingAll}
                  >
                    {exportingAll ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Download Report
                  </Button>
                  <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} /> Add PFI
                  </Button>
                </>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* Search + Filter */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    className="pl-10"
                    placeholder="Search by PFI number, product, or location…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={e => setStatus(e.target.value as 'all' | PfiStatus)}
                  className="h-10 w-full sm:w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="finished">Finished</option>
                </select>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${sorted.length} PFI${sorted.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                </div>
              ) : sorted.length === 0 ? (
                <div className="p-10 text-center">
                  <FileSearch2 className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No PFIs found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {enriched.length > 0 ? 'Adjust your search or filter.' : 'Click "Add PFI" to create a new PFI.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        {/* Identity */}
                        <TableHead className="font-semibold text-slate-700 w-[40px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('pfi_number')}>
                            PFI No <SortIcon col="pfi_number" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Description</TableHead>

                        {/* Cargo cost breakdown, left to right: BL -> Tank -> Surplus/Deficit -> Price -> Value */}
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">BL Figures</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('starting')}>
                            Tank Qty <SortIcon col="starting" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Qty (MT)</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Surplus / Deficit</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right whitespace-nowrap">Price / Ltr</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right whitespace-nowrap">PFI Value</TableHead>

                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('location')}>
                            Location <SortIcon col="location" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('product')}>
                            Product <SortIcon col="product" />
                          </button>
                        </TableHead>
                        {/* Officer columns — shown in the detail dialog only, not the table
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Audit Officer</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Product Officer</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">IT Compliance</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Security Exit</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Commission Offr.</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Sales Manager</TableHead>
                        */}
                        {/* Vessel/surveyor columns — shown in the detail dialog only, not the table
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Vessel Broker</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Vessel Name</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Surveyor</TableHead>
                        <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Surveyor Phone</TableHead>
                        */}
                        <TableHead className="font-semibold text-emerald-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('sold')}>
                            Sold <SortIcon col="sold" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-amber-700 whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('remaining')}>
                            Remaining <SortIcon col="remaining" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[120px]">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('pct')}>
                            Progress <SortIcon col="pct" />
                          </button>
                        </TableHead>

                        {/* Financial outcome: Revenue -> Total Cost -> Profit/Loss */}
                        <TableHead className="font-semibold text-emerald-700 text-right whitespace-nowrap">
                          <button type="button" className="inline-flex items-center gap-1 ml-auto" onClick={() => toggleSort('amount')}>
                            Revenue <SortIcon col="amount" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right whitespace-nowrap">Total Cost</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right whitespace-nowrap">Profit / Loss</TableHead>

                        <TableHead className="font-semibold text-slate-700">
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('status')}>
                            Status <SortIcon col="status" />
                          </button>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((p, idx) => {
                        const isActive = p.status === 'active';
                        const cell = isActive ? 'text-slate-700' : 'text-red-600';
                        const dash = <span className="text-slate-300">—</span>;
                        return (
                          <TableRow
                            key={p.id}
                            className={`cursor-pointer ${isActive ? 'hover:bg-slate-50/60 transition-colors' : 'bg-red-50/60 hover:bg-red-100/60 transition-colors'}`}
                            onClick={() => setViewTarget(p)}
                          >
                            <TableCell className={isActive ? 'text-slate-500' : 'text-red-400'}>{idx + 1}</TableCell>
                            <TableCell className={`text-xs whitespace-nowrap ${cell}`}>
                              {p.pfi_date
                                ? new Date(p.pfi_date).toLocaleDateString()
                                : (p.createdAtStr ? new Date(p.createdAtStr).toLocaleDateString() : '—')}
                            </TableCell>
                            <TableCell className={`font-semibold whitespace-nowrap ${isActive ? 'text-slate-800' : 'text-red-700'}`}>
                              {p.pfi_number}
                            </TableCell>
                            <TableCell className={`max-w-[160px] truncate ${cell}`} title={p.description ?? p.notes ?? ''}>
                              {p.description ?? p.notes ?? dash}
                            </TableCell>

                            <TableCell className={`whitespace-nowrap ${cell}`}>
                              {p.bl_qty_litres != null ? `${fmtQty(coerceNumber(p.bl_qty_litres))} L` : dash}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap font-medium ${isActive ? 'text-slate-800' : 'text-red-700'}`}>
                              {fmtQty(p.starting)} L
                            </TableCell>
                            <TableCell className={`whitespace-nowrap ${cell}`}>
                              {p.qty_volume_mt != null && coerceNumber(p.qty_volume_mt) > 0
                                ? `${fmtQty(coerceNumber(p.qty_volume_mt))} MT`
                                : dash}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap font-medium ${
                              p.surplusDeficit == null ? 'text-slate-300' : p.surplusDeficit > 0 ? 'text-emerald-600' : p.surplusDeficit < 0 ? 'text-red-600' : cell
                            }`}>
                              {p.surplusDeficit != null ? `${p.surplusDeficit > 0 ? '+' : ''}${fmtQty(p.surplusDeficit)} L` : dash}
                            </TableCell>
                            <TableCell className={`text-right whitespace-nowrap ${cell}`}>
                              {p.price_per_litre != null ? fmtCurrency(coerceNumber(p.price_per_litre)) : dash}
                            </TableCell>
                            <TableCell className={`text-right font-medium whitespace-nowrap ${cell}`}>
                              {p.hasCostData ? fmtCurrency(p.pfiValue) : dash}
                            </TableCell>

                            <TableCell className={`whitespace-nowrap ${cell}`}>{p.locationLabel || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap ${cell}`}>{p.productLabel || dash}</TableCell>
                            {/* Officer cells — shown in the detail dialog only, not the table
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.audit_officer_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.product_officer_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.it_compliance_officer_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.security_exit_officer_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.commission_officer_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.sales_manager_name || dash}</TableCell>
                            */}
                            {/* Vessel/surveyor cells — shown in the detail dialog only, not the table
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.vessel_broker || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.vessel_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.surveyor_name || dash}</TableCell>
                            <TableCell className={`whitespace-nowrap text-xs ${cell}`}>{p.surveyor_phone || dash}</TableCell>
                            */}
                            <TableCell className={`whitespace-nowrap font-medium ${isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {p.sold > 0 ? `${fmtQty(p.sold)} ${p.unitLabel}` : dash}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap font-bold ${!isActive ? 'text-red-500' : p.remaining > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {fmtQty(p.remaining)} {p.unitLabel}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={p.pct} className={`h-2 flex-1 ${isActive ? 'bg-emerald-100' : 'bg-red-100'}`} />
                                <span className={`text-xs w-[36px] text-right ${isActive ? 'text-slate-500' : 'text-red-500'}`}>
                                  {p.pct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className={`text-right font-medium whitespace-nowrap ${isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {p.totalAmount > 0 ? fmtCurrency(p.totalAmount) : dash}
                            </TableCell>
                            <TableCell className={`text-right font-medium whitespace-nowrap ${cell}`}>
                              {p.hasCostData ? fmtCurrency(p.totalCost) : dash}
                            </TableCell>
                            <TableCell className={`text-right font-bold whitespace-nowrap ${
                              !p.hasCostData ? 'text-slate-300' : p.profitLoss > 0 ? 'text-emerald-600' : p.profitLoss < 0 ? 'text-red-600' : 'text-slate-500'
                            }`}>
                              {p.hasCostData
                                ? `${p.profitLoss > 0 ? '+' : ''}${fmtCurrency(p.profitLoss)}`
                                : dash}
                            </TableCell>

                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                                isActive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'
                              }`}>
                                {isActive ? 'Active' : 'Finished'}
                              </span>
                            </TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant={isActive ? 'default' : 'outline'} disabled={!isActive}
                                  onClick={() => openClosureForm(p)} className="text-xs">
                                  Close
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEditPfi(p)}>
                                  <Pencil size={12} /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs gap-1"
                                  title="Download this PFI's full report"
                                  disabled={downloadingPfiId !== null}
                                  onClick={() => exportSinglePfi(p.id, p.pfi_number)}
                                >
                                  {downloadingPfiId === p.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Download size={12} />}
                                  Report
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && sorted.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {sorted.length} of {enriched.length} PFIs
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* Create PFI Dialog                                             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (open) setCreateErrors({}); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <FileSearch2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Create New PFI</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">Fill in the PFI opening details.</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Create new PFI</DialogDescription>
          </DialogHeader>

          {createErrors.conflict && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{createErrors.conflict}</div>
          )}
          {createErrors.message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{createErrors.message}</div>
          )}

          {renderFormFields(createForm, setCreateForm, createErrors.fields)}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={onCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? 'Creating…' : 'Create PFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* Edit PFI Dialog                                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Pencil className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Edit PFI</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">{editTarget?.pfi_number}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Edit PFI details</DialogDescription>
          </DialogHeader>

          {editErrors.message && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{editErrors.message}</div>
          )}

          {renderFormFields(editForm, setEditForm, editErrors.fields)}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={saveEditPfi} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PFI Detail View (click row)                                  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!viewTarget} onOpenChange={open => { if (!open) setViewTarget(null); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          {viewTarget && (() => {
            const isActive = viewTarget.status === 'active';
            const dash = <span className="text-slate-300">—</span>;
            const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
              <div className="flex gap-2 py-1.5 border-b border-slate-100 last:border-0">
                <span className="w-44 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
                <span className="text-sm text-slate-800">{value || dash}</span>
              </div>
            );
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                      <FileSearch2 className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-rose-600'}`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{viewTarget.pfi_number}</h2>
                      <p className="text-sm font-normal text-slate-500 mt-0.5">
                        {viewTarget.productLabel} · {viewTarget.locationLabel}
                        <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${isActive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'}`}>
                          {isActive ? 'Active' : 'Finished'}
                        </span>
                      </p>
                    </div>
                  </DialogTitle>
                  <DialogDescription className="sr-only">PFI detail view</DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  {/* Quantities */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Quantities</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Starting', value: `${fmtQty(viewTarget.starting)} L` },
                        { label: 'Sold', value: `${fmtQty(viewTarget.sold)} L` },
                        { label: 'Remaining', value: `${fmtQty(viewTarget.remaining)} L` },
                      ].map(c => (
                        <div key={c.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">{c.label}</p>
                          <p className="text-base font-bold text-slate-800 mt-0.5">{c.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financials — cargo cost / expenses / profit or loss */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Cargo Cost &amp; Profit/Loss</p>

                    {!viewTarget.hasCostData ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                        Enter BL figures and price/litre (via Edit) to track this cargo's cost and profit/loss.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">BL Figures</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">
                            {viewTarget.bl_qty_litres != null && coerceNumber(viewTarget.bl_qty_litres) > 0
                              ? `${fmtQty(coerceNumber(viewTarget.bl_qty_litres))} L`
                              : '—'}
                          </p>
                          {viewTarget.bl_qty_mt != null && coerceNumber(viewTarget.bl_qty_mt) > 0 && (
                            <p className="text-xs font-medium text-slate-600 mt-1">
                              {fmtQty(coerceNumber(viewTarget.bl_qty_mt))} MT
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">Surplus / Deficit</p>
                          <p className={`text-sm font-bold mt-0.5 ${
                            viewTarget.surplusDeficit == null ? 'text-slate-400' : viewTarget.surplusDeficit > 0 ? 'text-emerald-600' : viewTarget.surplusDeficit < 0 ? 'text-red-600' : 'text-slate-600'
                          }`}>
                            {viewTarget.surplusDeficit != null ? `${viewTarget.surplusDeficit > 0 ? '+' : ''}${fmtQty(viewTarget.surplusDeficit)} L` : dash}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">Price / Litre</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{fmtCurrency(coerceNumber(viewTarget.price_per_litre))}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">PFI Value</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{fmtCurrency(viewTarget.pfiValue)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">Total Expenses</p>
                          <p className="text-sm font-bold text-amber-600 mt-0.5">{fmtCurrency(viewTarget.totalExpenses)}</p>
                          {viewTarget.pendingExpenseCount > 0 && (
                            <p className="text-[10px] text-orange-600 mt-0.5 font-medium">
                              +{fmtCurrency(viewTarget.pendingExpenses)} awaiting approval
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">Total Cost</p>
                          <p className="text-sm font-bold text-slate-800 mt-0.5">{fmtCurrency(viewTarget.totalCost)}</p>
                        </div>
                        {/* Landing cost — what each sellable litre actually cost,
                            all-in. Shown against the purchase price so the uplift
                            from expenses and any discharge deficit is explicit. */}
                        <div className="col-span-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                          <p className="text-xs text-amber-700/70 font-semibold uppercase">Landing Cost / Litre</p>
                          <p className="text-base font-bold text-amber-800 mt-0.5">
                            {viewTarget.landingPerLitre != null ? fmtCurrency(viewTarget.landingPerLitre) : dash}
                          </p>
                          {viewTarget.landingPerLitre != null && coerceNumber(viewTarget.price_per_litre) > 0 && (
                            <p className="text-[11px] text-amber-700/80 mt-1">
                              {fmtCurrency(viewTarget.landingPerLitre - coerceNumber(viewTarget.price_per_litre))} above the
                              {' '}{fmtCurrency(coerceNumber(viewTarget.price_per_litre))} purchase price · total cost ÷ {fmtQty(viewTarget.starting)} L tank
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                          <p className="text-xs text-slate-400 font-semibold uppercase">Revenue</p>
                          <p className="text-sm font-bold text-emerald-700 mt-0.5">{fmtCurrency(viewTarget.revenue)}</p>
                        </div>
                        <div className={`col-span-2 rounded-lg border p-3 text-center ${
                          viewTarget.profitLoss > 0 ? 'border-emerald-200 bg-emerald-50' : viewTarget.profitLoss < 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'
                        }`}>
                          <p className="text-xs text-slate-400 font-semibold uppercase">{viewTarget.profitLoss >= 0 ? 'Profit' : 'Loss'}</p>
                          <p className={`text-base font-bold mt-0.5 ${
                            viewTarget.profitLoss > 0 ? 'text-emerald-700' : viewTarget.profitLoss < 0 ? 'text-red-700' : 'text-slate-600'
                          }`}>
                            {viewTarget.profitLoss > 0 ? '+' : ''}{fmtCurrency(viewTarget.profitLoss)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Expenses list */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expenses</p>
                      <Link
                        to="/expenses"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Open in Expenses →
                      </Link>
                    </div>
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 mb-2 max-h-40 overflow-y-auto">
                      {expensesQuery.isLoading ? (
                        <div className="p-3 text-xs text-slate-400">Loading…</div>
                      ) : expenses.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400">No expenses recorded yet.</div>
                      ) : (
                        expenses.map(exp => (
                          <div key={exp.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">{exp.description}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {new Date(exp.date).toLocaleDateString()}
                                {exp.vendor ? ` · ${exp.vendor}` : ''}
                                {exp.bank_paid_from ? ` · ${exp.bank_paid_from}` : ''}
                                {exp.added_by_name ? ` · ${exp.added_by_name}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-amber-700">{fmtCurrency(coerceNumber(exp.amount))}</span>
                              <button
                                type="button"
                                title="Delete expense"
                                className="text-slate-300 hover:text-red-600 disabled:opacity-50"
                                disabled={deletingExpenseId === exp.id}
                                onClick={() => deleteExpense(exp.id)}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="Description"
                          className="flex-1"
                          value={expenseForm.description}
                          onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                        />
                        <CommaInput
                          placeholder="Amount (₦)"
                          className="sm:w-[140px]"
                          value={expenseForm.amount}
                          onValueChange={v => setExpenseForm(f => ({ ...f, amount: v }))}
                        />
                        <Input
                          type="date"
                          className="sm:w-[150px]"
                          value={expenseForm.date}
                          onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="Vendor (optional)"
                          className="flex-1"
                          value={expenseForm.vendor}
                          onChange={e => setExpenseForm(f => ({ ...f, vendor: e.target.value }))}
                        />
                        <Input
                          placeholder="Bank paid from (optional)"
                          className="flex-1"
                          value={expenseForm.bank}
                          onChange={e => setExpenseForm(f => ({ ...f, bank: e.target.value }))}
                        />
                        <Button size="sm" onClick={addExpense} disabled={addingExpense} className="gap-1 shrink-0">
                          {addingExpense ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Officers */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Officers</p>
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                      <Row label="Audit Officer" value={viewTarget.audit_officer_name} />
                      <Row label="Product Officer" value={viewTarget.product_officer_name} />
                      <Row label="IT Compliance" value={viewTarget.it_compliance_officer_name} />
                      <Row label="Security Exit" value={viewTarget.security_exit_officer_name} />
                      <Row label="Commission Offr." value={viewTarget.commission_officer_name} />
                      <Row label="Sales Manager" value={viewTarget.sales_manager_name} />
                    </div>
                  </div>

                  {/* Vessel */}
                  {(viewTarget.vessel_name || viewTarget.vessel_broker || viewTarget.surveyor_name) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Vessel &amp; Surveyor</p>
                      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                        <Row label="Vessel Broker" value={viewTarget.vessel_broker} />
                        <Row label="Vessel Name" value={viewTarget.vessel_name} />
                        <Row label="Surveyor" value={viewTarget.surveyor_name} />
                        <Row label="Surveyor Phone" value={viewTarget.surveyor_phone} />
                      </div>
                    </div>
                  )}

                  {/* Closure data (finished PFIs) */}
                  {!isActive && (viewTarget.closure_date || viewTarget.total_inflow || viewTarget.closure_remarks) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-1">Closure Summary</p>
                      <div className="rounded-lg border border-rose-200 divide-y divide-rose-100 bg-rose-50/30">
                        <Row label="Closed Date" value={viewTarget.closure_date ? new Date(viewTarget.closure_date).toLocaleDateString() : null} />
                        <Row label="Total Inflow" value={viewTarget.total_inflow ? fmtCurrency(coerceNumber(viewTarget.total_inflow)) : null} />
                        <Row label="Bank" value={viewTarget.closure_bank} />
                        <Row label="Purchase Cost" value={viewTarget.purchase_cost ? fmtCurrency(coerceNumber(viewTarget.purchase_cost)) : null} />
                        <Row label="Aggregate Exp." value={viewTarget.aggregate_expenses ? fmtCurrency(coerceNumber(viewTarget.aggregate_expenses)) : null} />
                        <Row label="Officer/Handler" value={viewTarget.closure_handler} />
                        <Row label="Remarks" value={viewTarget.closure_remarks} />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
                  <Button
                    variant="outline"
                    className="gap-1"
                    disabled={downloadingPfiId !== null}
                    onClick={() => exportSinglePfi(viewTarget.id, viewTarget.pfi_number)}
                  >
                    {downloadingPfiId === viewTarget.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />}
                    Download Report
                  </Button>
                  <Button variant="outline" className="gap-1" onClick={() => { setViewTarget(null); openEditPfi(viewTarget); }}>
                    <Pencil size={13} /> Edit
                  </Button>
                  {isActive && (
                    <Button className="gap-1 bg-rose-600 hover:bg-rose-700" onClick={() => { setViewTarget(null); openClosureForm(viewTarget); }}>
                      <CheckCircle2 size={13} /> Close PFI
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* PFI Closure Form                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!closureTarget} onOpenChange={open => { if (!open) setClosureTarget(null); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-rose-100 p-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">PFI Closure &amp; Submission Form</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">{closureTarget?.pfi_number}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">PFI closure form</DialogDescription>
          </DialogHeader>

          {closureTarget && (
            <div className="space-y-4 py-1">
              {/* Read-only header fields */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">PFI No</p>
                  <p className="text-sm font-bold text-slate-800">{closureTarget.pfi_number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Start Date</p>
                  <p className="text-sm font-semibold text-slate-700">
                    {closureTarget.pfi_date
                      ? new Date(closureTarget.pfi_date).toLocaleDateString()
                      : (closureTarget.created_at ? new Date(closureTarget.created_at).toLocaleDateString() : '—')}
                  </p>
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Date</Label>
                  <Input type="date" value={closureForm.closureDate} onChange={e => setClosureForm(f => ({ ...f, closureDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Closed Date</Label>
                  <Input type="date" value={closureForm.closureDate} onChange={e => setClosureForm(f => ({ ...f, closureDate: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Total Inflow (₦)</Label>
                  <CommaInput placeholder="e.g. 50,000,000" value={closureForm.totalInflow} onValueChange={v => setClosureForm(f => ({ ...f, totalInflow: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Bank</Label>
                  <Input placeholder="Bank name" value={closureForm.bank} onChange={e => setClosureForm(f => ({ ...f, bank: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Purchase Cost (₦)</Label>
                  <CommaInput placeholder="e.g. 40,000,000" value={closureForm.purchaseCost} onValueChange={v => setClosureForm(f => ({ ...f, purchaseCost: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Aggregate Expenses (₦)</Label>
                  <CommaInput placeholder="e.g. 2,500,000" value={closureForm.aggregateExpenses} onValueChange={v => setClosureForm(f => ({ ...f, aggregateExpenses: v }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Officer / Handler</Label>
                <Input placeholder="Name of handling officer" value={closureForm.handler} onChange={e => setClosureForm(f => ({ ...f, handler: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Remarks</Label>
                <Input placeholder="Any closing remarks or notes" value={closureForm.remarks} onChange={e => setClosureForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                This will permanently mark <strong>{closureTarget.pfi_number}</strong> as finished. This action cannot be undone.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClosureTarget(null)} disabled={closureSaving}>Cancel</Button>
            <Button onClick={submitClosure} disabled={closureSaving} className="gap-2 bg-rose-600 hover:bg-rose-700">
              {closureSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {closureSaving ? 'Closing…' : 'Submit & Close PFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy finish confirm kept for fallback — not triggered from UI */}
      <Dialog open={finishConfirm.open} onOpenChange={open => setFinishConfirm(s => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Close PFI?</DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              This will mark the PFI as <strong>finished</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFinishConfirm({ open: false })} disabled={finishing}>Cancel</Button>
            <Button
              onClick={() => {
                if (finishConfirm.pfiId) void finishPfi(finishConfirm.pfiId);
                setFinishConfirm({ open: false });
              }}
              disabled={finishing} className="gap-2"
            >
              {finishing ? <Loader2 size={16} className="animate-spin" /> : null}
              {finishing ? 'Finishing…' : 'Yes, close PFI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
