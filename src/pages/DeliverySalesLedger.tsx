import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Trash2, Pencil,
  Truck, Wallet, FileText,
  TrendingUp, Banknote, Building2,
  Calendar as CalendarIcon, UserPlus, X, Fuel,
  MapPin, Users, LayoutGrid, Filter, AlertTriangle, Tag,
  Clock, Link2, ArrowRightLeft, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, isWithinInterval,
} from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface TruckLoading {
  id: number;
  truck: number | null;
  truck_number?: string;
  pfi?: number | null;
  pfi_number?: string;
  pfi_product?: string;
  depot?: string;
  customer: number | null;
  customer_name?: string;
  quantity_allocated: number | string;
  date_allocated: string;
  date_offloaded?: string | null;
  loading_status?: 'loaded' | 'offloaded' | 'empty';
  location?: string;
  pfi_location?: string;
  allocation_code?: string;
}

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  contact_person?: string;        // manager's name (filling stations)
  contact_person_phone?: string;  // manager's phone (filling stations)
  status: string;
  customer_type?: 'customer' | 'filling_station';  // ← real API field
  notes?: string;                                   // kept for legacy display only
}

// Filling station detection — reads the real customer_type field.
// Falls back to checking the legacy notes prefix for any records not yet migrated.
const LEGACY_FS_PREFIX = '__type:filling_station__';
const isFillingStation = (c: DeliveryCustomer | undefined | null): boolean =>
  c?.customer_type === 'filling_station' ||
  (c?.customer_type == null && !!c?.notes?.startsWith(LEGACY_FS_PREFIX));

interface DeliverySale {
  id: number;
  truck_number: string;
  date_loaded: string;
  depot_loaded: string;
  customer: number;
  customer_name?: string;
  location: string;
  quantity: string | number;
  rate: string | number;
  sales_value: string | number;
  payment_amount: string | number;
  balance: string | number;
  payer_name: string;
  bank: string;
  date_of_payment: string | null;
  phone_number: string;
  remarks: string;
  entered_by?: string;
  created_at?: string;
  updated_at?: string;
  allocation_code?: string;
}

type PagedResponse<T> = { count: number; results: T[] };
type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

// One customer row inside the "Record Payment" dialog
interface SaleRow {
  uid: string;
  customer: string;        // customer id string
  customer_name: string;
  location: string;        // destination
  quantity: string;
  rate: string;
  rateLocked: boolean;     // true when this customer already has a rate for this truck
  sales_value: string;     // auto-computed
  payment_amount: string;
  payer_name: string;
  bank_account_id: string;
  date_of_payment: string;
  phone_number: string;
  remarks: string;
}

interface LedgerGroup {
  key: string;
  loadingId?: number;
  truckNumber: string;
  dateLoaded: string;
  depot: string;
  location: string;
  customerId: number | null;
  customerName: string;
  quantity: number;
  rate: number;
  expected: number;
  totalPaid: number;
  balance: number;
  pfiNumber: string;
  allocationCode: string;
  code: string;
  payments: DeliverySale[];
  isFillingStation: boolean;
}

interface QuickPaymentForm {
  payment_amount: string;
  payer_name: string;
  phone_number: string;
  bank_account_id: string;
  date_of_payment: string;
}

interface BackendPfi {
  id: number;
  pfi_number: string;
}

interface DeliveryLedgerSettings {
  key?: string;
  trip_codes?: string[];
  pfi_code_map?: Record<string, string>;
  loading_code_map?: Record<string, string>;
  sale_trip_map?: Record<string, string>;
  cycle_alias_map?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hardcoded Bank Accounts
// ═══════════════════════════════════════════════════════════════════════════

interface BankAccount {
  id: number;
  account_name: string;
  account_number: string;
  bank_name: string;
  is_active: boolean;
}

const BANK_ACCOUNTS: BankAccount[] = [
  { id: 1, account_name: 'Soroman Energy Ltd', account_number: '1311924986', bank_name: 'Zenith Bank', is_active: true },
  { id: 2, account_name: 'Action Energy Ltd', account_number: '1017185599', bank_name: 'Zenith Bank', is_active: true },
  { id: 3, account_name: 'Soroman Energy Ltd', account_number: '1000102110', bank_name: 'Optimus Bank', is_active: true },
  // { id: 4, account_name: 'Soroman Energy Ltd', account_number: '1122334455', bank_name: 'Access Bank', is_active: true },
  // { id: 5, account_name: 'Soroman Energy Ltd', account_number: '6677889900', bank_name: 'UBA', is_active: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `${formatted}.${parts[1]}`;
  return formatted;
};

const stripCommas = (v: string): string => v.replace(/,/g, '');

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results))
      return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    if (Array.isArray(raw)) return { count: (raw as T[]).length, results: raw as T[] };
  }
  return { count: 0, results: [] };
};

const matchesDateRange = (
  dateStr: string | undefined | null,
  from: Date | null,
  to: Date | null,
): boolean => {
  if (!dateStr || (!from && !to)) return true;
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (from && to) return isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
    if (from) return d >= startOfDay(from);
    if (to) return d <= endOfDay(to);
    return true;
  } catch {
    return true;
  }
};

const getPresetRange = (preset: TimePreset): { from: Date | null; to: Date | null } => {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case 'week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'year': return { from: startOfYear(now), to: endOfYear(now) };
    case 'all': return { from: null, to: null };
    case 'custom': return { from: null, to: null };
  }
};

const makeSaleRow = (): SaleRow => ({
  uid: crypto.randomUUID(),
  customer: '',
  customer_name: '',
  location: '',
  quantity: '',
  rate: '',
  rateLocked: false,
  sales_value: '',
  payment_amount: '',
  payer_name: '',
  bank_account_id: '',
  date_of_payment: format(new Date(), 'yyyy-MM-dd'),
  phone_number: '',
  remarks: '',
});

const CODE_PALETTE = [
  { row: 'bg-sky-50/60 border-l-sky-300', badge: 'bg-sky-100 text-sky-800 border-sky-200' },
  { row: 'bg-emerald-50/60 border-l-emerald-300', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { row: 'bg-orange-50/60 border-l-orange-300', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
  { row: 'bg-violet-50/60 border-l-violet-300', badge: 'bg-violet-100 text-violet-800 border-violet-200' },
  { row: 'bg-pink-50/60 border-l-pink-300', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
  { row: 'bg-amber-50/60 border-l-amber-300', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { row: 'bg-teal-50/60 border-l-teal-300', badge: 'bg-teal-100 text-teal-800 border-teal-200' },
  { row: 'bg-indigo-50/60 border-l-indigo-300', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
];

const getCodeTheme = (code: string) => {
  if (!code) return null;
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  return CODE_PALETTE[hash % CODE_PALETTE.length];
};

const normalizeText = (value: string | undefined | null) =>
  (value || '').trim().toLowerCase();

const LEDGER_SETTINGS_KEY = 'default';

const normalizeCodes = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
};

const normalizeStringMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    const key = String(k || '').trim();
    const val = String(v || '').trim();
    if (key && val) out[key] = val;
  });
  return out;
};

const normalizeIdMap = (value: unknown): Record<number, string> => {
  if (!value || typeof value !== 'object') return {};
  const out: Record<number, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
    const id = Number(k);
    const code = String(v || '').trim().toUpperCase();
    if (Number.isFinite(id) && code) out[id] = code;
  });
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliverySalesLedger() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [truckFilter, setTruckFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [depotFilter, setDepotFilter] = useState<string>('all');
  const [cycleFilter, setCycleFilter] = useState<string>('all'); // 'all' | '1' | '2' | ...

  // ── Allocation & Trip Codes (now loaded from localStorage, shared with Inventory) ──
  const [tripCodes, setTripCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_trip_codes') || '[]'); } catch { return []; }
  });
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  const toggleGroupExpanded = useCallback((key: string) => {
    setExpandedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const [loadingCodeMap, setLoadingCodeMap] = useState<Record<number, string>>({});
  const [saleTripMap, setSaleTripMap] = useState<Record<number, string>>({});
  const [tripCodeFilter, setTripCodeFilter] = useState<string>('all');
  const [dialogTripCode, setDialogTripCode] = useState<string>('');
  const [editTripCode, setEditTripCode] = useState<string>('');
  const [showTripCodeManager, setShowTripCodeManager] = useState(false);
  const [newTripCodeInput, setNewTripCodeInput] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [bulkTripCode, setBulkTripCode] = useState<string>('');

  // ── Custom PFI labels (server-managed) — map system PFI number → your internal code ──
  const [pfiCodeMap, setPfiCodeMap] = useState<Record<string, string>>({});
  const [pfiLabelInput, setPfiLabelInput] = useState<{ pfi: string; label: string }>({ pfi: '', label: '' });

  // ── Cycle aliases — merge two cycle groups (server-managed) ─────────────────────────
  const [cycleAliasMap, setCycleAliasMap] = useState<Record<string, string>>({});
  const [mergeMode, setMergeMode] = useState(false);
  const [mergePrimary, setMergePrimary] = useState<string | null>(null);
  const ledgerSettingsHydratedRef = useRef(false);
  const lastSavedLedgerSignatureRef = useRef('');

  // ── Payment Dialog ─────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  // Shared truck-level fields
  const [dialogTruckLoadingId, setDialogTruckLoadingId] = useState('');
  const [dialogTruckNumber, setDialogTruckNumber] = useState('');
  const [dialogDateLoaded, setDialogDateLoaded] = useState('');
  const [dialogDepot, setDialogDepot] = useState('');
  // Cycle override — 'auto' uses date from loading record; 'custom' lets user type a date
  const [dialogCycleMode, setDialogCycleMode] = useState<'auto' | 'custom'>('auto');
  const [dialogCustomDate, setDialogCustomDate] = useState('');
  // Per-customer rows
  const [saleRows, setSaleRows] = useState<SaleRow[]>([makeSaleRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, Partial<Record<keyof SaleRow, string>>>>({});
  const [saving, setSaving] = useState(false);
  const [assignMode, setAssignMode] = useState(false); // assign customer to cycle without recording payment
  const [quickPaymentTarget, setQuickPaymentTarget] = useState<LedgerGroup | null>(null);
  const [quickPaymentForm, setQuickPaymentForm] = useState<QuickPaymentForm>({
    payment_amount: '',
    payer_name: '',
    phone_number: '',
    bank_account_id: '',
    date_of_payment: '',
  });
  const [quickPaymentSaving, setQuickPaymentSaving] = useState(false);
  const [setupTarget, setSetupTarget] = useState<LedgerGroup | null>(null);
  const [setupCustomer, setSetupCustomer] = useState('');
  const [setupDestination, setSetupDestination] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupTransferTargetKey, setSetupTransferTargetKey] = useState('');
  const [setupTransferAmount, setSetupTransferAmount] = useState('');
  const [setupTransferSaving, setSetupTransferSaving] = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{
    ids: number[];
    loadingId?: number;
    mode: 'entry' | 'truck';
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Edit ───────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<DeliverySale | null>(null);
  const [editForm, setEditForm] = useState<{
    rate: string; sales_value: string; payment_amount: string;
    payer_name: string; bank_account_id: string; date_of_payment: string;
    remarks: string; phone_number: string; location: string; quantity: string;
    date_loaded: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const ledgerSettingsQuery = useQuery({
    queryKey: ['delivery-ledger-settings', LEDGER_SETTINGS_KEY],
    queryFn: async () => apiClient.admin.getDeliveryLedgerSettings({ key: LEDGER_SETTINGS_KEY }) as Promise<DeliveryLedgerSettings>,
    staleTime: 30_000,
  });

  const updateLedgerSettingsMutation = useMutation({
    mutationFn: async (payload: DeliveryLedgerSettings) =>
      apiClient.admin.updateDeliveryLedgerSettings(payload, { key: LEDGER_SETTINGS_KEY }),
  });

  useEffect(() => {
    if (!ledgerSettingsQuery.data || ledgerSettingsHydratedRef.current) return;
    const settings = ledgerSettingsQuery.data;
    const localCodes = (() => { try { return JSON.parse(localStorage.getItem('dsl_trip_codes') || '[]'); } catch { return []; } })();
    const nextTripCodes = Array.from(new Set([...normalizeCodes(settings.trip_codes), ...localCodes])).sort();
    const nextPfiCodeMap = normalizeStringMap(settings.pfi_code_map);
    const nextLoadingCodeMap = normalizeIdMap(settings.loading_code_map);
    const nextSaleTripMap = normalizeIdMap(settings.sale_trip_map);
    const nextCycleAliasMap = normalizeStringMap(settings.cycle_alias_map);

    setTripCodes(nextTripCodes);
    setPfiCodeMap(nextPfiCodeMap);
    setLoadingCodeMap(nextLoadingCodeMap);
    setSaleTripMap(nextSaleTripMap);
    setCycleAliasMap(nextCycleAliasMap);

    lastSavedLedgerSignatureRef.current = JSON.stringify({
      trip_codes: nextTripCodes,
      pfi_code_map: nextPfiCodeMap,
      loading_code_map: nextLoadingCodeMap,
      sale_trip_map: nextSaleTripMap,
      cycle_alias_map: nextCycleAliasMap,
    });
    ledgerSettingsHydratedRef.current = true;
  }, [ledgerSettingsQuery.data]);

  // salesQuery and validSaleIds must be declared BEFORE the autosave effect so
  // the effect can filter out stale sale IDs (backend rejects them with
  // "Unknown sale_id(s)" if we send IDs of deleted sales).
  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allSales = useMemo(() => salesQuery.data?.results || [], [salesQuery.data]);

  // Set of currently-existing sale IDs — used to strip stale references from saleTripMap
  const validSaleIds = useMemo(() => new Set(allSales.map(s => s.id)), [allSales]);

  // Auto-clean saleTripMap: remove entries for sales that no longer exist.
  // This prevents "Unknown sale_id(s)" backend errors when sales are deleted.
  useEffect(() => {
    if (!allSales.length) return;
    setSaleTripMap(prev => {
      const next: Record<number, string> = {};
      let changed = false;
      Object.entries(prev).forEach(([id, code]) => {
        const numId = Number(id);
        if (validSaleIds.has(numId)) {
          next[numId] = code;
        } else {
          changed = true; // sale was deleted — drop it from the map
        }
      });
      return changed ? next : prev;
    });
  }, [allSales, validSaleIds]);

  useEffect(() => {
    if (!ledgerSettingsHydratedRef.current) return;

    const payload: DeliveryLedgerSettings = {
      key: LEDGER_SETTINGS_KEY,
      trip_codes: normalizeCodes(tripCodes),
      pfi_code_map: Object.fromEntries(
        Object.entries(pfiCodeMap)
          .map(([pfi, code]) => [String(pfi).trim(), String(code || '').trim().toUpperCase()])
          .filter(([pfi, code]) => pfi && code),
      ),
      loading_code_map: Object.fromEntries(
        Object.entries(loadingCodeMap)
          .map(([id, code]) => [String(id), String(code || '').trim().toUpperCase()])
          .filter(([id, code]) => id && code),
      ),
      sale_trip_map: Object.fromEntries(
        Object.entries(saleTripMap)
          .map(([id, code]) => [String(id), String(code || '').trim().toUpperCase()])
          // Only include sale IDs that still exist in the backend — deleted sales must
          // be stripped out or the backend rejects the whole settings save.
          .filter(([id, code]) => id && code && validSaleIds.has(Number(id))),
      ),
      cycle_alias_map: Object.fromEntries(
        Object.entries(cycleAliasMap)
          .map(([from, to]) => [String(from || '').trim(), String(to || '').trim()])
          .filter(([from, to]) => from && to),
      ),
    };

    const signature = JSON.stringify(payload);
    if (signature === lastSavedLedgerSignatureRef.current) return;

    const timer = setTimeout(() => {
      updateLedgerSettingsMutation.mutate(payload, {
        onSuccess: () => {
          lastSavedLedgerSignatureRef.current = signature;
        },
        onError: (error) => {
          toast({
            title: 'Failed to save ledger settings',
            description: error instanceof Error ? error.message : 'Please retry.',
            variant: 'destructive',
          });
        },
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [tripCodes, pfiCodeMap, loadingCodeMap, saleTripMap, cycleAliasMap, toast, updateLedgerSettingsMutation, validSaleIds]);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const truckLoadingsQuery = useQuery({
    queryKey: ['delivery-inventory'],
    queryFn: async () =>
      safePaged<TruckLoading>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allLoadings = useMemo(() => {
    return truckLoadingsQuery.data?.results || [];
  }, [truckLoadingsQuery.data]);

  // Merge allocation_code values from real inventory records into tripCodes
  // This is the source of truth — codes on inventory records are always visible
  useEffect(() => {
    if (!allLoadings.length) return;
    const inventoryCodes = allLoadings
      .map((l: any) => (l.allocation_code || '').trim().toUpperCase())
      .filter(Boolean);
    if (!inventoryCodes.length) return;

    setTripCodes(prev => {
      const merged = Array.from(new Set([...prev, ...inventoryCodes])).sort();
      if (merged.join(',') === prev.join(',')) return prev;
      return merged;
    });
  }, [allLoadings]);

  const pfisQuery = useQuery({
    queryKey: ['delivery-pfis'],
    queryFn: async () =>
      safePaged<BackendPfi>(
        await apiClient.admin.getPfis({ page: 1, page_size: 5000 }),
      ),
    staleTime: 60_000,
  });
  const pfiMap = useMemo(() => {
    const map = new Map<number, BackendPfi>();
    (pfisQuery.data?.results || []).forEach((pfi) => {
      map.set(pfi.id, pfi);
    });
    return map;
  }, [pfisQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });
  const customers = useMemo(
    () => customersQuery.data?.results || [],
    [customersQuery.data],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Lookup maps
  // ═══════════════════════════════════════════════════════════════════

  const customerMap = useMemo(() => {
    const m = new Map<number, DeliveryCustomer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const bankMap = useMemo(() => {
    const m = new Map<number, BankAccount>();
    BANK_ACCOUNTS.forEach(b => m.set(b.id, b));
    return m;
  }, []);

  const getLoadingPfiNumber = useCallback((loading: TruckLoading): string => {
    const direct = String(loading.pfi_number || '').trim();
    if (direct) return direct;
    const resolved = loading.pfi ? pfiMap.get(loading.pfi)?.pfi_number : '';
    return String(resolved || '').trim();
  }, [pfiMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Cycle key — one cycle = one loading event = (truck + date_loaded)
  // This is the primary grouping unit; replaces bare truck_number so
  // that two loadings of the same truck are tracked independently.
  // ═══════════════════════════════════════════════════════════════════

  const normalizeCycleDate = (dateValue: string | undefined | null): string => {
    if (!dateValue) return '';
    const raw = String(dateValue).trim();
    if (!raw) return '';
    // Normalized yyyy-MM-dd prevents splitting one physical load into fake cycles.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
      return format(parseISO(raw), 'yyyy-MM-dd');
    } catch {
      return raw.split('T')[0] || raw;
    }
  };

  const getCycleKey = (truckNum: string, dateLoaded: string | undefined | null): string =>
    `${(truckNum || '').trim().toUpperCase()}||${normalizeCycleDate(dateLoaded)}`;

  // ═══════════════════════════════════════════════════════════════════
  // Per-cycle aggregation: expected amount & total paid so far
  // ═══════════════════════════════════════════════════════════════════

  const cyclePaymentSummary = useMemo(() => {
    const map = new Map<string, {
      truckNumber: string;
      dateLoaded: string;
      totalExpected: number;
      totalPaid: number;
      entries: DeliverySale[];
    }>();

    // First pass: collect entries and total paid per cycle
    allSales.forEach(s => {
      const key = getCycleKey(s.truck_number, s.date_loaded);
      const existing = map.get(key) || {
        truckNumber: s.truck_number,
        dateLoaded: s.date_loaded || '',
        totalExpected: 0,
        totalPaid: 0,
        entries: [],
      };
      existing.totalPaid += toNum(s.payment_amount);
      existing.entries.push(s);
      map.set(key, existing);
    });

    // Second pass: totalExpected = sum of MAX sales_value per customer WITHIN this cycle
    map.forEach((cycle) => {
      const perCustMax = new Map<number, number>();
      cycle.entries.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
      });
      cycle.totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);
    });

    return map;
  }, [allSales]);

  // Cycle number per truck: Cycle 1, Cycle 2... based on real loading dates.
  const cycleNumberMap = useMemo(() => {
    const truckDatesMap = new Map<string, Set<string>>();

    allLoadings.forEach(loading => {
      const truck = (loading.truck_number || '').trim().toUpperCase();
      const date = normalizeCycleDate(loading.date_allocated || '');
      if (!truck || !date) return;
      if (!truckDatesMap.has(truck)) truckDatesMap.set(truck, new Set());
      truckDatesMap.get(truck)!.add(date);
    });

    allSales.forEach(sale => {
      const truck = (sale.truck_number || '').trim().toUpperCase();
      const date = normalizeCycleDate(sale.date_loaded || '');
      if (!truck || !date) return;
      if (!truckDatesMap.has(truck)) truckDatesMap.set(truck, new Set());
      truckDatesMap.get(truck)!.add(date);
    });

    const truckDateList = new Map<string, string[]>();
    truckDatesMap.forEach((dates, truck) => {
      truckDateList.set(truck, Array.from(dates).sort((a, b) => a.localeCompare(b)));
    });

    const map = new Map<string, { cycleNum: number; totalCycles: number }>();
    cyclePaymentSummary.forEach((cycle) => {
      const truck = (cycle.truckNumber || '').trim().toUpperCase();
      const date = normalizeCycleDate(cycle.dateLoaded || '');
      const dates = truckDateList.get(truck) || (date ? [date] : []);
      const idx = date ? dates.indexOf(date) : -1;
      map.set(getCycleKey(cycle.truckNumber, cycle.dateLoaded), {
        cycleNum: idx >= 0 ? idx + 1 : 1,
        totalCycles: Math.max(dates.length, 1),
      });
    });

    return map;
  }, [cyclePaymentSummary, allLoadings, allSales]);

  // Keep a truck-level view for the dialog outstanding banner
  // (shows how much is still owed across ALL cycles of the selected truck)
  const truckPaymentSummary = useMemo(() => {
    const map = new Map<string, { totalExpected: number; totalPaid: number }>();
    cyclePaymentSummary.forEach((cycle) => {
      const t = map.get(cycle.truckNumber) || { totalExpected: 0, totalPaid: 0 };
      t.totalExpected += cycle.totalExpected;
      t.totalPaid += cycle.totalPaid;
      map.set(cycle.truckNumber, t);
    });
    return map;
  }, [cyclePaymentSummary]);

  // ═══════════════════════════════════════════════════════════════════
  // Date range
  // ═══════════════════════════════════════════════════════════════════

  const dateRange = useMemo(() => {
    if (timePreset === 'custom') {
      return {
        from: customFrom ? parseISO(customFrom) : null,
        to: customTo ? parseISO(customTo) : null,
      };
    }
    return getPresetRange(timePreset);
  }, [timePreset, customFrom, customTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Filtered & sorted
  // ═══════════════════════════════════════════════════════════════════

  const timeFilteredSales = useMemo(
    () => allSales.filter(s => {
      const dateField = s.date_of_payment || s.date_loaded;
      return matchesDateRange(dateField, dateRange.from, dateRange.to);
    }),
    [allSales, dateRange],
  );

  const filteredSales = useMemo(() => {
    let result = timeFilteredSales;
    if (truckFilter !== 'all') {
      result = result.filter(s => s.truck_number === truckFilter);
    }
    if (locationFilter !== 'all') {
      result = result.filter(s => s.location === locationFilter);
    }
    if (customerFilter !== 'all') {
      result = result.filter(s => String(s.customer) === customerFilter);
    }
    if (depotFilter !== 'all') {
      result = result.filter(s => s.depot_loaded === depotFilter);
    }
    if (cycleFilter !== 'all') {
      const targetCycleNum = Number(cycleFilter);
      result = result.filter(s => {
        const info = cycleNumberMap.get(getCycleKey(s.truck_number, s.date_loaded));
        return info?.cycleNum === targetCycleNum;
      });
    }
    if (tripCodeFilter !== 'all') {
      result = result.filter(s => saleTripMap[s.id] === tripCodeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(s =>
        s.truck_number.toLowerCase().includes(q) ||
        (s.depot_loaded || '').toLowerCase().includes(q) ||
        (s.location || '').toLowerCase().includes(q) ||
        (s.payer_name || '').toLowerCase().includes(q) ||
        (s.bank || '').toLowerCase().includes(q) ||
        (s.customer_name || customerMap.get(s.customer)?.customer_name || '').toLowerCase().includes(q) ||
        (s.remarks || '').toLowerCase().includes(q) ||
        (saleTripMap[s.id] || '').toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => {
      const dateA = a.date_of_payment || a.date_loaded || '';
      const dateB = b.date_of_payment || b.date_loaded || '';
      return dateB.localeCompare(dateA);
    });
  }, [timeFilteredSales, truckFilter, locationFilter, customerFilter, depotFilter, cycleFilter, tripCodeFilter, searchQuery, customerMap, saleTripMap, cycleNumberMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Running balance per row — scoped per cycle (truck + date_loaded)
  // ═══════════════════════════════════════════════════════════════════

  const rowBalances = useMemo(() => {
    const balanceMap = new Map<number, number>();

    cyclePaymentSummary.forEach((cycle) => {
      const sorted = [...cycle.entries].sort((a, b) => {
        const dateA = a.date_of_payment || a.date_loaded || a.created_at || '';
        const dateB = b.date_of_payment || b.date_loaded || b.created_at || '';
        return dateA.localeCompare(dateB) || a.id - b.id;
      });

      // totalExpected within this cycle only
      const perCustMax = new Map<number, number>();
      sorted.forEach(s => {
        const sv = toNum(s.sales_value);
        if (sv > 0) perCustMax.set(s.customer, Math.max(perCustMax.get(s.customer) || 0, sv));
      });
      const totalExpected = Array.from(perCustMax.values()).reduce((a, b) => a + b, 0);

      let cumulativePaid = 0;
      sorted.forEach(s => {
        cumulativePaid += toNum(s.payment_amount);
        balanceMap.set(s.id, totalExpected - cumulativePaid);
      });
    });

    return balanceMap;
  }, [cyclePaymentSummary]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  const periodLabel =
    timePreset === 'custom'
      ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
      : timePreset === 'all' ? 'All Time' : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // Group filteredSales by cycle (truck + date_loaded), preserving sort order within each group
  const groupedByCycle = useMemo(() => {
    const map = new Map<string, DeliverySale[]>();
    filteredSales.forEach(s => {
      const rawKey = getCycleKey(s.truck_number, s.date_loaded);
      // If this cycle has been aliased (merged into another), use the canonical key
      const key = cycleAliasMap[rawKey] || rawKey;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    });
    return map;
  }, [filteredSales, cycleAliasMap]);

  // Which cycle groups are collapsed (default: all expanded)
  const [collapsedTrucks, setCollapsedTrucks] = useState<Set<string>>(new Set());
  const toggleTruck = (cycleKey: string) =>
    setCollapsedTrucks(prev => {
      const next = new Set(prev);
      next.has(cycleKey) ? next.delete(cycleKey) : next.add(cycleKey);
      return next;
    });

  // Unique truck numbers for filter dropdown
  const uniqueTruckNumbers = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => set.add(s.truck_number));
    return Array.from(set).sort();
  }, [allSales]);

  // Unique locations/destinations
  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => { if (s.location) set.add(s.location); });
    return Array.from(set).sort();
  }, [allSales]);

  // Unique customers (id→name pairs)
  const uniqueCustomerOptions = useMemo(() => {
    const map = new Map<number, string>();
    allSales.forEach(s => {
      const name = s.customer_name || customerMap.get(s.customer)?.customer_name || '';
      if (s.customer && name) map.set(s.customer, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSales, customerMap]);

  // Unique depots
  const uniqueDepots = useMemo(() => {
    const set = new Set<string>();
    allSales.forEach(s => { if (s.depot_loaded) set.add(s.depot_loaded); });
    return Array.from(set).sort();
  }, [allSales]);

  // Unique cycle numbers across all trucks — e.g. "Cycle 1", "Cycle 2"
  // Cycle 1 = a truck's first load, Cycle 2 = same truck reloaded, etc.
  const uniqueCycleOptions = useMemo(() => {
    const maxCycle = Array.from(cycleNumberMap.values()).reduce((m, v) => Math.max(m, v.cycleNum), 0);
    if (maxCycle <= 1) return []; // no multi-cycle trucks — hide the filter
    return Array.from({ length: maxCycle }, (_, i) => i + 1);
  }, [cycleNumberMap]);

  const ledgerGroups = useMemo(() => {
    const groups: LedgerGroup[] = [];
    const matchedSaleIds = new Set<number>();
    const salesByCycle = new Map<string, DeliverySale[]>();
    // Truck-only map: for loadings with no date_allocated, we fall back to matching
    // unmatched sales by truck_number alone (so a sale created with today's date doesn't
    // land in a separate orphan group when the inventory row has no date).
    const salesByTruck = new Map<string, DeliverySale[]>();

    allSales.forEach(sale => {
      const cycleKey = getCycleKey(sale.truck_number, sale.date_loaded);
      const existing = salesByCycle.get(cycleKey) ?? [];
      existing.push(sale);
      salesByCycle.set(cycleKey, existing);

      const truckKey = (sale.truck_number || '').trim().toUpperCase();
      const byTruck = salesByTruck.get(truckKey) ?? [];
      byTruck.push(sale);
      salesByTruck.set(truckKey, byTruck);
    });

    const sortPayments = (payments: DeliverySale[]) => [...payments].sort((a, b) => {
      const dateA = a.date_of_payment || a.created_at || a.date_loaded || '';
      const dateB = b.date_of_payment || b.created_at || b.date_loaded || '';
      return dateA.localeCompare(dateB) || a.id - b.id;
    });

    // Process dated loadings first so they claim their matching sales before
    // undated loadings fall back to a truck-only search.
    const filteredLoadings = allLoadings
      .filter(loading => !!(loading.truck || loading.truck_number || loading.loading_status));
    const sortedLoadings = [
      ...filteredLoadings.filter(l => !!(l.date_allocated)),
      ...filteredLoadings.filter(l => !(l.date_allocated)),
    ];

    sortedLoadings.forEach(loading => {
      const cycleKey = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
      const cycleSales = salesByCycle.get(cycleKey) || [];
      let payments = cycleSales.filter(sale => {
        if (matchedSaleIds.has(sale.id)) return false;
        const customerMatches = loading.customer ? sale.customer === loading.customer : true;
        const locationMatches = loading.location
          ? normalizeText(sale.location) === normalizeText(loading.location)
          : true;
        return customerMatches && locationMatches;
      });

      if (payments.length === 0 && loading.customer) {
        payments = cycleSales.filter(sale => !matchedSaleIds.has(sale.id) && sale.customer === loading.customer);
      }

      // Fallback for undated loadings: claim any unmatched sales for this truck
      // (handles the case where the sale was saved with today's date because
      // date_allocated was empty, so the cycle key doesn't match)
      if (payments.length === 0 && !loading.date_allocated) {
        const truckKey = (loading.truck_number || '').trim().toUpperCase();
        const truckSales = salesByTruck.get(truckKey) || [];
        payments = truckSales.filter(sale => {
          if (matchedSaleIds.has(sale.id)) return false;
          const customerMatches = loading.customer ? sale.customer === loading.customer : true;
          return customerMatches;
        });
      }

      payments = sortPayments(payments);
      payments.forEach(payment => matchedSaleIds.add(payment.id));

      const firstPayment = payments[0];
      const customerId = loading.customer ?? firstPayment?.customer ?? null;
      const customerObj = customerId ? customerMap.get(customerId) : null;
      const expected = payments.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.sales_value)), 0);
      const rate = payments.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0);
      const totalPaid = payments.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
      const quantity = toNum(loading.quantity_allocated);
      const pfiNumber = getLoadingPfiNumber(loading);
      const allocationCode = loading.allocation_code || payments.map(sale => sale.allocation_code).find(Boolean) || '';

      groups.push({
        key: `loading:${loading.id}`,
        loadingId: loading.id,
        truckNumber: loading.truck_number || '',
        dateLoaded: loading.date_allocated || firstPayment?.date_loaded || '',
        depot: loading.depot || loading.pfi_location || firstPayment?.depot_loaded || '',
        location: loading.location || firstPayment?.location || '',
        customerId,
        customerName: loading.customer_name || customerObj?.customer_name || firstPayment?.customer_name || '',
        quantity,
        rate,
        expected,
        totalPaid,
        balance: expected - totalPaid,
        pfiNumber,
        allocationCode,
        code: allocationCode,
        payments,
        isFillingStation: isFillingStation(customerObj),
      });
    });

    const unmatchedGroups = new Map<string, DeliverySale[]>();
    allSales.forEach(sale => {
      if (matchedSaleIds.has(sale.id)) return;
      const key = [
        getCycleKey(sale.truck_number, sale.date_loaded),
        String(sale.customer || ''),
        normalizeText(sale.location),
      ].join('::');
      const existing = unmatchedGroups.get(key) ?? [];
      existing.push(sale);
      unmatchedGroups.set(key, existing);
    });

    unmatchedGroups.forEach((payments, key) => {
      const sorted = sortPayments(payments);
      const firstPayment = sorted[0];
      const customerObj = firstPayment.customer ? customerMap.get(firstPayment.customer) : null;
      const expected = sorted.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.sales_value)), 0);
      const totalPaid = sorted.reduce((sum, sale) => sum + toNum(sale.payment_amount), 0);
      const allocationCode = firstPayment.allocation_code || sorted.map(sale => sale.allocation_code).find(Boolean) || '';
      const quantity = sorted.reduce((sum, sale) => sum + toNum(sale.quantity), 0);
      groups.push({
        key: `sale:${key}`,
        truckNumber: firstPayment.truck_number,
        dateLoaded: firstPayment.date_loaded || '',
        depot: firstPayment.depot_loaded || '',
        location: firstPayment.location || '',
        customerId: firstPayment.customer || null,
        customerName: firstPayment.customer_name || customerObj?.customer_name || '',
        quantity,
        rate: sorted.reduce((maxValue, sale) => Math.max(maxValue, toNum(sale.rate)), 0),
        expected,
        totalPaid,
        balance: expected - totalPaid,
        pfiNumber: '',
        allocationCode,
        code: allocationCode,
        payments: sorted,
        isFillingStation: isFillingStation(customerObj),
      });
    });

    return groups;
  }, [allLoadings, allSales, customerMap, getLoadingPfiNumber]);

  const filteredLedgerGroups = useMemo(() => {
    let result = [...ledgerGroups];

    result = result.filter(group => {
      return (
        matchesDateRange(group.dateLoaded, dateRange.from, dateRange.to)
        || group.payments.some(payment => matchesDateRange(payment.date_of_payment || payment.created_at || payment.date_loaded, dateRange.from, dateRange.to))
      );
    });

    if (truckFilter !== 'all') {
      result = result.filter(group => group.truckNumber === truckFilter);
    }
    if (locationFilter !== 'all') {
      result = result.filter(group => group.location === locationFilter);
    }
    if (customerFilter !== 'all') {
      result = result.filter(group => String(group.customerId || '') === customerFilter);
    }
    if (depotFilter !== 'all') {
      result = result.filter(group => group.depot === depotFilter);
    }
    if (tripCodeFilter !== 'all') {
      result = result.filter(group => group.code === tripCodeFilter);
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(group =>
        group.truckNumber.toLowerCase().includes(query)
        || group.depot.toLowerCase().includes(query)
        || group.location.toLowerCase().includes(query)
        || group.customerName.toLowerCase().includes(query)
        || group.allocationCode.toLowerCase().includes(query)
        || group.code.toLowerCase().includes(query)
        || group.pfiNumber.toLowerCase().includes(query)
        || group.payments.some(payment =>
          (payment.payer_name || '').toLowerCase().includes(query)
          || (payment.bank || '').toLowerCase().includes(query),
        )
      );
    }

    const codeOrder = new Map<string, number>();
    tripCodes.forEach((code, index) => codeOrder.set(code, index));

    return result.sort((left, right) => {
      const leftRank = left.code ? (codeOrder.get(left.code) ?? 10_000) : 99_999;
      const rightRank = right.code ? (codeOrder.get(right.code) ?? 10_000) : 99_999;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const codeDiff = (left.code || '').localeCompare(right.code || '');
      if (codeDiff !== 0) return codeDiff;
      const truckDiff = (left.truckNumber || '').localeCompare(right.truckNumber || '');
      if (truckDiff !== 0) return truckDiff;
      return (right.dateLoaded || '').localeCompare(left.dateLoaded || '');
    });
  }, [ledgerGroups, dateRange, truckFilter, locationFilter, customerFilter, depotFilter, tripCodeFilter, searchQuery, tripCodes]);

  const totals = useMemo(() => {
    let totalExpected = 0;
    let totalPaid = 0;
    let totalQty = 0;
    let totalOutstanding = 0;
    let totalOverpaid = 0;
    let entries = 0;

    const uniqueTrucks = new Set<string>();
    const uniqueCustomers = new Set<number>();

    // Deduplicate qty by truck cycle to prevent double-counting when the same
    // truck+date appears in multiple groups (e.g. a loading: group + an orphan
    // sale: group, or multiple customer rows for the same physical load).
    // loading: groups are processed first (they come from inventory which is the
    // source of truth); sale: orphan groups only contribute qty if their cycle
    // wasn't already counted by a loading: group.
    const countedCycles = new Set<string>();
    // Sort so loading: groups come before sale: groups
    const orderedGroups = [...filteredLedgerGroups].sort((a, b) => {
      const aIsLoading = a.key.startsWith('loading:') ? 0 : 1;
      const bIsLoading = b.key.startsWith('loading:') ? 0 : 1;
      return aIsLoading - bIsLoading;
    });

    orderedGroups.forEach(group => {
      if (group.truckNumber) uniqueTrucks.add(group.truckNumber);
      if (group.customerId) uniqueCustomers.add(group.customerId);

      // Build the cycle key for this group
      const cycleKey = `${(group.truckNumber || '').trim().toUpperCase()}||${(group.dateLoaded || '').split('T')[0]}`;
      const isOrphan = group.key.startsWith('sale:');
      const alreadyCounted = isOrphan && countedCycles.has(cycleKey);

      if (!isOrphan || !alreadyCounted) {
        totalQty += Math.max(0, toNum(group.quantity));
        if (cycleKey) countedCycles.add(cycleKey);
      } else if (!cycleKey) {
        // No truck+date key — count it anyway (shouldn't normally happen)
        totalQty += Math.max(0, toNum(group.quantity));
      }

      totalExpected += Math.max(0, toNum(group.expected));
      totalPaid += toNum(group.totalPaid);
      entries += group.payments.length;

      const bal = toNum(group.balance);
      if (bal > 0) totalOutstanding += bal;
      else if (bal < 0) totalOverpaid += Math.abs(bal);
    });

    return {
      entries,
      totalExpected,
      totalPaid,
      totalQty,
      outstanding: totalExpected - totalPaid,
      totalOutstanding,
      totalOverpaid,
      truckCount: uniqueTrucks.size,
      customerCount: uniqueCustomers.size,
    };
  }, [filteredLedgerGroups]);

  const summaryCards = useMemo((): SummaryCard[] => {
    const netBalance = totals.totalOutstanding - totals.totalOverpaid;

    const cards: SummaryCard[] = [
      { title: 'Qty Sold (Ltrs)', value: totals.totalQty > 0 ? totals.totalQty.toLocaleString() : '0', icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'Expected Revenue', value: fmt(totals.totalExpected), icon: <TrendingUp size={20} />, tone: 'neutral' },
      { title: 'Total Paid', value: fmt(totals.totalPaid), icon: <Banknote size={20} />, tone: 'green' },
      {
        title: 'Outstanding',
        value: totals.totalOutstanding > 0 ? fmt(totals.totalOutstanding) : '₦0',
        icon: <Wallet size={20} />,
        tone: totals.totalOutstanding > 0 ? ('red' as const) : ('green' as const),
      },
      {
        title: 'Overpaid',
        value: totals.totalOverpaid > 0 ? `${fmt(totals.totalOverpaid)}` : '₦0',
        icon: <Banknote size={20} />,
        tone: totals.totalOverpaid > 0 ? ('blue' as const) : ('neutral' as const),
      },
      {
        title: 'Net Balance',
        value: netBalance <= 0 ? (netBalance < 0 ? `+${fmt(Math.abs(netBalance))}` : '₦0') : fmt(netBalance),
        icon: <TrendingUp size={20} />,
        tone: netBalance <= 0 ? ('blue' as const) : ('red' as const),
      },
    ];

    return cards;
  }, [totals]);

  const saleToLoadingMap = useMemo(() => {
    const map = new Map<number, number>();
    ledgerGroups.forEach(group => {
      if (!group.loadingId) return;
      group.payments.forEach(payment => map.set(payment.id, group.loadingId as number));
    });
    return map;
  }, [ledgerGroups]);

  // Loaded trucks for the dialog — show trucks that:
  // 1. Have a truck_number or truck ID, AND
  // 2. Are NOT (offloaded AND fully paid with no outstanding balance for this specific cycle)
  const loadedTrucks = useMemo(() => {
    return allLoadings.filter(t => {
      if (!(t.truck_number || t.truck)) return false;
      if (t.loading_status === 'offloaded') {
        const cycleKey = getCycleKey(t.truck_number || '', t.date_allocated || '');
        const cycle = cyclePaymentSummary.get(cycleKey);
        if (cycle) {
          const outstanding = cycle.totalExpected - cycle.totalPaid;
          if (outstanding <= 0 && cycle.totalExpected > 0) return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const truckA = (a.truck_number || '').toUpperCase();
      const truckB = (b.truck_number || '').toUpperCase();
      if (truckA !== truckB) return truckA.localeCompare(truckB);
      const dateA = normalizeCycleDate(a.date_allocated || '');
      const dateB = normalizeCycleDate(b.date_allocated || '');
      return dateB.localeCompare(dateA);
    });
  }, [allLoadings, cyclePaymentSummary]);

  const loadingCycleMeta = useMemo(() => {
    const map = new Map<string, { pfi: string; depot: string; dateAllocated: string }>();
    allLoadings.forEach(loading => {
      const key = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, {
        pfi: getLoadingPfiNumber(loading),
        depot: (loading.depot || loading.pfi_location || loading.location || '').trim(),
        dateAllocated: normalizeCycleDate(loading.date_allocated || ''),
      });
    });
    return map;
  }, [allLoadings, getLoadingPfiNumber]);

  // Per-cycle-per-customer locked rate: cycleKey → customerId → rate string
  const cycleCustomerRateMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    allSales.forEach(s => {
      const r = toNum(s.rate);
      if (!r || !s.truck_number || !s.customer) return;
      const cycleKey = getCycleKey(s.truck_number, s.date_loaded);
      if (!map.has(cycleKey)) map.set(cycleKey, new Map());
      const inner = map.get(cycleKey)!;
      if (!inner.has(String(s.customer))) {
        inner.set(String(s.customer), formatWithCommas(String(r)));
      }
    });
    return map;
  }, [allSales]);

  // Known loading dates per truck — from inventory records (allLoadings)
  // Used in the add/edit dialogs to let users pick which cycle an entry belongs to
  const truckLoadingDates = useMemo(() => {
    const map = new Map<string, string[]>(); // truckNumber → sorted unique dates
    allLoadings.forEach(t => {
      const truck = t.truck_number || '';
      const date = t.date_allocated || '';
      if (!truck || !date) return;
      const arr = map.get(truck) || [];
      if (!arr.includes(date)) arr.push(date);
      map.set(truck, arr);
    });
    map.forEach((dates, truck) => map.set(truck, [...dates].sort()));
    return map;
  }, [allLoadings]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['delivery-sales'] });
    qc.invalidateQueries({ queryKey: ['delivery-customers'] });
    qc.invalidateQueries({ queryKey: ['delivery-customers-list'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
  };

  // ── Trip Code Management ───────────────────────────────────────────

  const addTripCode = () => {
    const code = newTripCodeInput.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) {
      toast({ title: 'Enter a code first', variant: 'destructive' });
      return;
    }
    if (tripCodes.includes(code)) {
      toast({ title: `Code "${code}" already exists`, variant: 'destructive' });
      return;
    }
    setTripCodes(prev => [...prev, code].sort());
    setNewTripCodeInput('');
    toast({ title: `Trip code "${code}" created` });
  };

  const deleteTripCode = (code: string) => {
    // Block deletion if this code is used on any real inventory record
    const isInventoryCode = allLoadings.some(
      (l: any) => (l.allocation_code || '').trim().toUpperCase() === code
    );
    if (isInventoryCode) {
      toast({
        title: `Cannot delete "${code}"`,
        description: 'This code is assigned to inventory records. Re-assign or delete those truck entries first.',
        variant: 'destructive',
      });
      return;
    }
    setTripCodes(prev => prev.filter(c => c !== code));
    setSaleTripMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[Number(k)] === code) delete next[Number(k)]; });
      return next;
    });
    if (tripCodeFilter === code) setTripCodeFilter('all');
    toast({ title: `Trip code "${code}" deleted` });
  };

  // ── Custom PFI label management ────────────────────────────────────

  const savePfiLabel = () => {
    const pfi = pfiLabelInput.pfi.trim();
    const label = pfiLabelInput.label.trim().toUpperCase();
    if (!pfi || !label) {
      toast({ title: 'Enter both PFI number and your internal code', variant: 'destructive' });
      return;
    }
    setPfiCodeMap(prev => ({ ...prev, [pfi]: label }));
    setPfiLabelInput({ pfi: '', label: '' });
    toast({ title: `PFI "${pfi}" → labelled as "${label}"` });
  };

  const deletePfiLabel = (pfi: string) => {
    setPfiCodeMap(prev => { const next = { ...prev }; delete next[pfi]; return next; });
    toast({ title: 'PFI label removed' });
  };

  // ── Cycle merge (alias-based, purely frontend) ─────────────────────

  const handleMerge = (targetCycleKey: string) => {
    if (!mergePrimary) {
      setMergePrimary(targetCycleKey);
      return;
    }
    if (mergePrimary === targetCycleKey) {
      setMergePrimary(null);
      return;
    }
    // Alias the target into the primary so all its entries appear under primary
    setCycleAliasMap(prev => ({ ...prev, [targetCycleKey]: mergePrimary }));
    toast({
      title: 'Cycles merged',
      description: 'Entries from the secondary cycle will now appear under the primary cycle group.',
    });
    setMergeMode(false);
    setMergePrimary(null);
  };

  const unmergeCycle = (aliasKey: string) => {
    setCycleAliasMap(prev => { const next = { ...prev }; delete next[aliasKey]; return next; });
    toast({ title: 'Cycle un-merged — entries restored to their original group' });
  };

  const bulkAssignTripCode = () => {
    if (!bulkTripCode || selectedRows.size === 0) return;
    const count = selectedRows.size;
    if (bulkTripCode === '__remove__') {
      setSaleTripMap(prev => {
        const next = { ...prev };
        selectedRows.forEach(id => delete next[id]);
        return next;
      });
    } else {
      const updates: Record<number, string> = {};
      selectedRows.forEach(id => { updates[id] = bulkTripCode; });
      setSaleTripMap(prev => ({ ...prev, ...updates }));
    }
    setSelectedRows(new Set());
    setBulkTripCode('');
    toast({ title: `${count} ${count === 1 ? 'entry' : 'entries'} updated` });
  };

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const autoCalcSalesValue = (quantity: string, rate: string) => {
    const q = Number(stripCommas(quantity)) || 0;
    const r = Number(stripCommas(rate)) || 0;
    return q * r > 0 ? formatWithCommas(String(q * r)) : '';
  };

  const openPaymentDialog = (preSelectLoadingId?: string, inAssignMode = false) => {
    setDialogTruckLoadingId('');
    setDialogTruckNumber('');
    setDialogDateLoaded('');
    setDialogDepot('');
    setDialogCycleMode('auto');
    setDialogCustomDate('');
    setDialogTripCode('');
    setSaleRows([makeSaleRow()]);
    setRowErrors({});
    setAssignMode(inAssignMode);
    setDialogOpen(true);
    // Pre-select a truck if provided (state updates are batched — handleTruckSelect wins)
    if (preSelectLoadingId) handleTruckSelect(preSelectLoadingId);
  };

  const handleTruckSelect = (loadingId: string) => {
    setDialogTruckLoadingId(loadingId);
    setDialogCycleMode('auto');
    setDialogCustomDate('');
    const loading = loadedTrucks.find(t => String(t.id) === loadingId);
    if (!loading) {
      setDialogTruckNumber('');
      setDialogDateLoaded('');
      setDialogDepot('');
      setSaleRows([makeSaleRow()]);
      return;
    }

    const depot = loading.depot || loading.pfi_location || loading.location || '';
    setDialogTruckNumber(loading.truck_number || '');
    setDialogDateLoaded(loading.date_allocated || '');
    setDialogDepot(depot);

    // Pre-fill first row from the loading record (customer + destination + qty)
    const custId = loading.customer ? String(loading.customer) : '';
    const custObj = loading.customer ? customerMap.get(loading.customer) : null;
    const custName = loading.customer_name || custObj?.customer_name || '';
    const destination = loading.location || '';
    const qty = toNum(loading.quantity_allocated);

    // Check for existing rate for this cycle+customer combo
    const cycleKey = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
    const cycleRates = cycleCustomerRateMap.get(cycleKey);
    const existingRate = (custId && cycleRates?.get(custId)) || '';
    const rateLocked = !!existingRate && !isFillingStation(custObj);

    const qtyStr = qty > 0 ? formatWithCommas(String(qty)) : '';
    const sv = existingRate && qtyStr
      ? formatWithCommas(String(Number(stripCommas(qtyStr)) * Number(stripCommas(existingRate))))
      : '';

    // Auto-fill phone for filling station customers
    const autoPhone = (custObj && isFillingStation(custObj) && custObj.phone_number) ? custObj.phone_number : '';
    const autoPayerName = (custObj && isFillingStation(custObj) && custObj.contact_person) ? custObj.contact_person : '';
    const autoPayerPhone = (custObj && isFillingStation(custObj) && custObj.contact_person_phone)
      ? custObj.contact_person_phone
      : autoPhone;

    setSaleRows([{
      ...makeSaleRow(),
      customer: custId,
      customer_name: custName,
      location: destination,
      quantity: qtyStr,
      rate: existingRate,
      rateLocked,
      sales_value: sv,
      phone_number: autoPayerPhone,
      payer_name: autoPayerName,
    }]);
  };

  const updateSaleRow = (uid: string, field: keyof Omit<SaleRow, 'uid'>, value: string) => {
    // Clear error for this field on change
    if (rowErrors[uid]?.[field]) {
      setRowErrors(prev => {
        const next = { ...prev };
        if (next[uid]) { next[uid] = { ...next[uid] }; delete next[uid][field]; }
        return next;
      });
    }
    setSaleRows(prev => prev.map(row => {
      if (row.uid !== uid) return row;
      // Prevent changing rate when it's locked for this row
      if (field === 'rate' && row.rateLocked) return row;

      const updated = {
        ...row, [field]: field === 'quantity' || field === 'rate' || field === 'payment_amount' || field === 'sales_value'
          ? (field === 'sales_value' ? value : formatWithCommas(value))
          : value
      };

      // When customer is selected, check if they already have a rate for this cycle
      // Also auto-fill phone for filling stations
      if (field === 'customer') {
        const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
        const cycleRates = cycleCustomerRateMap.get(cycleKey);
        const priorRate = value ? cycleRates?.get(value) : undefined;
        const selectedCustomer = value ? customerMap.get(Number(value)) : null;
        if (priorRate && !isFillingStation(selectedCustomer)) {
          updated.rate = priorRate;
          updated.rateLocked = true;
          const q = Number(stripCommas(updated.quantity)) || 0;
          const r = Number(stripCommas(priorRate)) || 0;
          updated.sales_value = q * r > 0 ? formatWithCommas(String(q * r)) : '';
        } else {
          updated.rateLocked = false;
        }
        // Auto-fill phone number and payer name from customer profile for filling stations
        if (selectedCustomer && isFillingStation(selectedCustomer)) {
          if (selectedCustomer.contact_person) updated.payer_name = selectedCustomer.contact_person;
          if (selectedCustomer.contact_person_phone) updated.phone_number = selectedCustomer.contact_person_phone;
          else if (selectedCustomer.phone_number) updated.phone_number = selectedCustomer.phone_number;
        }
      }

      // Auto-calc sales_value when qty or rate changes
      if (field === 'quantity' || field === 'rate') {
        const q = Number(stripCommas(field === 'quantity' ? value : row.quantity)) || 0;
        const r = Number(stripCommas(field === 'rate' ? value : row.rate)) || 0;
        updated.sales_value = q * r > 0 ? formatWithCommas(String(q * r)) : '';
      }
      return updated;
    }));
  };

  const addSaleRow = () => setSaleRows(prev => [...prev, makeSaleRow()]);

  const removeSaleRow = (uid: string) => {
    setSaleRows(prev => prev.length > 1 ? prev.filter(r => r.uid !== uid) : prev);
  };

  const handleSave = useCallback(async () => {
    if (!dialogTruckNumber.trim()) {
      toast({ title: 'Please select a truck', variant: 'destructive' });
      return;
    }

    // Validate rows — keep any row that has a customer selected or any data entered
    const filledRows = saleRows.filter(r => r.customer || r.payment_amount || r.rate || r.quantity);
    if (filledRows.length === 0) {
      toast({ title: 'Add at least one customer row', variant: 'destructive' });
      return;
    }

    // Per-field validation
    const errors: Record<string, Partial<Record<keyof SaleRow, string>>> = {};
    const nameOnlyRegex = /^[A-Za-z\s'\-\.]+$/;

    filledRows.forEach(row => {
      const e: Partial<Record<keyof SaleRow, string>> = {};
      const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;
      const isFS = isFillingStation(custObj);

      if (!row.customer) e.customer = 'Customer is required';
      if (!row.location.trim()) e.location = 'Destination is required';

      if (!assignMode && !isFS) {
        if (!row.rate || Number(stripCommas(row.rate)) <= 0) e.rate = 'Rate is required';
        if (!row.bank_account_id) e.bank_account_id = 'Select a bank account';
        if (!row.date_of_payment) e.date_of_payment = 'Payment date is required';
        if (row.payer_name.trim() && !nameOnlyRegex.test(row.payer_name.trim())) {
          e.payer_name = 'Payer name should contain letters only — no numbers';
        }
      }

      if (Object.keys(e).length) errors[row.uid] = e;
    });

    if (Object.keys(errors).length) {
      setRowErrors(errors);
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
      return;
    }
    setRowErrors({});

    setSaving(true);
    try {
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      // Resolve the allocation_code from the selected loading record so every
      // manually-created sale is stored with the correct code in the database.
      const selectedLoading = dialogTruckLoadingId
        ? allLoadings.find(l => String(l.id) === dialogTruckLoadingId)
        : undefined;
      const dialogAllocationCode = selectedLoading?.allocation_code || undefined;

      const promises = filledRows.map(row => {
        const bankAcct = row.bank_account_id ? bankMap.get(Number(row.bank_account_id)) : null;
        const bankStr = bankAcct
          ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
          : '';
        const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;

        return apiClient.admin.createDeliverySale({
          truck_number: dialogTruckNumber.trim(),
          date_loaded: (dialogCycleMode === 'custom' ? dialogCustomDate : dialogDateLoaded) || format(new Date(), 'yyyy-MM-dd'),
          depot_loaded: dialogDepot.trim() || undefined,
          customer: row.customer ? Number(row.customer) : 0,
          allocation_code: dialogTripCode || dialogAllocationCode || undefined,
          location: row.location.trim() || undefined,
          quantity: Number(stripCommas(row.quantity)) || undefined,
          rate: !assignMode ? (Number(stripCommas(row.rate)) || undefined) : undefined,
          sales_value: !assignMode ? (Number(stripCommas(row.sales_value)) || undefined) : undefined,
          payment_amount: !assignMode ? (Number(stripCommas(row.payment_amount)) || undefined) : undefined,
          payer_name: !assignMode ? (row.payer_name.trim() || undefined) : undefined,
          bank: !assignMode ? (bankStr || undefined) : undefined,
          date_of_payment: !assignMode ? (row.date_of_payment || undefined) : undefined,
          phone_number: row.phone_number.trim() || undefined,
          remarks: row.remarks.trim() || undefined,
          entered_by: currentUser,
        });
      });

      await Promise.all(promises);

      // Write customer(s) & destination(s) back to the inventory entry
      // For multi-row, update the inventory entry with the first row's customer/location
      // (subsequent rows are additional allocations from the same loading)
      const loadingId = Number(dialogTruckLoadingId);
      if (loadingId) {
        try {
          const firstRow = filledRows[0];
          const custName = firstRow.customer
            ? (customerMap.get(Number(firstRow.customer))?.customer_name || firstRow.customer_name)
            : '';
          await apiClient.admin.updateDeliveryInventory(loadingId, {
            ...(firstRow.customer ? { customer: Number(firstRow.customer), customer_name: custName } : {}),
            ...(firstRow.location.trim() ? { location: firstRow.location.trim() } : {}),
          });
        } catch {
          // Non-critical
        }
      }

      toast({
        title: assignMode
          ? `${filledRows.length} customer${filledRows.length > 1 ? 's' : ''} assigned to cycle`
          : `${filledRows.length} entr${filledRows.length > 1 ? 'ies' : 'y'} recorded`,
        description: `Truck ${dialogTruckNumber} · ${filledRows.length} customer${filledRows.length > 1 ? 's' : ''}`,
      });
      setDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save entry',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [dialogTruckNumber, dialogDateLoaded, dialogCycleMode, dialogCustomDate, dialogDepot, dialogTruckLoadingId, dialogTripCode, saleRows, toast, bankMap, customerMap, assignMode, allLoadings]);
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.ids.length > 0) {
        await Promise.all(deleteTarget.ids.map(id => apiClient.admin.deleteDeliverySale(id)));
      }
      if (deleteTarget.mode === 'truck' && deleteTarget.loadingId) {
        await apiClient.admin.deleteDeliveryInventory(deleteTarget.loadingId);
      }

      if (deleteTarget.ids.length > 0) {
        setSaleTripMap(prev => {
          const next = { ...prev };
          deleteTarget.ids.forEach(id => { delete next[id]; });
          return next;
        });
      }
      if (deleteTarget.mode === 'truck' && deleteTarget.loadingId) {
        setLoadingCodeMap(prev => {
          const next = { ...prev };
          delete next[deleteTarget.loadingId as number];
          return next;
        });
      }

      toast({
        title: deleteTarget.mode === 'truck' ? 'Truck record deleted' : 'Entry deleted',
        description: deleteTarget.mode === 'truck'
          ? 'Truck row and linked records removed from ledger'
          : undefined,
      });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Delete failed',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, toast]);

  // Reverse-match bank account from stored "ACCT · BankName" string
  const bankStringToId = (bankStr: string): string => {
    if (!bankStr) return '';
    const match = BANK_ACCOUNTS.find(b =>
      bankStr.startsWith(b.account_number) || bankStr.includes(b.account_number),
    );
    return match ? String(match.id) : '';
  };

  const openQuickPaymentDialog = (group: LedgerGroup) => {
    if (!group.customerId || !group.location || !group.quantity || (!group.expected && !group.isFillingStation)) {
      if (group.loadingId) {
        openPaymentDialog(String(group.loadingId));
        toast({
          title: 'Complete the first entry details first',
          description: 'This row still needs customer, destination, quantity or rate information before follow-up payments can use the short form.',
        });
      } else {
        toast({
          title: 'This row needs a full setup first',
          variant: 'destructive',
        });
      }
      return;
    }

    const customer = group.customerId ? customerMap.get(group.customerId) : null;
    const today = format(new Date(), 'yyyy-MM-dd');
    setQuickPaymentTarget(group);
    setQuickPaymentForm({
      payment_amount: '',
      payer_name: '',
      phone_number: customer?.contact_person_phone || customer?.phone_number || '',
      bank_account_id: '',
      date_of_payment: today,
    });
  };

  const openSetupDialog = (group: LedgerGroup) => {
    setSetupTarget(group);
    setSetupCustomer(group.customerId ? String(group.customerId) : '');
    setSetupDestination(group.location || '');
    setSetupCode(group.code || '');
    setSetupTransferTargetKey('');
    setSetupTransferAmount(group.balance < 0 ? formatWithCommas(String(Math.abs(group.balance))) : '');
  };

  const handleSaveSetup = async () => {
    if (!setupTarget) return;

    const normalized = setupCode.trim().toUpperCase().replace(/\s+/g, '-');
    if (normalized && !tripCodes.includes(normalized)) {
      toast({ title: 'Create this code in Inventory first', variant: 'destructive' });
      return;
    }

    setSetupSaving(true);
    try {
      const customerId = setupCustomer ? Number(setupCustomer) : null;
      const customerName = customerId ? (customerMap.get(customerId)?.customer_name || '') : '';

      if (setupTarget.loadingId) {
        // ── Inventory-linked row: update the loading record AND all linked sales ──
        await apiClient.admin.updateDeliveryInventory(setupTarget.loadingId, {
          customer: customerId || undefined,
          customer_name: customerName || undefined,
          location: setupDestination.trim() || undefined,
          allocation_code: normalized || null,
        });

        if (setupTarget.payments.length > 0) {
          await Promise.all(
            setupTarget.payments.map(p =>
              apiClient.admin.updateDeliverySale(p.id, {
                customer: customerId || 0,
                location: setupDestination.trim() || undefined,
                allocation_code: normalized || null,
              }),
            ),
          );
        }
      } else {
        // ── Unmatched row (no inventory entry yet): update each sale ─
        if (setupTarget.payments.length > 0) {
          await Promise.all(
            setupTarget.payments.map(p =>
              apiClient.admin.updateDeliverySale(p.id, {
                customer: customerId || 0,
                location: setupDestination.trim() || undefined,
                allocation_code: normalized || null,
              }),
            ),
          );
        }
      }

      toast({ title: 'Row setup saved' });
      setSetupTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save setup',
        variant: 'destructive',
      });
    } finally {
      setSetupSaving(false);
    }
  };

  const handleQuickPaymentSave = useCallback(async () => {
    if (!quickPaymentTarget) return;

    const paymentAmount = Number(stripCommas(quickPaymentForm.payment_amount));
    const payerName = quickPaymentForm.payer_name.trim();
    const payerValid = !payerName || /^[A-Za-z\s'\-.]+$/.test(payerName);

    if (!paymentAmount || paymentAmount <= 0) {
      toast({ title: 'Enter a valid payment amount', variant: 'destructive' });
      return;
    }
    if (!quickPaymentForm.bank_account_id) {
      toast({ title: 'Select a bank account', variant: 'destructive' });
      return;
    }
    if (!payerValid) {
      toast({ title: 'Payer name should contain letters only', variant: 'destructive' });
      return;
    }

    setQuickPaymentSaving(true);
    try {
      const bankAcct = bankMap.get(Number(quickPaymentForm.bank_account_id));
      const bankStr = bankAcct ? `${bankAcct.account_number} · ${bankAcct.bank_name}` : undefined;
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const record = await apiClient.admin.createDeliverySale({
        truck_number: quickPaymentTarget.truckNumber,
        date_loaded: quickPaymentTarget.dateLoaded || format(new Date(), 'yyyy-MM-dd'),
        depot_loaded: quickPaymentTarget.depot || undefined,
        customer: quickPaymentTarget.customerId || 0,
        allocation_code: quickPaymentTarget.allocationCode || undefined,
        location: quickPaymentTarget.location || undefined,
        quantity: quickPaymentTarget.quantity || undefined,
        rate: quickPaymentTarget.rate || undefined,
        sales_value: quickPaymentTarget.expected || undefined,
        payment_amount: paymentAmount,
        payer_name: payerName || undefined,
        bank: bankStr,
        date_of_payment: quickPaymentForm.date_of_payment || format(new Date(), 'yyyy-MM-dd'),
        phone_number: quickPaymentForm.phone_number.trim() || undefined,
        entered_by: currentUser,
      }) as { id?: number };

      if (record?.id && quickPaymentTarget.code) {
        setSaleTripMap(prev => ({ ...prev, [record.id as number]: quickPaymentTarget.code }));
      }

      toast({
        title: 'Payment recorded',
        description: `${quickPaymentTarget.truckNumber} · ${fmt(paymentAmount)}`,
      });
      setQuickPaymentTarget(null);
      setQuickPaymentForm({ payment_amount: '', payer_name: '', phone_number: '', bank_account_id: '', date_of_payment: '' });
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to record payment',
        variant: 'destructive',
      });
    } finally {
      setQuickPaymentSaving(false);
    }
  }, [quickPaymentTarget, quickPaymentForm, toast, bankMap]);

  const runTransfer = useCallback(async (
    source: LedgerGroup,
    targetKey: string,
    amountInput: string,
    onDone?: () => void,
  ) => {
    const target = ledgerGroups.find(group => group.key === targetKey);
    const amount = Number(stripCommas(amountInput));

    if (!target) {
      toast({ title: 'Select a target truck row', variant: 'destructive' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ title: 'Enter a valid transfer amount', variant: 'destructive' });
      return;
    }
    const maxTransfer = Math.abs(source.balance);
    if (amount > maxTransfer) {
      toast({ title: `Transfer exceeds available overpayment (${fmt(maxTransfer)})`, variant: 'destructive' });
      return;
    }
    if (!source.customerId || !source.location || !target.customerId || !target.location) {
      toast({ title: 'Both source and target rows must have customer and destination set', variant: 'destructive' });
      return;
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const currentUser = localStorage.getItem('fullname') || 'Unknown';

      const [sourceRecord, targetRecord] = await Promise.all([
        apiClient.admin.createDeliverySale({
          truck_number: source.truckNumber,
          date_loaded: source.dateLoaded || today,
          depot_loaded: source.depot || undefined,
          customer: source.customerId,
          allocation_code: source.allocationCode || undefined,
          location: source.location || undefined,
          quantity: source.quantity || undefined,
          rate: source.rate || undefined,
          sales_value: source.expected || undefined,
          payment_amount: -amount,
          payer_name: `TRANSFER TO ${target.truckNumber}`,
          bank: 'INTERNAL TRANSFER',
          date_of_payment: today,
          remarks: `Overpayment moved to ${target.truckNumber}`,
          entered_by: currentUser,
        }),
        apiClient.admin.createDeliverySale({
          truck_number: target.truckNumber,
          date_loaded: target.dateLoaded || today,
          depot_loaded: target.depot || undefined,
          customer: target.customerId,
          allocation_code: target.allocationCode || undefined,
          location: target.location || undefined,
          quantity: target.quantity || undefined,
          rate: target.rate || undefined,
          sales_value: target.expected || undefined,
          payment_amount: amount,
          payer_name: `TRANSFER FROM ${source.truckNumber}`,
          bank: 'INTERNAL TRANSFER',
          date_of_payment: today,
          remarks: `Overpayment received from ${source.truckNumber}`,
          entered_by: currentUser,
        }),
      ]) as Array<{ id?: number }>;

      const updates: Record<number, string> = {};
      if (sourceRecord?.id && source.code) updates[sourceRecord.id] = source.code;
      if (targetRecord?.id && target.code) updates[targetRecord.id] = target.code;
      if (Object.keys(updates).length > 0) {
        setSaleTripMap(prev => ({ ...prev, ...updates }));
      }

      toast({
        title: 'Overpayment transferred',
        description: `${fmt(amount)} moved from ${source.truckNumber} to ${target.truckNumber}`,
      });
      onDone?.();
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to transfer overpayment',
        variant: 'destructive',
      });
    }
  }, [ledgerGroups, toast]);

  const handleSetupTransfer = async () => {
    if (!setupTarget || setupTarget.balance >= 0) return;
    setSetupTransferSaving(true);
    try {
      await runTransfer(setupTarget, setupTransferTargetKey, setupTransferAmount, () => {
        setSetupTransferTargetKey('');
        setSetupTransferAmount('');
        setSetupTarget(null);
      });
    } finally {
      setSetupTransferSaving(false);
    }
  };

  const openEditDialog = (sale: DeliverySale) => {
    setEditTarget(sale);
    const linkedLoadingId = saleToLoadingMap.get(sale.id);
    setEditTripCode((linkedLoadingId ? loadingCodeMap[linkedLoadingId] : '') || saleTripMap[sale.id] || '');
    const rate = toNum(sale.rate);
    const sv = toNum(sale.sales_value);
    const pa = toNum(sale.payment_amount);
    const qty = toNum(sale.quantity);
    setEditForm({
      quantity: qty > 0 ? formatWithCommas(String(qty)) : '',
      rate: rate > 0 ? formatWithCommas(String(rate)) : '',
      sales_value: sv > 0 ? formatWithCommas(String(sv)) : '',
      payment_amount: pa > 0 ? formatWithCommas(String(pa)) : '',
      payer_name: sale.payer_name || '',
      bank_account_id: bankStringToId(sale.bank || ''),
      date_of_payment: sale.date_of_payment || '',
      remarks: sale.remarks || '',
      phone_number: sale.phone_number || '',
      location: sale.location || '',
      date_loaded: sale.date_loaded || '',
    });
  };

  const handleEditSave = useCallback(async () => {
    if (!editTarget || !editForm) return;
    setEditSaving(true);

    // Determine lock states at save time (same logic as the form UI)
    const editRateIsLocked = toNum(editTarget.rate) > 0;

    try {
      const bankAcct = editForm.bank_account_id
        ? BANK_ACCOUNTS.find(b => String(b.id) === editForm.bank_account_id)
        : null;
      const bankStr = bankAcct
        ? `${bankAcct.account_number} · ${bankAcct.bank_name}`
        : editTarget.bank || undefined;

      const qty = Number(stripCommas(editForm.quantity)) || undefined;
      // Only send rate if it wasn't locked (i.e. it had no value before)
      const rate = editRateIsLocked
        ? (toNum(editTarget.rate) || undefined)
        : (Number(stripCommas(editForm.rate)) || undefined);
      const sv = Number(stripCommas(editForm.sales_value)) || undefined;
      const pa = Number(stripCommas(editForm.payment_amount)) || undefined;

      // Auto-compute sales_value if qty + rate are set but sv wasn't manually entered
      const computedSv = qty && rate && !sv ? qty * rate : sv;

      await apiClient.admin.updateDeliverySale(editTarget.id, {
        quantity: qty,
        rate: rate,
        sales_value: computedSv,
        payment_amount: pa,
        payer_name: editForm.payer_name.trim() || undefined,
        bank: bankStr,
        date_of_payment: editForm.date_of_payment || undefined,
        remarks: editForm.remarks.trim() || undefined,
        phone_number: editForm.phone_number.trim() || undefined,
        location: editForm.location.trim() || undefined,
        // Only send date_loaded if the user changed it (cycle reassignment)
        ...(editForm.date_loaded && editForm.date_loaded !== editTarget.date_loaded
          ? { date_loaded: editForm.date_loaded }
          : {}),
      });

      // Persist trip code assignment locally
      const linkedLoadingId = saleToLoadingMap.get(editTarget.id);
      if (editTripCode) {
        setSaleTripMap(prev => ({ ...prev, [editTarget.id]: editTripCode }));
        if (linkedLoadingId) {
          setLoadingCodeMap(prev => ({ ...prev, [linkedLoadingId]: editTripCode }));
        }
      } else {
        setSaleTripMap(prev => { const next = { ...prev }; delete next[editTarget.id]; return next; });
        if (linkedLoadingId) {
          setLoadingCodeMap(prev => { const next = { ...prev }; delete next[linkedLoadingId]; return next; });
        }
      }
      toast({ title: 'Entry updated' });
      setEditTarget(null);
      setEditForm(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editForm, editTripCode, toast, saleToLoadingMap, loadingCodeMap]);

  const exportExcel = useCallback(() => {
    if (!filteredLedgerGroups.length) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();

    const n = (v: number) => v > 0 ? v.toLocaleString('en-NG') : '—';
    const u = (s: string) => (s || '').toUpperCase();
    const safeFmtDate = (d: string | null | undefined): string => {
      if (!d) return '';
      try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d.split('T')[0] || d; }
    };

    // Sort groups by trip code order (tripCodes), then by truck number asc, then by group index (for serials)
    const tripCodeOrder = new Map<string, number>();
    tripCodes.forEach((code, idx) => tripCodeOrder.set(code, idx));
    const sortedGroups = [...filteredLedgerGroups].sort((a, b) => {
      const aCode = a.code || '';
      const bCode = b.code || '';
      const aIdx = tripCodeOrder.has(aCode) ? tripCodeOrder.get(aCode) : 9999;
      const bIdx = tripCodeOrder.has(bCode) ? tripCodeOrder.get(bCode) : 9999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      // Within trip code, sort by truck number asc
      const truckDiff = (a.truckNumber || '').localeCompare(b.truckNumber || '');
      if (truckDiff !== 0) return truckDiff;
      // If same truck, preserve original order (serial)
      return 0;
    });

    // Grand totals and per-trip code quantities
    // Deduplicate qty by truck cycle to prevent double-counting (same logic as totals useMemo)
    let grandExpected = 0;
    let grandPaid = 0;
    let grandQty = 0;
    let grandOutstanding = 0;
    let grandOverpaid = 0;
    const truckSet = new Set<string>();
    const tripCodeQty: Record<string, number> = {};
    tripCodes.forEach(code => { tripCodeQty[code] = 0; });
    let unassignedQty = 0;
    const exportCountedCycles = new Set<string>();
    // Process loading: groups before sale: groups so inventory is source of truth for qty
    const exportOrderedGroups = [...sortedGroups].sort((a, b) =>
      (a.key.startsWith('loading:') ? 0 : 1) - (b.key.startsWith('loading:') ? 0 : 1)
    );
    exportOrderedGroups.forEach(group => {
      if (group.truckNumber) truckSet.add(group.truckNumber);
      const cycleKey = `${(group.truckNumber || '').trim().toUpperCase()}||${(group.dateLoaded || '').split('T')[0]}`;
      const isOrphan = group.key.startsWith('sale:');
      const alreadyCounted = isOrphan && cycleKey ? exportCountedCycles.has(cycleKey) : false;
      const qty = (!isOrphan || !alreadyCounted) ? (group.quantity > 0 ? group.quantity : 0) : 0;
      if (cycleKey && (!isOrphan || !alreadyCounted)) exportCountedCycles.add(cycleKey);
      grandQty += qty;
      grandExpected += group.expected > 0 ? group.expected : 0;
      grandPaid += group.totalPaid;
      const bal = group.balance;
      if (bal > 0) grandOutstanding += bal;
      else if (bal < 0) grandOverpaid += Math.abs(bal);
      const code = group.code || '';
      if (Object.prototype.hasOwnProperty.call(tripCodeQty, code)) tripCodeQty[code] += qty;
      else unassignedQty += qty;
    });
    const grandBalance = grandExpected - grandPaid;
    const totalTrucks = truckSet.size;

    const COLS = [
      'S/N', 'PFI', 'TRUCK NO.', 'CUSTOMER', 'DESTINATION',
      'QTY (LTRS)', 'RATE (₦)', 'AMOUNT (₦)', 'PAYMENT (₦)', 'BALANCE (₦)',
      'PAYER', 'BANK', 'PAYMENT DATE',
    ] as const;

    const aoa: (string | number)[][] = [];

    const netBalanceLabel = (() => {
      if (grandBalance === 0) return 'FULLY SETTLED';
      if (grandBalance < 0) return `${n(Math.abs(grandBalance))} OVERPAID`;
      if (grandOverpaid > 0) return `${n(grandBalance)} (${n(grandOverpaid)} overpaid on some entries)`;
      return n(grandBalance);
    })();

    aoa.push(['DELIVERY SALES LEDGER']);
    aoa.push([]);
    aoa.push(['TOTAL TRUCKS', totalTrucks]);
    aoa.push(['QUANTITY SOLD', n(grandQty) + ' LITRES']);
    tripCodes.forEach(code => {
      aoa.push([`(${code}) - QUANTITY SOLD`, n(tripCodeQty[code]) + ' LITRES']);
    });
    if (unassignedQty > 0) {
      aoa.push(['TOTAL UNSOLD', n(unassignedQty) + ' LITRES']);
    }
    aoa.push([]);
    aoa.push(['EXPECTED REVENUE', `₦ ${n(grandExpected)}`]);
    aoa.push(['TOTAL PAID', `₦ ${n(grandPaid)}`]);
    aoa.push(['BALANCE', netBalanceLabel]);
    aoa.push([]);
    aoa.push([...COLS]);


    let rowNum = 0;
    // For serial numbering of repeated trucks within a trip code
    let lastTripCode = null;
    let truckSerialMap: Record<string, number> = {};

    sortedGroups.forEach(group => {
      const truckNum = u(group.truckNumber || '');
      const pfi = group.pfiNumber || '';
      const tripCode = group.code || '';
      const dateLoadedStr = safeFmtDate(group.dateLoaded);
      const depot = u(group.depot || '');
      const dest = u(group.location || '');
      const custNameGroup = u(group.customerName || '');

      // Reset serial map if trip code changes
      if (tripCode !== lastTripCode) {
        truckSerialMap = {};
        lastTripCode = tripCode;
      }
      // Serial for this truck in this trip code
      const truckKey = truckNum;
      truckSerialMap[truckKey] = (truckSerialMap[truckKey] || 0) + 1;
      const serial = truckSerialMap[truckKey];

      // Add serial to truck number if repeated
      const truckNumWithSerial = Object.values(truckSerialMap).filter(v => v > 1).length > 0
        ? `${truckNum}${serial > 1 ? ` (${serial})` : ''}`
        : truckNum;

      if (group.payments.length === 0) {
        rowNum += 1;
        aoa.push([
          rowNum,
          tripCode,
          truckNumWithSerial || '',
          custNameGroup,
          dest,
          // pfi,
          // dateLoadedStr,
          // depot,
          group.quantity > 0 ? n(group.quantity) : '',
          '', '', '', '', '', '', '', '', '',
        ]);
      } else {
        // Sort payments chronologically within group
        const sortedPayments = [...group.payments].sort((a, b) => {
          const da = a.date_of_payment || a.date_loaded || '';
          const db = b.date_of_payment || b.date_loaded || '';
          return da.localeCompare(db) || a.id - b.id;
        });

        let cumulativePaid = 0;
        let prevQty = '';
        let prevRate = '';

        sortedPayments.forEach((s, idx) => {
          rowNum += 1;
          cumulativePaid += toNum(s.payment_amount);
          const runningBalance = group.expected - cumulativePaid;
          const custName = u(s.customer_name || customerMap.get(s.customer)?.customer_name || '');
          const thisQty = toNum(s.quantity) > 0 ? n(toNum(s.quantity)) : '';
          const thisRate = toNum(s.rate) > 0 ? n(toNum(s.rate)) : '';

          // First row of group: emit truck/loading fields; subsequent: blank
          const isFirst = idx === 0;

          // Qty & Rate: show only on change
          const qtyCell = thisQty !== prevQty ? thisQty : '';
          const rateCell = thisRate !== prevRate ? thisRate : '';

          let balanceCell = '';
          if (typeof runningBalance === 'number') {
            if (runningBalance > 0) balanceCell = n(runningBalance);
            else if (runningBalance < 0) balanceCell = `+${n(Math.abs(runningBalance))} OVERPAID`;
            else balanceCell = 'FULLY PAID';
          }

          aoa.push([
            rowNum,
            isFirst ? tripCode : '',
            isFirst ? truckNumWithSerial : '',
            // isFirst ? pfi           : '',
            // isFirst ? dateLoadedStr : '',
            // isFirst ? depot         : '',
            isFirst ? custName : '',
            isFirst ? dest : '',
            qtyCell,
            rateCell,
            isFirst && toNum(s.sales_value) > 0 ? n(toNum(s.sales_value)) : '',
            toNum(s.payment_amount) > 0 ? n(toNum(s.payment_amount)) : '',
            balanceCell,
            u(s.payer_name || ''),
            // s.phone_number  || '',
            u(s.bank || ''),
            safeFmtDate(s.date_of_payment),
            // u(s.entered_by  || ''),
          ]);

          prevQty = thisQty;
          prevRate = thisRate;
        });

        // Subtotal row
        aoa.push([
          '',
          '', '', '', '', '',
          // group.quantity > 0 ? n(group.quantity) : '',
          '',
          group.expected > 0 ? n(group.expected) : '',
          group.totalPaid > 0 ? n(group.totalPaid) : '',
          group.balance === 0
            ? 'FULLY PAID'
            : group.balance > 0
              ? n(group.balance)
              : group.balance < 0
                ? `+${n(Math.abs(group.balance))} OVERPAID`
                : '',
          '', '', '', '', '',
        ]);
      }

      // Blank separator between groups
      aoa.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Sales Ledger');
    XLSX.writeFile(wb, `DELIVERY SALES LEDGER.xlsx`);
  }, [filteredLedgerGroups, customerMap, timePreset, customFrom, customTo]);

  const activeBankAccounts = useMemo(
    () => BANK_ACCOUNTS.filter(b => b.is_active),
    [],
  );

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = salesQuery.isLoading || customersQuery.isLoading || truckLoadingsQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* Header */}
            <PageHeader
              title="Delivery Sales Ledger"
              description="Manage loaded truck and add incremental payments under each truck."
              actions={
                <>
                  <Button variant="default" className="gap-2" onClick={exportExcel} disabled={filteredSales.length === 0}>
                    <Download size={16} /> Download Report
                  </Button>
                  {/* {!readOnly && (
                    <Button className="gap-2" onClick={() => openPaymentDialog()}>
                      <Plus size={16} /> Record Payment
                    </Button>
                  )} */}
                </>
              }
            />

            {/* ══════════════════════════════════════════════════════
                TRIP CODE MANAGER — create / delete trip identifiers
            ══════════════════════════════════════════════════════ */}
            {/* ══════════════════════════════════════════════════════
                FILTER PANEL — always visible, one unified card
            ══════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

              {/* Card header */}
              {/* <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60"> */}
              {/* <Filter size={15} className="text-slate-500" /> */}
              {/* <span className="text-sm font-semibold text-slate-700">Filter &amp; Search</span> */}
              {/* Active filter count */}
              {/* {[truckFilter, locationFilter, customerFilter, depotFilter, tripCodeFilter].filter(v => v !== 'all').length > 0 && ( */}
              {/* <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white leading-none">
                    {[truckFilter, locationFilter, customerFilter, depotFilter, tripCodeFilter].filter(v => v !== 'all').length} active
                  </span> */}
              {/* )} */}
              {/* Clear all — only when filters are active */}
              {/* {([truckFilter, locationFilter, customerFilter, depotFilter, tripCodeFilter, searchQuery].some(v => v !== 'all' && v !== '')) && (
                  <button
                    title="Clear all filters"
                    onClick={() => {
                      setTruckFilter('all');
                      setDepotFilter('all');
                      setLocationFilter('all');
                      setCustomerFilter('all');
                      setTripCodeFilter('all');
                      setSearchQuery('');
                    }}
                    className="ml-auto text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <X size={12} /> Clear all filters
                  </button>
                )}
              </div> */}

              <div className="p-5 space-y-5">

                {/* Search */}
                <div>
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <Input
                      placeholder="Search by truck number, customer name, PFI, etc…"
                      className="pl-9 h-9 text-sm"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        title="Clear search"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Time Period */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarIcon size={12} /> Time Period
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                      <button
                        key={tp}
                        type="button"
                        title={`Show ${tp === 'all' ? 'all time' : tp === 'custom' ? 'custom date range' : tp}`}
                        onClick={() => handlePresetChange(tp)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${timePreset === tp
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                          }`}
                      >
                        {tp === 'all' ? 'All Time' : tp === 'custom' ? 'Custom Range' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                      </button>
                    ))}
                  </div>
                  {timePreset === 'custom' && (
                    <div className="flex flex-wrap gap-3 mt-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">From date</Label>
                        <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-500">To date</Label>
                        <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100" />

                {/* Dropdown filters */}
                <div className="space-y-2">
                  {/* <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Filter size={12} /> Narrow Down Results
                  </p> */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">

                    {/* Truck */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Truck size={12} className="text-slate-400" /> Truck
                      </label>
                      <select
                        aria-label="Filter by truck"
                        value={truckFilter}
                        onChange={e => setTruckFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${truckFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                          }`}
                      >
                        <option value="all">All Trucks</option>
                        {uniqueTruckNumbers.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Depot */}
                    {/* <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Building2 size={12} className="text-slate-400" /> Depot (Loading Point)
                      </label>
                      <select
                        aria-label="Filter by depot"
                        value={depotFilter}
                        onChange={e => setDepotFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          depotFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Depots</option>
                        {uniqueDepots.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div> */}

                    {/* Destination */}
                    {/* <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <MapPin size={12} className="text-slate-400" /> Destination
                      </label>
                      <select
                        aria-label="Filter by destination"
                        value={locationFilter}
                        onChange={e => setLocationFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                          locationFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Destinations</option>
                        {uniqueLocations.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div> */}

                    {/* Customer */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <Users size={12} className="text-slate-400" /> Customer
                      </label>
                      <select
                        aria-label="Filter by customer"
                        value={customerFilter}
                        onChange={e => setCustomerFilter(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${customerFilter !== 'all' ? 'border-slate-700 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                          }`}
                      >
                        <option value="all">All Customers</option>
                        {uniqueCustomerOptions.map(c => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Code */}
                    {tripCodes.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <Tag size={12} className="text-purple-400" /> Allocation Code
                        </label>
                        <select
                          aria-label="Filter by Allocation Code"
                          value={tripCodeFilter}
                          onChange={e => setTripCodeFilter(e.target.value)}
                          className={`h-9 w-full rounded-md border bg-white px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300 ${tripCodeFilter !== 'all' ? 'border-purple-600 font-semibold text-purple-900 bg-purple-50' : 'border-slate-200 text-slate-700'
                            }`}
                        >
                          <option value="all">All Allocation Codes</option>
                          {tripCodes.map(code => {
                            const count = ledgerGroups.filter(g => g.allocationCode === code).length;
                            return (
                              <option key={code} value={code}>{code}{count > 0 ? ` (${count} rows)` : ''}</option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Divider ─────────────────────────────────────── */}
                {/* <div className="border-t border-slate-100" /> */}


                {/* ── Active filter chips ──────────────────────────── */}
                {[
                  truckFilter !== 'all' && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('all') },
                  depotFilter !== 'all' && { label: `Depot: ${depotFilter}`, clear: () => setDepotFilter('all') },
                  locationFilter !== 'all' && { label: `Destination: ${locationFilter}`, clear: () => setLocationFilter('all') },
                  customerFilter !== 'all' && { label: `Customer: ${uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}`, clear: () => setCustomerFilter('all') },
                  tripCodeFilter !== 'all' && { label: `Allocation Code: ${tripCodeFilter}`, clear: () => setTripCodeFilter('all') },
                  searchQuery && { label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') },
                ].filter((x): x is { label: string; clear: () => void } => !!x).length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-slate-400 shrink-0">You're viewing:</span>
                      {[
                        truckFilter !== 'all' && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('all') },
                        depotFilter !== 'all' && { label: `Depot: ${depotFilter}`, clear: () => setDepotFilter('all') },
                        locationFilter !== 'all' && { label: `Destination: ${locationFilter}`, clear: () => setLocationFilter('all') },
                        customerFilter !== 'all' && { label: `Customer: ${uniqueCustomerOptions.find(c => String(c.id) === customerFilter)?.name || customerFilter}`, clear: () => setCustomerFilter('all') },
                        tripCodeFilter !== 'all' && { label: `Allocation Code: ${tripCodeFilter}`, clear: () => setTripCodeFilter('all') },
                        searchQuery && { label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') },
                      ].filter((x): x is { label: string; clear: () => void } => !!x).map(chip => (
                        <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${chip.label.startsWith('Allocation Code:') ? 'bg-purple-700 text-white' : 'bg-slate-900 text-white'
                          }`}>
                          {chip.label}
                          <button title={`Remove: ${chip.label}`} onClick={chip.clear} className="hover:text-slate-300 ml-0.5">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                {/* ── Results summary line ─────────────────────────── */}
                {/* ── Custom PFI Labels ────────────────────────────── */}
                {/* <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                <div className="border-t border-slate-100" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <FileText size={11} className="text-indigo-400" /> Custom PFI Labels
                    </span>
                    {Object.entries(pfiCodeMap).map(([pfi, label]) => (
                      <span key={pfi} className="inline-flex items-center gap-0.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {pfi} → {label}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => deletePfiLabel(pfi)}
                            title={`Remove label for PFI "${pfi}"`}
                            className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                    {Object.keys(pfiCodeMap).length === 0 && (
                      <span className="text-xs text-slate-400 italic">No labels — map a system PFI number to your internal code below</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="PFI no."
                          className="h-6 px-2 text-xs rounded border border-dashed border-slate-300 bg-transparent focus:outline-none focus:border-indigo-400 w-16"
                          value={pfiLabelInput.pfi}
                          onChange={e => setPfiLabelInput(prev => ({ ...prev, pfi: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePfiLabel(); } }}
                        />
                        <span className="text-slate-400 text-xs">→</span>
                        <input
                          placeholder="your code"
                          className="h-6 px-2 text-xs rounded border border-dashed border-slate-300 bg-transparent focus:outline-none focus:border-indigo-400 w-24 uppercase"
                          value={pfiLabelInput.label}
                          onChange={e => setPfiLabelInput(prev => ({ ...prev, label: e.target.value.toUpperCase() }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePfiLabel(); } }}
                        />
                        <button
                          type="button"
                          onClick={savePfiLabel}
                          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                        >
                          Add
                        </button>
                      </span>
                    )}
                  </div>
                </div> */}

                {/* ── Codes ────────────────────────────────────────── */}
                {/* <div className="border-t border-slate-100" /> */}
                {/* <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0">
                      <Tag size={11} className="text-purple-400" /> PFI Codes
                    </span>
                    {tripCodes.map(code => {
                      const count = Object.values(saleTripMap).filter(v => v === code).length;
                      return (
                        <span key={code} className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setTripCodeFilter(prev => prev === code ? 'all' : code)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${tripCodeFilter === code
                                ? 'bg-purple-700 text-white border-purple-700'
                                : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                              }`}
                          >
                            {code}{count > 0 ? ` · ${count}` : ''}
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => deleteTripCode(code)}
                              title={`Delete ${code}`}
                              className="text-slate-300 hover:text-red-400 transition-colors p-0.5 rounded"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {tripCodes.length === 0 && (
                      <span className="text-xs text-slate-400">No codes yet</span>
                    )}
                    {!readOnly && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <input
                          placeholder="+ new code"
                          className="h-6 px-2 text-xs rounded border border-dashed border-slate-300 bg-transparent focus:outline-none focus:border-purple-400 w-24 uppercase"
                          value={newTripCodeInput}
                          onChange={e => setNewTripCodeInput(e.target.value.toUpperCase())}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTripCode(); } }}
                        />
                        <button
                          type="button"
                          onClick={addTripCode}
                          className="text-xs text-purple-500 hover:text-purple-700 font-medium transition-colors"
                        >
                          Add
                        </button>
                      </span>
                    )}
                  </div>
                </div> */}

                {/* ── Results summary line ─────────────────────────── */}
                {/* <p className="text-xs text-slate-400">
                  {filteredLedgerGroups.length === ledgerGroups.length
                    ? <>Showing all <strong className="text-slate-600">{ledgerGroups.length}</strong> rows for <strong className="text-slate-600">{periodLabel}</strong>.</>
                    : <>Showing <strong className="text-slate-600">{filteredLedgerGroups.length}</strong> of <strong className="text-slate-600">{ledgerGroups.length}</strong> total rows · <strong className="text-slate-600">{periodLabel}</strong>. Adjust or clear filters to see more.</>
                  }
                </p> */}



              </div>
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Table ───────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              ) : filteredLedgerGroups.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No sales ledger rows found</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {ledgerGroups.length > 0
                      ? 'Adjust your filters or period.'
                      : 'Allocate trucks in inventory or click "Record Payment" to create the first row.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[48px] min-w-[48px] whitespace-nowrap">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[110px] min-w-[110px] whitespace-nowrap">PFI</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[160px] min-w-[160px] whitespace-nowrap">Allocation Code</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[120px] min-w-[120px] whitespace-nowrap">Truck No.</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[180px] min-w-[180px] whitespace-nowrap">Customer</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">Date Loaded</TableHead> */}
                        {/* <TableHead className="font-semibold text-slate-700">Depot</TableHead> */}
                        <TableHead className="font-semibold text-slate-700 w-[150px] min-w-[150px] whitespace-nowrap">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[130px] min-w-[130px] whitespace-nowrap">Quantity</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right w-[120px] min-w-[120px] whitespace-nowrap">Rate</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-right w-[130px] min-w-[130px] whitespace-nowrap">Expected</TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-right w-[130px] min-w-[130px] whitespace-nowrap">Payment</TableHead>
                        <TableHead className="font-semibold text-red-700 text-right w-[130px] min-w-[130px] whitespace-nowrap">Balance</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[170px] min-w-[170px] whitespace-nowrap">Payer</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[180px] min-w-[180px] whitespace-nowrap">Bank</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[120px] min-w-[120px] whitespace-nowrap">Paid On</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[100px] min-w-[100px] whitespace-nowrap text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        let serial = 0;
                        const rows: React.ReactNode[] = [];

                        filteredLedgerGroups.forEach(group => {
                          const theme = getCodeTheme(group.code);
                          const hasSetupDetails = !!(group.customerId && group.location && group.quantity && (group.expected > 0 || group.isFillingStation));

                          serial += 1;
                          rows.push(
                            <TableRow
                              key={`${group.key}-main`}
                              className={`cursor-pointer hover:bg-slate-50/80 border-b border-slate-200/70 border-l-[3px] transition-colors ${theme ? theme.row : 'border-l-transparent'} ${expandedGroupKeys.has(group.key) ? 'bg-slate-50/50' : ''}`}
                              onClick={() => toggleGroupExpanded(group.key)}
                            >
                              <TableCell className="text-slate-500 text-center w-[48px] min-w-[48px] whitespace-nowrap">{serial}</TableCell>
                              <TableCell className="w-[110px] min-w-[110px] whitespace-nowrap">
                                {group.pfiNumber ? (
                                  <span className="text-sm font-semibold text-slate-700">{group.pfiNumber}</span>
                                ) : <span className="text-slate-300">—</span>}
                              </TableCell>
                              <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">
                                {group.allocationCode ? (
                                  <span className="text-sm font-semibold text-slate-700">{group.allocationCode}</span>
                                ) : <span className="text-slate-300">—</span>}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-900 w-[120px] min-w-[120px] whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Truck size={13} className="text-amber-700" />
                                  {group.truckNumber || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-slate-900 uppercase w-[180px] min-w-[180px] whitespace-nowrap">{group.customerName || '—'}</TableCell>
                              <TableCell className="text-slate-700 text-sm w-[150px] min-w-[150px] uppercase whitespace-nowrap">{group.location || '—'}</TableCell>
                              <TableCell className="text-slate-700 w-[130px] min-w-[130px] whitespace-nowrap">{group.quantity > 0 ? `${fmtQty(group.quantity)} Litres` : '—'}</TableCell>
                              <TableCell className="text-right text-slate-700 w-[120px] min-w-[120px] whitespace-nowrap">{group.rate > 0 ? fmt(group.rate) : '—'}</TableCell>
                              <TableCell className="text-right font-medium text-slate-800 w-[130px] min-w-[130px] whitespace-nowrap">{group.expected > 0 ? fmt(group.expected) : ' '}</TableCell>
                              <TableCell className="text-right font-bold text-emerald-700 w-[130px] min-w-[130px] whitespace-nowrap">
                                {fmt(toNum(group.totalPaid))}
                              </TableCell>
                              <TableCell className={`text-right font-bold w-[130px] min-w-[130px] whitespace-nowrap ${group.balance > 0 ? 'text-red-600' : group.balance < 0 ? 'text-blue-600' : group.expected > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {group.expected > 0
                                  ? (group.balance === 0 ? '₦0' : group.balance > 0 ? fmt(group.balance) : `+${fmt(Math.abs(group.balance))}`)
                                  : (group.isFillingStation ? ' ' : ' ')}
                              </TableCell>
                              <TableCell className="text-slate-700 w-[170px] min-w-[170px] whitespace-nowrap">
                                {group.payments.length === 0 ? (
                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                    No payment yet
                                  </span>
                                ) : ' '}
                              </TableCell>
                              <TableCell className="text-sm w-[180px] min-w-[180px] whitespace-nowrap"> </TableCell>
                              <TableCell className="text-slate-600 w-[120px] min-w-[120px] whitespace-nowrap text-sm"> </TableCell>
                              <TableCell className="w-[100px] min-w-[100px] whitespace-nowrap text-center">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1.5 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-semibold"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupExpanded(group.key);
                                  }}
                                >
                                  {expandedGroupKeys.has(group.key) ? (
                                    <>Close <ChevronUp size={12} /></>
                                  ) : (
                                    <>Manage <ChevronDown size={12} /></>
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );

                          if (expandedGroupKeys.has(group.key)) {
                            rows.push(
                              <TableRow key={`${group.key}-detail`} className="bg-slate-50/30 border-b border-slate-200">
                                <TableCell colSpan={15} className="p-4">
                                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                                    <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Control Panel</span>
                                          {group.allocationCode && (
                                            <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                                              {group.allocationCode}
                                            </span>
                                          )}
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                          <Truck size={14} className="text-slate-500" />
                                          Manage Cycle for {group.truckNumber}
                                        </h4>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs text-slate-500">Date Loaded: <span className="font-semibold text-slate-700">{group.dateLoaded ? format(parseISO(group.dateLoaded), 'dd MMM yyyy') : '—'}</span></p>
                                        <p className="text-xs text-slate-500">Depot Loaded: <span className="font-semibold text-slate-700">{group.depot || '—'}</span></p>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-slate-100 bg-slate-50/10">
                                      <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-2xs">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Revenue</p>
                                        <p className="text-lg font-extrabold text-slate-800 mt-1">{group.expected > 0 ? fmt(group.expected) : '—'}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Quantity: {group.quantity > 0 ? `${fmtQty(group.quantity)} Litres` : '—'} @ {group.rate > 0 ? fmt(group.rate) : '—'}</p>
                                      </div>

                                      <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-2xs">
                                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Total Paid</p>
                                        <p className="text-lg font-extrabold text-emerald-700 mt-1">{fmt(group.totalPaid)}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Payments: {group.payments.length} received</p>
                                      </div>

                                      <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-2xs">
                                        <p className={`text-[10px] font-bold uppercase tracking-wider ${group.balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>Balance Due</p>
                                        <p className={`text-lg font-extrabold mt-1 ${group.balance > 0 ? 'text-red-600' : group.balance < 0 ? 'text-blue-600' : group.expected > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                          {group.expected > 0
                                            ? (group.balance === 0 ? '₦0.00' : group.balance > 0 ? fmt(group.balance) : `+${fmt(Math.abs(group.balance))}`)
                                            : '₦0.00'
                                          }
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                          {group.balance > 0 ? 'Outstanding collection' : group.balance < 0 ? 'Overpaid balance' : 'Fully settled'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/30 px-5 py-4">
                                      <div className="text-xs text-slate-500">
                                        Customer: <span className="font-semibold text-slate-700 uppercase">{group.customerName || '—'}</span> ·
                                        Destination: <span className="font-semibold text-slate-700 uppercase">{group.location || '—'}</span>
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        {!readOnly && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-9 text-xs gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs font-semibold"
                                              onClick={(e) => { e.stopPropagation(); openSetupDialog(group); }}
                                              title="Assign customer, destination, allocation code and transfer options"
                                            >
                                              <UserPlus size={14} className="text-slate-500" /> Row Setup
                                            </Button>

                                            {hasSetupDetails ? (
                                              <>
                                                <Button
                                                  size="sm"
                                                  className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                                                  onClick={(e) => { e.stopPropagation(); openQuickPaymentDialog(group); }}
                                                  title="Quick payment for this customer"
                                                >
                                                  <Plus size={14} /> Add Payment
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-9 text-xs gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs font-semibold"
                                                  onClick={(e) => { e.stopPropagation(); group.loadingId ? openPaymentDialog(String(group.loadingId)) : openPaymentDialog(); }}
                                                  title="Add a different customer to this truck cycle"
                                                >
                                                  <UserPlus size={14} className="text-slate-500" /> New Customer
                                                </Button>
                                              </>
                                            ) : (
                                              <Button
                                                size="sm"
                                                className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                                                onClick={(e) => { e.stopPropagation(); group.loadingId ? openPaymentDialog(String(group.loadingId)) : openPaymentDialog(); }}
                                              >
                                                <Plus size={14} /> Add Payment
                                              </Button>
                                            )}

                                            {/* <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-9 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 shadow-2xs font-semibold"
                                              title="Delete truck from records (including linked payments)"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!group.loadingId && group.payments.length === 0) {
                                                  toast({ title: 'No linked records found for this truck row', variant: 'destructive' });
                                                  return;
                                                }
                                                setDeleteTarget({
                                                  ids: group.payments.map(p => p.id),
                                                  loadingId: group.loadingId,
                                                  mode: 'truck',
                                                  label: `${group.truckNumber} — delete truck${group.payments.length > 0 ? ` and ${group.payments.length} payment${group.payments.length > 1 ? 's' : ''}` : ''}`,
                                                });
                                              }}
                                            >
                                              <Trash2 size={14} /> Delete Truck
                                            </Button> */}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          }

                          let cumulative = 0;
                          group.payments.forEach(payment => {
                            cumulative += toNum(payment.payment_amount);
                            const balanceAfter = group.expected - cumulative;
                            const bankParts = payment.bank ? payment.bank.split(' · ') : null;

                            rows.push(
                              <TableRow
                                key={`payment-${payment.id}`}
                                className={`bg-slate-50/40 hover:bg-slate-100/60 border-b border-slate-200/60 border-l-[3px] ${theme ? theme.row : 'border-l-transparent'}`}
                              >
                                <TableCell className="w-[48px] min-w-[48px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[110px] min-w-[110px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[120px] min-w-[120px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[180px] min-w-[180px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[150px] min-w-[150px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[130px] min-w-[130px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[120px] min-w-[120px] whitespace-nowrap"></TableCell>
                                <TableCell className="w-[130px] min-w-[130px] whitespace-nowrap"></TableCell>
                                <TableCell className="text-right font-bold text-emerald-700 w-[130px] min-w-[130px] whitespace-nowrap">{fmt(toNum(payment.payment_amount))}</TableCell>
                                <TableCell className={`text-right font-bold w-[130px] min-w-[130px] whitespace-nowrap ${balanceAfter > 0 ? 'text-red-600' : balanceAfter < 0 ? 'text-blue-600' : group.expected > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                  {group.expected > 0
                                    ? (balanceAfter === 0 ? '₦0' : balanceAfter > 0 ? fmt(balanceAfter) : `+${fmt(Math.abs(balanceAfter))}`)
                                    : (group.isFillingStation ? '-' : ' ')}
                                </TableCell>
                                <TableCell className="text-slate-700 w-[170px] min-w-[170px] whitespace-nowrap">
                                  {payment.payer_name ? (
                                    <div>
                                      <p className="font-medium uppercase">{payment.payer_name}</p>
                                      {payment.phone_number && <p className="text-xs text-slate-500">{payment.phone_number}</p>}
                                    </div>
                                  ) : payment.phone_number ? <span className="text-xs text-slate-500">{payment.phone_number}</span> : ' '}
                                </TableCell>
                                <TableCell className="text-sm w-[180px] min-w-[180px] whitespace-nowrap">
                                  {bankParts ? (
                                    <div>
                                      <p className="font-semibold text-black">{bankParts[0]}</p>
                                      {bankParts[1] && <p className="text-xs text-slate-600">{bankParts[1]}</p>}
                                    </div>
                                  ) : ' '}
                                </TableCell>
                                <TableCell className="text-slate-600 w-[120px] min-w-[120px] whitespace-nowrap text-sm">
                                  {payment.date_of_payment ? format(parseISO(payment.date_of_payment), 'dd MMM yyyy') : ' '}
                                </TableCell>
                                <TableCell className="w-[100px] min-w-[100px] whitespace-nowrap text-center">
                                  <div className="flex gap-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                    {!readOnly && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 text-xs gap-1 border-slate-300"
                                          title="Edit entry"
                                          onClick={() => openEditDialog(payment)}
                                        >
                                          <Pencil size={12} /> Edit
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                                          title="Delete entry"
                                          onClick={() => setDeleteTarget({ ids: [payment.id], mode: 'entry', label: `${group.truckNumber} — ${fmt(toNum(payment.payment_amount))}` })}
                                        >
                                          <Trash2 size={12} /> Delete
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          });
                        });

                        return rows;
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* {!isLoading && filteredSales.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filteredSales.length} of {allSales.length} entries · Period: {periodLabel}
              </p>
            )} */}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Record Payment Dialog                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${assignMode ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                {assignMode
                  ? <UserPlus className="w-5 h-5 text-amber-600" />
                  : <Banknote className="w-5 h-5 text-emerald-600" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold">
                    {assignMode ? 'Assign Customer to Cycle' : 'Record Payment'}
                  </h2>
                  {/* Mode toggle */}
                  <div className="flex items-center rounded-md border border-slate-200 overflow-hidden text-xs font-medium shadow-sm">
                    <button
                      type="button"
                      onClick={() => setAssignMode(false)}
                      className={`px-3 py-1.5 transition-colors ${!assignMode ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      Record Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignMode(true)}
                      className={`px-3 py-1.5 transition-colors ${assignMode ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      Assign Only
                    </button>
                  </div>
                </div>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {assignMode
                    ? 'Link customers to this truck cycle now — add rate & payment later when they pay.'
                    : 'Select a loaded truck, then add one row per customer with their rate and payment details.'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record payments against a loaded truck</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Truck Selector ─────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" /> Select Loaded Truck <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select loaded truck"
                value={dialogTruckLoadingId}
                onChange={e => handleTruckSelect(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a truck…</option>
                {loadedTrucks.map(t => {
                  const plate = t.truck_number || `Truck #${t.truck}`;
                  const custName = t.customer_name || (t.customer ? customerMap.get(t.customer)?.customer_name : '') || '';
                  const qty = toNum(t.quantity_allocated);
                  const statusLabel = t.loading_status === 'offloaded' ? ' [Offloaded]' : '';
                  const cycleKey = getCycleKey(t.truck_number || '', t.date_allocated || '');
                  const cycleInfo = cycleNumberMap.get(cycleKey);
                  const cycle = cyclePaymentSummary.get(cycleKey);
                  const outstanding = cycle ? cycle.totalExpected - cycle.totalPaid : null;
                  const cycleLabel = cycleInfo
                    ? `C${cycleInfo.cycleNum}/${cycleInfo.totalCycles}`
                    : 'C1/1';
                  const dateLabel = normalizeCycleDate(t.date_allocated || '');
                  const pfiValue = getLoadingPfiNumber(t);
                  const pfiLabel = pfiValue ? ` | ${pfiValue}` : '';
                  const outstandingLabel = outstanding !== null
                    ? (outstanding > 0 ? ` | O/S ${fmt(outstanding)}` : ' | Settled')
                    : '';
                  return (
                    <option key={t.id} value={String(t.id)}>
                      {plate} | {cycleLabel} | {dateLabel || '-'}{pfiLabel} | {fmtQty(qty)} L{custName ? ` → ${custName}` : ''}{outstandingLabel}{statusLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* ── Auto-filled truck header ───────────────────────────── */}
            {dialogTruckNumber && (
              <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-3">
                {/* <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
                  Truck Details
                </p> */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Truck:</span>{' '}
                    <span className="font-bold text-slate-800">{dialogTruckNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Depot Loaded:</span>{' '}
                    <span className="font-medium text-slate-800">{dialogDepot || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Date Loaded:</span>{' '}
                    <span className="font-medium text-slate-800">
                      {dialogDateLoaded ? format(parseISO(dialogDateLoaded), 'dd MMM yyyy') : '—'}
                    </span>
                  </div>
                  {(() => {
                    // Show cycle-specific outstanding, plus truck-total if there are multiple cycles
                    const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
                    const cycle = cyclePaymentSummary.get(cycleKey);
                    const truckTotals = truckPaymentSummary.get(dialogTruckNumber);
                    const cycleInfo = cycleNumberMap.get(cycleKey);
                    if (!cycle && !truckTotals) return null;
                    const cycleBal = cycle ? cycle.totalExpected - cycle.totalPaid : null;
                    const truckBal = truckTotals ? truckTotals.totalExpected - truckTotals.totalPaid : null;
                    return (
                      <>
                        {cycleBal !== null && (
                          <div>
                            <span className="text-slate-500 text-xs">
                              {cycleInfo && cycleInfo.totalCycles > 1 ? `Cycle ${cycleInfo.cycleNum} Outstanding:` : 'Outstanding:'}
                            </span>{' '}
                            <span className={`font-bold ${cycleBal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {cycleBal > 0 ? fmt(cycleBal) : '✓ Paid'}
                            </span>
                          </div>
                        )}
                        {cycleInfo && cycleInfo.totalCycles > 1 && truckBal !== null && (
                          <div>
                            <span className="text-slate-500 text-xs">All {cycleInfo.totalCycles} Cycles Total:</span>{' '}
                            <span className={`font-bold ${truckBal > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {truckBal > 0 ? fmt(truckBal) : '✓ Fully settled'}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Cycle / Date Loaded selector ──────────────────────── */}
            {/* ── Code selector ──────────────────────────────────── */}
            {dialogTruckNumber && tripCodes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <Tag size={14} className="text-purple-500" /> Allocation Code
                  <span className="text-xs text-slate-400 font-normal">(optional — group these entries under an allocation code)</span>
                </Label>
                <select
                  aria-label="Select allocation code"
                  value={dialogTripCode}
                  onChange={e => setDialogTripCode(e.target.value)}
                  className={`h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${dialogTripCode ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold' : 'border-input'
                    }`}
                >
                  <option value="">No allocation code (skip)</option>
                  {tripCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                {dialogTripCode && (
                  <p className="text-xs text-purple-600 flex items-center gap-1">
                    <Tag size={10} /> All entries in this batch will be tagged with allocation code <strong>{dialogTripCode}</strong>.
                  </p>
                )}
              </div>
            )}

            {/* ── Per-customer rows ─────────────────────────────────── */}
            {dialogTruckNumber && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Customer ({saleRows.length})
                  </p>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={addSaleRow}
                  >
                    <UserPlus size={13} /> Add Customer
                  </Button>
                </div>

                {saleRows.map((row, idx) => {
                  const custObj = row.customer ? customerMap.get(Number(row.customer)) : null;
                  const isFS = isFillingStation(custObj);
                  const hasError = rowErrors[row.uid] && Object.keys(rowErrors[row.uid]).length;

                  return (
                    <div
                      key={row.uid}
                      className={`border rounded-lg p-3 space-y-3 relative ${hasError ? 'border-red-300 bg-red-50/30' : isFS ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-slate-50/50'}`}
                    >
                      {/* Row header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          {isFS ? <Fuel size={12} className="text-amber-500" /> : null}
                          Customer #{idx + 1}
                          {isFS && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 normal-case tracking-normal">
                              Filling Station
                            </span>
                          )}
                        </span>
                        {saleRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSaleRow(row.uid)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded"
                            title="Remove row"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      {/* Customer + Destination + Qty — always shown */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Customer <span className="text-red-500">*</span></Label>
                          <select
                            aria-label={`Customer for row ${idx + 1}`}
                            value={row.customer}
                            onChange={e => {
                              const custId = e.target.value;
                              const cust = custId ? customerMap.get(Number(custId)) : null;
                              updateSaleRow(row.uid, 'customer', custId);
                              if (cust) updateSaleRow(row.uid, 'customer_name', cust.customer_name);
                            }}
                            className={`h-9 w-full rounded-md border bg-background px-3 py-2 text-sm ${rowErrors[row.uid]?.customer ? 'border-red-400 bg-red-50' : 'border-input'}`}
                          >
                            <option value="">Select customer…</option>
                            {customers.map(c => (
                              <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                            ))}
                          </select>
                          {rowErrors[row.uid]?.customer && <p className="text-[11px] text-red-500">{rowErrors[row.uid].customer}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Destination <span className="text-red-500">*</span></Label>
                          <Input
                            placeholder="e.g. Kano, Abuja…"
                            className={`h-9 text-sm ${rowErrors[row.uid]?.location ? 'border-red-400 bg-red-50' : ''}`}
                            value={row.location}
                            onChange={e => updateSaleRow(row.uid, 'location', e.target.value)}
                          />
                          {rowErrors[row.uid]?.location && <p className="text-[11px] text-red-500">{rowErrors[row.uid].location}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Quantity (L)</Label>
                          <Input
                            type="text" inputMode="decimal" placeholder="e.g. 33,000"
                            className="h-9 text-sm"
                            value={row.quantity}
                            onChange={e => updateSaleRow(row.uid, 'quantity', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Assign-only hint */}
                      {assignMode && (
                        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                          <UserPlus size={14} className="text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-700">
                            <><span className="font-semibold">Assign Only</span> — customer linked to this cycle now. Edit the entry later to add rate and payment once they pay.</>

                            {/* Filling-station hint (non-assign mode) */}
                            {!assignMode && isFS && (
                              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                <Fuel size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-700">
                                  <span className="font-semibold">Filling Station</span> — quantity allocated here. Rate and daily payments are recorded on the Filling Stations page.
                                </p>
                              </div>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Rate + Expected + Payment — payment mode */}
                      {!assignMode && !isFS && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600 flex items-center gap-1">
                              Rate (₦/L) <span className="text-red-500">*</span>
                              {row.rateLocked && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                  <FileText size={9} /> Locked
                                </span>
                              )}
                            </Label>
                            <Input
                              type="text" inputMode="decimal" placeholder="e.g. 1,210"
                              className={`h-9 text-sm ${row.rateLocked ? 'bg-amber-50 text-amber-800 font-semibold cursor-not-allowed' : rowErrors[row.uid]?.rate ? 'border-red-400 bg-red-50' : ''}`}
                              value={row.rate}
                              readOnly={row.rateLocked}
                              onChange={e => updateSaleRow(row.uid, 'rate', e.target.value)}
                              title={row.rateLocked ? `Rate locked at ₦${row.rate}/L from first entry for this customer` : undefined}
                            />
                            {rowErrors[row.uid]?.rate && <p className="text-[11px] text-red-500">{rowErrors[row.uid].rate}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Expected (₦)</Label>
                            <Input
                              readOnly
                              className="h-9 text-sm bg-white font-semibold text-slate-700"
                              value={row.sales_value ? `₦${row.sales_value}` : '—'}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Amount Paid (₦)</Label>
                            <Input
                              type="text" inputMode="decimal"
                              className="h-9 text-sm"
                              value={row.payment_amount}
                              onChange={e => updateSaleRow(row.uid, 'payment_amount', e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* Payment date + Payer + Bank — payment mode */}
                      {!assignMode && !isFS && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">
                              <CalendarIcon size={11} className="inline mr-1" />Date of Payment <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="date"
                              className={`h-9 text-sm ${rowErrors[row.uid]?.date_of_payment ? 'border-red-400 bg-red-50' : ''}`}
                              value={row.date_of_payment}
                              onChange={e => updateSaleRow(row.uid, 'date_of_payment', e.target.value)}
                            />
                            {rowErrors[row.uid]?.date_of_payment && <p className="text-[11px] text-red-500">{rowErrors[row.uid].date_of_payment}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">Payer's Name</Label>
                            <Input
                              className={`h-9 text-sm ${rowErrors[row.uid]?.payer_name ? 'border-red-400 bg-red-50' : ''}`}
                              value={row.payer_name}
                              onChange={e => {
                                const cleaned = e.target.value.replace(/[0-9]/g, '');
                                updateSaleRow(row.uid, 'payer_name', cleaned);
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-600">
                              <Building2 size={11} className="inline mr-1" />Bank Account <span className="text-red-500">*</span>
                            </Label>
                            <select
                              aria-label={`Bank account for row ${idx + 1}`}
                              value={row.bank_account_id}
                              onChange={e => updateSaleRow(row.uid, 'bank_account_id', e.target.value)}
                              className={`h-9 w-full rounded-md border bg-background px-3 py-2 text-sm ${rowErrors[row.uid]?.bank_account_id ? 'border-red-400 bg-red-50' : 'border-input'}`}
                            >
                              <option value="">Select account…</option>
                              {activeBankAccounts.map(b => (
                                <option key={b.id} value={String(b.id)}>
                                  {b.account_number} · {b.bank_name}
                                </option>
                              ))}
                            </select>
                            {rowErrors[row.uid]?.bank_account_id && <p className="text-[11px] text-red-500">{rowErrors[row.uid].bank_account_id}</p>}
                          </div>
                        </div>
                      )}

                      {/* Phone + Remarks — always shown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Phone Number</Label>
                          <Input
                            placeholder="e.g. 08012345678"
                            className="h-9 text-sm"
                            value={row.phone_number}
                            onChange={e => updateSaleRow(row.uid, 'phone_number', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Remarks</Label>
                          <Input
                            placeholder={isFS ? 'e.g. Awaiting sale…' : 'e.g. Partial Payment, Full Payment…'}
                            className="h-9 text-sm"
                            value={row.remarks}
                            onChange={e => updateSaleRow(row.uid, 'remarks', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── Grand Total Summary ──────────────────────────── */}
                {(() => {
                  const grandExpected = saleRows.reduce((s, r) => s + (Number(stripCommas(r.sales_value)) || 0), 0);
                  const grandPayment = saleRows.reduce((s, r) => s + (Number(stripCommas(r.payment_amount)) || 0), 0);
                  // Use cycle-scoped previously-paid (not whole-truck)
                  const cycleKey = getCycleKey(dialogTruckNumber, dialogDateLoaded);
                  const cycle = cyclePaymentSummary.get(cycleKey);
                  const previouslyPaid = cycle?.totalPaid || 0;
                  if (!grandExpected && !grandPayment) return null;
                  return (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-1">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Grand Total (all rows)</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {grandExpected > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Total Expected</p>
                            <p className="font-bold text-slate-800">{fmt(grandExpected)}</p>
                          </div>
                        )}
                        {grandPayment > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">This Payment</p>
                            <p className="font-bold text-emerald-700">{fmt(grandPayment)}</p>
                          </div>
                        )}
                        {previouslyPaid > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Previously Paid</p>
                            <p className="font-medium text-slate-600">{fmt(previouslyPaid)}</p>
                          </div>
                        )}
                        {grandExpected > 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Balance After</p>
                            {(() => {
                              const bal = grandExpected - previouslyPaid - grandPayment;
                              return (
                                <p className={`font-bold ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {bal > 0 ? fmt(bal) + ' remaining' : '✓ Fully paid'}
                                </p>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Saving…' : `Record ${saleRows.filter(r => r.customer).length || ''} Payment${saleRows.filter(r => r.customer).length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!setupTarget} onOpenChange={open => { if (!open) setSetupTarget(null); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <UserPlus className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Row Setup</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {setupTarget ? `${setupTarget.truckNumber} · ${setupTarget.dateLoaded ? format(parseISO(setupTarget.dateLoaded), 'dd MMM yyyy') : 'No date'}` : 'Assign customer and destination'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Setup customer, destination, code and transfer for selected row</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer</Label>
                <select
                  aria-label="Setup customer"
                  value={setupCustomer}
                  onChange={e => setSetupCustomer(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select customer…</option>
                  {customers.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Destination</Label>
                <Input
                  value={setupDestination}
                  onChange={e => setSetupDestination(e.target.value)}
                  placeholder="e.g. Kano, Abuja"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Allocation Code</Label>
              <select
                aria-label="Setup allocation code"
                value={setupCode}
                onChange={e => setSetupCode(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No allocation code</option>
                {tripCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>

            {setupTarget && setupTarget.balance < 0 && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Transfer Overpayment</p>
                <p className="text-xs text-blue-700">Available: {fmt(Math.abs(setupTarget.balance))}</p>
                <div className="space-y-1">
                  <Label>Transfer To</Label>
                  <select
                    aria-label="Setup transfer target"
                    value={setupTransferTargetKey}
                    onChange={e => setSetupTransferTargetKey(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select target row…</option>
                    {ledgerGroups
                      .filter(group => group.key !== setupTarget.key)
                      .map(group => (
                        <option key={group.key} value={group.key}>
                          {group.truckNumber} · {group.customerName || 'Customer pending'} · Bal {group.expected > 0 ? fmt(group.balance) : '—'}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Transfer Amount</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={setupTransferAmount}
                    onChange={e => setSetupTransferAmount(formatWithCommas(e.target.value))}
                    placeholder="e.g. 1,000,000"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSetupTransfer}
                    disabled={setupTransferSaving}
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    {setupTransferSaving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                    {setupTransferSaving ? 'Transferring…' : 'Transfer Now'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupTarget(null)} disabled={setupSaving}>Cancel</Button>
            <Button onClick={handleSaveSetup} disabled={setupSaving} className="gap-2">
              {setupSaving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {setupSaving ? 'Saving…' : 'Save Setup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!quickPaymentTarget} onOpenChange={open => { if (!open) setQuickPaymentTarget(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Add Payment</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {quickPaymentTarget
                    ? `${quickPaymentTarget.truckNumber} · ${quickPaymentTarget.customerName || 'Customer pending'}${quickPaymentTarget.code ? ` · ${quickPaymentTarget.code}` : ''}`
                    : 'Record another payment for this row'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Record a follow-up payment for an existing row</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {quickPaymentTarget && (() => {
              const amountTyped = Number(stripCommas(quickPaymentForm.payment_amount)) || 0;
              const remainingBalance = quickPaymentTarget.balance - amountTyped;
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-2">
                  <div className="grid grid-cols-2 gap-3 pb-2 border-b border-dashed border-slate-200">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Expected</p>
                      <p className="font-bold text-slate-800 mt-0.5">{quickPaymentTarget.expected > 0 ? fmt(quickPaymentTarget.expected) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Current Balance</p>
                      <p className={`font-bold mt-0.5 ${quickPaymentTarget.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {quickPaymentTarget.expected > 0 ? (quickPaymentTarget.balance > 0 ? fmt(quickPaymentTarget.balance) : 'Fully Paid ✓') : '—'}
                      </p>
                    </div>
                  </div>
                  {amountTyped > 0 && (
                    <div className="grid grid-cols-2 gap-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div>
                        <p className="text-xs text-indigo-500 font-semibold">Payment Preview</p>
                        <p className="font-extrabold text-indigo-600 mt-0.5">{fmt(amountTyped)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">New Balance After</p>
                        <p className={`font-extrabold mt-0.5 ${
                          remainingBalance === 0 
                            ? 'text-emerald-600' 
                            : remainingBalance > 0 
                              ? 'text-red-600' 
                              : 'text-blue-600'
                        }`}>
                          {remainingBalance === 0 
                            ? 'Fully Settled ✓' 
                            : remainingBalance > 0 
                              ? fmt(remainingBalance) 
                              : `+${fmt(Math.abs(remainingBalance))} Overpaid`
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount Paid</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={quickPaymentForm.payment_amount}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, payment_amount: formatWithCommas(e.target.value) }))}
                  placeholder="e.g. 5,000,000"
                />
              </div>
              <div className="space-y-1">
                <Label>Date Paid</Label>
                <Input
                  type="date"
                  value={quickPaymentForm.date_of_payment}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, date_of_payment: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payer's Name</Label>
                <Input
                  value={quickPaymentForm.payer_name}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, payer_name: e.target.value.replace(/[0-9]/g, '') }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Phone Number</Label>
                <Input
                  value={quickPaymentForm.phone_number}
                  onChange={e => setQuickPaymentForm(prev => ({ ...prev, phone_number: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Bank Account</Label>
              <select
                aria-label="Quick payment bank account"
                value={quickPaymentForm.bank_account_id}
                onChange={e => setQuickPaymentForm(prev => ({ ...prev, bank_account_id: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select account…</option>
                {activeBankAccounts.map(b => (
                  <option key={b.id} value={String(b.id)}>
                    {b.account_number} · {b.bank_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickPaymentTarget(null)} disabled={quickPaymentSaving}>
              Cancel
            </Button>
            <Button onClick={handleQuickPaymentSave} disabled={quickPaymentSaving} className="gap-2">
              {quickPaymentSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {quickPaymentSaving ? 'Saving…' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Edit Entry Dialog                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) { setEditTarget(null); setEditForm(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Pencil className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Edit Entry</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  {editTarget?.truck_number} — {editTarget ? (editTarget.customer_name || `Customer #${editTarget.customer}`) : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Edit a sales ledger entry</DialogDescription>
          </DialogHeader>

          {editForm && editTarget && (() => {
            const rateIsLocked = toNum(editTarget.rate) > 0;

            // All known loading dates for this truck — from inventory records
            const truckCycleDates = truckLoadingDates.get(editTarget.truck_number) || [];
            // Also include the entry's current date_loaded if not already in the list
            const allEditDates = editTarget.date_loaded && !truckCycleDates.includes(editTarget.date_loaded)
              ? [...truckCycleDates, editTarget.date_loaded].sort()
              : truckCycleDates;
            const editIsCustomDate = editForm.date_loaded !== '' &&
              !allEditDates.includes(editForm.date_loaded) &&
              editForm.date_loaded !== editTarget.date_loaded;

            return (
              <div className="space-y-4 py-2">
                {/* Info banner for filling-station rows with no rate yet */}
                {(!toNum(editTarget.rate) || !toNum(editTarget.sales_value)) && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Fuel size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      This entry has no rate or revenue yet — fill them in below now that the station has sold.
                    </p>
                  </div>
                )}
                {/* Lock notice */}
                {/* {(rateIsLocked || dopIsLocked) && (
                <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-400 mt-0.5 shrink-0">🔒</span>
                  <p className="text-xs text-slate-500">
                    {[
                      rateIsLocked && 'Rate is locked once set.',
                      dopIsLocked  && 'Date of payment is locked once recorded.',
                    ].filter(Boolean).join(' ')}
                  </p>
                </div>
              )} */}

                {/* Cycle / Date Loaded — always visible */}
                {/* Row 1: Destination + Qty */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Destination</Label>
                    <Input
                      value={editForm.location}
                      onChange={e => setEditForm(f => f ? { ...f, location: e.target.value } : f)}
                      className="h-9 text-sm"
                      placeholder="e.g. Kano"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Quantity (L)</Label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.quantity}
                      onChange={e => {
                        const qty = formatWithCommas(e.target.value);
                        const r = Number(stripCommas(editForm.rate)) || 0;
                        const q = Number(stripCommas(qty)) || 0;
                        const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                        setEditForm(f => f ? { ...f, quantity: qty, sales_value: sv } : f);
                      }}
                      className="h-9 text-sm"
                      placeholder="e.g. 33,000"
                    />
                  </div>
                </div>

                {/* Code */}
                {tripCodes.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                      <Tag size={11} className="text-purple-500" /> Code
                    </Label>
                    <select
                      aria-label="Code"
                      value={editTripCode}
                      onChange={e => setEditTripCode(e.target.value)}
                      className={`h-9 w-full rounded-md border bg-background px-3 py-1 text-sm ${editTripCode ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold' : 'border-input'
                        }`}
                    >
                      <option value="">No code</option>
                      {tripCodes.map(code => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Row 2: Rate + Expected */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      Rate (₦/L){rateIsLocked && <span className="text-slate-400"></span>}
                    </Label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.rate}
                      disabled={rateIsLocked}
                      onChange={e => {
                        if (rateIsLocked) return;
                        const rate = formatWithCommas(e.target.value);
                        const r = Number(stripCommas(rate)) || 0;
                        const q = Number(stripCommas(editForm.quantity)) || 0;
                        const sv = q && r ? formatWithCommas(String(q * r)) : editForm.sales_value;
                        setEditForm(f => f ? { ...f, rate, sales_value: sv } : f);
                      }}
                      className={`h-9 text-sm ${rateIsLocked ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
                      placeholder="e.g. 1,210"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Total Expected (₦)</Label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.sales_value}
                      onChange={e => setEditForm(f => f ? { ...f, sales_value: formatWithCommas(e.target.value) } : f)}
                      className="h-9 text-sm font-semibold"
                      placeholder="Auto-computed or manual"
                    />
                  </div>
                </div>

                {/* Row 3: Payment + Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Amount Paid (₦)</Label>
                    <Input
                      type="text" inputMode="decimal"
                      value={editForm.payment_amount}
                      onChange={e => setEditForm(f => f ? { ...f, payment_amount: formatWithCommas(e.target.value) } : f)}
                      className="h-9 text-sm"
                      placeholder="e.g. 5,000,000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600 flex items-center gap-1">
                      Date of Payment
                    </Label>
                    <Input
                      type="date"
                      value={editForm.date_of_payment}
                      onChange={e => setEditForm(f => f ? { ...f, date_of_payment: e.target.value } : f)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Row 4: Payer + Bank */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Payer's Name</Label>
                    <Input
                      value={editForm.payer_name}
                      onChange={e => setEditForm(f => f ? { ...f, payer_name: e.target.value.replace(/[0-9]/g, '') } : f)}
                      className="h-9 text-sm"
                      placeholder="Name only"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Bank Account</Label>
                    <select
                      aria-label="Bank account"
                      value={editForm.bank_account_id}
                      onChange={e => setEditForm(f => f ? { ...f, bank_account_id: e.target.value } : f)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">Select account…</option>
                      {BANK_ACCOUNTS.filter(b => b.is_active).map(b => (
                        <option key={b.id} value={String(b.id)}>
                          {b.account_number} · {b.bank_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 5: Phone + Remarks */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Phone Number</Label>
                    <Input
                      value={editForm.phone_number}
                      onChange={e => setEditForm(f => f ? { ...f, phone_number: e.target.value } : f)}
                      className="h-9 text-sm"
                      placeholder="e.g. 08012345678"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Remarks</Label>
                    <Input
                      value={editForm.remarks}
                      onChange={e => setEditForm(f => f ? { ...f, remarks: e.target.value } : f)}
                      className="h-9 text-sm"
                      placeholder="e.g. Full Payment"
                    />
                  </div>
                </div>

                {/* Live balance preview */}
                {editForm.sales_value && (
                  (() => {
                    const sv = Number(stripCommas(editForm.sales_value)) || 0;
                    const pa = Number(stripCommas(editForm.payment_amount)) || 0;
                    // Sum all other payments for this truck+customer within the same cycle only.
                    const currentCycleKey = getCycleKey(editTarget.truck_number, editTarget.date_loaded);
                    const otherPaid = allSales
                      .filter(s =>
                        s.id !== editTarget.id &&
                        s.customer === editTarget.customer &&
                        getCycleKey(s.truck_number, s.date_loaded) === currentCycleKey,
                      )
                      .reduce((sum, s) => sum + toNum(s.payment_amount), 0);
                    const bal = sv - pa - otherPaid;
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-slate-400">Expected</p>
                          <p className="font-bold text-slate-800">{sv > 0 ? fmt(sv) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Total Paid</p>
                          <p className="font-bold text-emerald-700">{fmt(pa + otherPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Balance</p>
                          <p className={`font-bold ${bal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {bal > 0 ? fmt(bal) : '✓ Fully paid'}
                          </p>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Confirm Delete</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
