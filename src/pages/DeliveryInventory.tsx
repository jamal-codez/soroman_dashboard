import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
  Plus, Search, Download, Loader2, Trash2,
  Truck, DropletIcon, FileText, Package,
  CheckCircle2, AlertTriangle,
  CalendarDays, X, Fuel, ChevronDown, ChevronRight,
  Tag, Pencil, Settings,
} from 'lucide-react';
import {
  format, parseISO, isWithinInterval, startOfDay, endOfDay,
  subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
} from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { isCurrentUserReadOnly } from '@/roles';

// ═══════════════════════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════════════════════

interface FleetTruck {
  id: number;
  plate_number: string;
  driver_name: string;
  driver_phone?: string;
  max_capacity?: number;
  is_active?: boolean;
  truck_status?: string;
}

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  status: string;
  outstanding_limit?: string | number | null;
  customer_type?: 'customer' | 'filling_station';
  notes?: string;
}

interface DeliverySale {
  id: number;
  truck_number: string;
  date_loaded: string;
  customer: number;
  customer_name?: string;
  rate: string | number;
  sales_value: string | number;
  quantity: string | number;
  location?: string;
}

interface BackendPfi {
  id: number;
  pfi_number: string;
  status: 'active' | 'finished';
  location_name?: string;
  product_name?: string;
  product_unit?: string;
  product_unit_label?: string;
  starting_qty_litres?: number;
  sold_qty_litres?: number;
}

const UNIT_LABELS: Record<string, string> = { litres: 'Litres', kg: 'kg', ton: 'ton' };
const getPfiUnitLabel = (pfi?: BackendPfi | null): string =>
  pfi?.product_unit_label || UNIT_LABELS[(pfi?.product_unit || 'litres').toLowerCase()] || 'Litres';

interface InventoryEntry {
  id: number;
  truck: number | null;
  truck_number?: string;
  pfi: number | null;
  pfi_number?: string;
  pfi_product?: string;
  depot?: string;
  customer: number | null;
  customer_name?: string;
  quantity_allocated: number | string;
  date_allocated: string;
  date_offloaded?: string | null;
  loading_status?: 'loaded' | 'offloaded' | 'empty';
  created_by?: string;
  offloaded_by?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
  location?: string;
  pfi_location?: string;
  allocation_code?: string;
}

const LEGACY_FS_PREFIX = '__type:filling_station__';
const isFillingStation = (c: DeliveryCustomer | undefined | null): boolean =>
  c?.customer_type === 'filling_station' ||
  (c?.customer_type == null && !!c?.notes?.startsWith(LEGACY_FS_PREFIX));

const normalizeCycleDate = (dateValue: string | undefined | null): string => {
  if (!dateValue) return '';
  const raw = String(dateValue).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return format(parseISO(raw), 'yyyy-MM-dd');
  } catch {
    return raw.split('T')[0] || raw;
  }
};

const getCycleKey = (truckNum: string, dateLoaded: string | undefined | null): string =>
  `${(truckNum || '').trim().toUpperCase()}||${normalizeCycleDate(dateLoaded)}`;

/** Enriched row — every row is a truck record */
type TruckRecord = InventoryEntry & {
  status: 'loaded' | 'offloaded' | 'empty';
  truckPlate: string;
  driverName: string;
  destination: string;
  depotDisplay: string;
  custName: string;
  pfiLabel: string;
  product: string;
  unitLabel: string;
  qty: number;
  code: string;
  isFillingStation: boolean;
};

/** Full edit target */
interface EditTarget {
  id: number;
  truckPlate: string;
  currentCode: string;
  currentPfi: string;
  currentDepot: string;
  currentDate: string;
  currentLocation: string;
}

type PagedResponse<T> = { count: number; results: T[] };
type StatusFilter = 'all' | 'active' | 'delivered';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

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

const inferStatus = (entry: InventoryEntry): 'loaded' | 'offloaded' | 'empty' => {
  if (entry.loading_status) return entry.loading_status;
  if (entry.date_offloaded) return 'offloaded';
  if (toNum(entry.quantity_allocated) > 0) return 'loaded';
  return 'empty';
};

const statusBadge = {
  loaded: {
    label: 'Loaded',
    cls: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: Truck,
  },
  offloaded: {
    label: 'Sold',
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
  },
  empty: {
    label: 'Empty',
    cls: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: Package,
  },
} as const;

const CODE_PALETTE = [
  { row: 'bg-sky-50/60 border-l-sky-400', badge: 'bg-sky-100 text-sky-800 border-sky-200', header: 'bg-sky-50 border-sky-200' },
  { row: 'bg-emerald-50/60 border-l-emerald-400', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', header: 'bg-emerald-50 border-emerald-200' },
  { row: 'bg-orange-50/60 border-l-orange-400', badge: 'bg-orange-100 text-orange-800 border-orange-200', header: 'bg-orange-50 border-orange-200' },
  { row: 'bg-violet-50/60 border-l-violet-400', badge: 'bg-violet-100 text-violet-800 border-violet-200', header: 'bg-violet-50 border-violet-200' },
  { row: 'bg-pink-50/60 border-l-pink-400', badge: 'bg-pink-100 text-pink-800 border-pink-200', header: 'bg-pink-50 border-pink-200' },
  { row: 'bg-amber-50/60 border-l-amber-400', badge: 'bg-amber-100 text-amber-800 border-amber-200', header: 'bg-amber-50 border-amber-200' },
  { row: 'bg-teal-50/60 border-l-teal-400', badge: 'bg-teal-100 text-teal-800 border-teal-200', header: 'bg-teal-50 border-teal-200' },
  { row: 'bg-indigo-50/60 border-l-indigo-400', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', header: 'bg-indigo-50 border-indigo-200' },
];

const getCodeTheme = (code: string) => {
  if (!code) return null;
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return CODE_PALETTE[hash % CODE_PALETTE.length];
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliveryInventory() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const readOnly = isCurrentUserReadOnly();

  // ── Filters & Search ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pfiFilter, setPfiFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [truckFilter, setTruckFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'filling_station' | 'normal'>('all');

  // ── Allocation Codes (managed list stored in localStorage / backend sync) ──
  const [deliveryCodes, setDeliveryCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_trip_codes') || '[]'); } catch { return []; }
  });
  const [loadingCodeMap, setLoadingCodeMap] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dsl_loading_code_map') || '{}'); } catch { return {}; }
  });
  const [manageCodesOpen, setManageCodesOpen] = useState(false);
  const [newManageCode, setNewManageCode] = useState('');
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  // Inline rename state for Manage Codes dialog
  const [editingCode, setEditingCode] = useState<string | null>(null); // code currently being renamed
  const [editingCodeValue, setEditingCodeValue] = useState('');         // new name being typed
  const [renamingCode, setRenamingCode] = useState(false);              // rename API call in progress

  // ── Collapsed code groups ─────────────────────────────────────────────────
  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());

  // ── Allocate Trucks Dialog state ──────────────────────────────────────────
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [loadPfi, setLoadPfi] = useState('');
  const [loadCode, setLoadCode] = useState('');
  const [loadDepot, setLoadDepot] = useState('');
  const [loadLocation, setLoadLocation] = useState('');
  const [dateAllocated, setDateAllocated] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loadNotes, setLoadNotes] = useState('');
  const [selectedTruckIds, setSelectedTruckIds] = useState<Set<number>>(new Set());
  const [truckSearch, setTruckSearch] = useState('');
  const [saving, setSaving] = useState(false);
  // Inline new code creation
  const [newCodeInput, setNewCodeInput] = useState('');
  const [showNewCodeInput, setShowNewCodeInput] = useState(false);

  // ── Offload Dialog ────────────────────────────────────────────────────────
  const [offloadTarget, setOffloadTarget] = useState<TruckRecord | null>(null);
  const [offloadDate, setOffloadDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [offloading, setOffloading] = useState(false);

  // ── Delete Dialog ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Edit Record Dialog ────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editForm, setEditForm] = useState({ code: '', pfi: '', depot: '', date: '', location: '' });
  const [editSaving, setEditSaving] = useState(false);

  // ── Bulk Selection ────────────────────────────────────────────────────────
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignCode, setBulkAssignCode] = useState('');
  const [bulkAssignPfi, setBulkAssignPfi] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    localStorage.setItem('dsl_trip_codes', JSON.stringify(deliveryCodes));
  }, [deliveryCodes]);

  useEffect(() => {
    localStorage.setItem('dsl_loading_code_map', JSON.stringify(loadingCodeMap));
  }, [loadingCodeMap]);

  // ── Sync with Backend Settings ────────────────────────────────────────────
  const LEDGER_SETTINGS_KEY = 'default';

  const ledgerSettingsQuery = useQuery({
    queryKey: ['delivery-ledger-settings', LEDGER_SETTINGS_KEY],
    queryFn: async () => apiClient.admin.getDeliveryLedgerSettings({ key: LEDGER_SETTINGS_KEY }) as Promise<any>,
    staleTime: 30_000,
  });

  const updateLedgerSettingsMutation = useMutation({
    mutationFn: async (payload: any) =>
      apiClient.admin.updateDeliveryLedgerSettings(payload, { key: LEDGER_SETTINGS_KEY }),
    // NOTE: do NOT invalidate ledger-settings here — that would retrigger hydration
    //       → setLoadingCodeMap → autosave → invalidate → loop
  });

  // ── Inventory query — must be defined BEFORE the effects below that use allEntries ──
  const inventoryQuery = useQuery({
    queryKey: ['delivery-inventory-all'],
    queryFn: async () =>
      safePaged<InventoryEntry>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allEntries = useMemo(() => inventoryQuery.data?.results || [], [inventoryQuery.data]);

  // Hydrate local states from backend — union of:
  //   (a) settings.trip_codes = manually-created codes not yet assigned to any truck
  //   (b) distinct allocation_code values on actual inventory records = ground truth
  useEffect(() => {
    if (!ledgerSettingsQuery.data) return;
    const settings = ledgerSettingsQuery.data;

    const settingsCodes = Array.isArray(settings.trip_codes)
      ? settings.trip_codes.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)
      : [];

    const inventoryCodes = allEntries
      .map(e => (e.allocation_code || '').trim().toUpperCase())
      .filter(Boolean);

    const merged = Array.from(new Set([...settingsCodes, ...inventoryCodes])).sort();
    setDeliveryCodes(prev => (merged.join(',') === prev.join(',') ? prev : merged));

    const backendMap = settings.loading_code_map || {};
    const nextMap: Record<number, string> = {};
    Object.entries(backendMap).forEach(([k, v]) => {
      nextMap[Number(k)] = String(v).trim().toUpperCase();
    });
    // Only update if the map actually changed — prevents unnecessary autosave trigger
    setLoadingCodeMap(prev => {
      const prevSig = JSON.stringify(prev);
      const nextSig = JSON.stringify(nextMap);
      return prevSig === nextSig ? prev : nextMap;
    });
  }, [ledgerSettingsQuery.data, allEntries]);

  // Also keep in sync when inventory entries change (e.g. new truck loaded with a new code)
  useEffect(() => {
    if (!allEntries.length) return;
    const inventoryCodes = allEntries
      .map(e => (e.allocation_code || '').trim().toUpperCase())
      .filter(Boolean);

    setDeliveryCodes(prev => {
      const merged = Array.from(new Set([...prev, ...inventoryCodes])).sort();
      // Only update if something actually changed
      if (merged.join(',') === prev.join(',')) return prev;
      return merged;
    });
  }, [allEntries]);

  // Save manually-created codes (not backed by any inventory record) back to settings
  // Uses a ref-based signature guard to prevent writing when nothing changed
  const lastSavedSettingsSignatureRef = useRef('');
  useEffect(() => {
    if (!ledgerSettingsQuery.data || !allEntries.length) return;

    const inventoryCodes = new Set(
      allEntries.map(e => (e.allocation_code || '').trim().toUpperCase()).filter(Boolean)
    );
    const manualOnlyCodes = deliveryCodes.filter(c => !inventoryCodes.has(c));

    const normalizedMap = Object.fromEntries(
      Object.entries(loadingCodeMap)
        .map(([id, code]) => [String(id), String(code || '').trim().toUpperCase()])
        .filter(([id, code]) => id && code),
    );

    const payload = {
      key: LEDGER_SETTINGS_KEY,
      trip_codes: manualOnlyCodes,
      pfi_code_map: ledgerSettingsQuery.data.pfi_code_map || {},
      loading_code_map: normalizedMap,
      sale_trip_map: ledgerSettingsQuery.data.sale_trip_map || {},
      cycle_alias_map: ledgerSettingsQuery.data.cycle_alias_map || {},
    };

    const signature = JSON.stringify(payload);
    if (signature === lastSavedSettingsSignatureRef.current) return; // nothing changed

    const timer = setTimeout(() => {
      updateLedgerSettingsMutation.mutate(payload, {
        onSuccess: () => { lastSavedSettingsSignatureRef.current = signature; },
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [deliveryCodes, loadingCodeMap, allEntries, ledgerSettingsQuery.data]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Queries (inventoryQuery + allEntries moved above for use in effects)
  // ═══════════════════════════════════════════════════════════════════════════

  // Fetch ALL active fleet trucks — we filter by loaded status client-side
  const trucksQuery = useQuery({
    queryKey: ['fleet-trucks'],
    queryFn: async () =>
      safePaged<FleetTruck>(
        await apiClient.admin.getFleetTrucks({ page_size: 1000 }),
      ),
    staleTime: 60_000,
    refetchInterval: 30_000,
  });
  const allTrucks = useMemo(() => {
    const trucks = trucksQuery.data?.results || [];
    return trucks
      .filter(t => t.is_active !== false)
      .filter(t => !String(t.truck_status || '').toLowerCase().includes('bad'))
      .sort((a, b) => a.plate_number.localeCompare(b.plate_number));
  }, [trucksQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });

  const pfisQuery = useQuery({
    queryKey: ['pfis-for-delivery'],
    queryFn: async () =>
      safePaged<BackendPfi>(
        await apiClient.admin.getPfis({ page_size: 1000 }),
      ),
    staleTime: 60_000,
  });
  const allPfis = useMemo(() => pfisQuery.data?.results || [], [pfisQuery.data]);

  const salesQuery = useQuery({
    queryKey: ['delivery-sales'],
    queryFn: async () =>
      safePaged<DeliverySale>(
        await apiClient.admin.getDeliverySales({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allSales = useMemo(() => salesQuery.data?.results || [], [salesQuery.data]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Lookup Maps
  // ═══════════════════════════════════════════════════════════════════════════

  const truckMap = useMemo(() => {
    const m = new Map<number, FleetTruck>();
    (trucksQuery.data?.results || []).forEach(t => m.set(t.id, t));
    return m;
  }, [trucksQuery.data]);

  const customerMap = useMemo(() => {
    const m = new Map<number, DeliveryCustomer>();
    (customersQuery.data?.results || []).forEach(c => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const pfiMap = useMemo(() => {
    const m = new Map<number, BackendPfi>();
    allPfis.forEach(p => m.set(p.id, p));
    return m;
  }, [allPfis]);

  // Match sales to loaded trucks (by loading record ID) exactly matching Sales Ledger matching logic
  const truckSalesMap = useMemo(() => {
    const map = new Map<number, { customerId: number; customerName: string; qty: number; rates: Set<number>; location: string }[]>();

    const filteredLoadings = allEntries
      .filter(e => !!(e.truck || e.truck_number || e.loading_status));
    const sortedLoadings = [
      ...filteredLoadings.filter(l => !!(l.date_allocated)),
      ...filteredLoadings.filter(l => !(l.date_allocated)),
    ];

    const salesByCycle = new Map<string, DeliverySale[]>();
    const salesByTruck = new Map<string, DeliverySale[]>();
    const cycleAliasMap = ledgerSettingsQuery.data?.cycle_alias_map || {};

    allSales.forEach(sale => {
      if (!sale.truck_number) return;
      const rawKey = getCycleKey(sale.truck_number, sale.date_loaded);
      const cycleKey = cycleAliasMap[rawKey] || rawKey;

      const existingCycle = salesByCycle.get(cycleKey) ?? [];
      existingCycle.push(sale);
      salesByCycle.set(cycleKey, existingCycle);

      const truckKey = (sale.truck_number || '').trim().toUpperCase();
      const existingTruck = salesByTruck.get(truckKey) ?? [];
      existingTruck.push(sale);
      salesByTruck.set(truckKey, existingTruck);
    });

    const matchedSaleIds = new Set<number>();

    sortedLoadings.forEach(loading => {
      const rawKey = getCycleKey(loading.truck_number || '', loading.date_allocated || '');
      const cycleKey = cycleAliasMap[rawKey] || rawKey;

      const cycleSales = salesByCycle.get(cycleKey) || [];
      let payments = cycleSales.filter(sale => !matchedSaleIds.has(sale.id));

      if (payments.length === 0 && !loading.date_allocated) {
        const truckKey = (loading.truck_number || '').trim().toUpperCase();
        const truckSales = salesByTruck.get(truckKey) || [];
        payments = truckSales.filter(sale => !matchedSaleIds.has(sale.id));
      }

      payments.forEach(p => matchedSaleIds.add(p.id));

      const customerGroups: { customerId: number; customerName: string; qty: number; rates: Set<number>; location: string }[] = [];
      payments.forEach(s => {
        const rate = toNum(s.rate);
        const sQty = toNum(s.quantity);
        const sCustId = s.customer ? Number(s.customer) : 0;
        const custEntry = customerGroups.find(e => Number(e.customerId) === sCustId);

        const customerObj = s.customer ? customerMap.get(sCustId) : null;
        const isFS = isFillingStation(customerObj);
        const sLoc = isFS ? (customerObj?.customer_name || s.customer_name || '') : (s.location || '');

        if (custEntry) {
          if (rate > 0) custEntry.rates.add(rate);
          if (sQty > custEntry.qty) custEntry.qty = sQty;
          if (sLoc && !custEntry.location) custEntry.location = sLoc;
        } else {
          customerGroups.push({
            customerId: sCustId,
            customerName: s.customer_name || '',
            qty: sQty,
            rates: rate > 0 ? new Set([rate]) : new Set(),
            location: sLoc,
          });
        }
      });

      map.set(loading.id, customerGroups);
    });

    return map;
  }, [allSales, allEntries, customerMap, ledgerSettingsQuery.data]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Enrich entries into TruckRecord[]
  // ═══════════════════════════════════════════════════════════════════════════

  const truckRecords = useMemo((): TruckRecord[] => {
    return allEntries
      .filter(e => !!(e.truck || e.truck_number || e.loading_status))
      .map(entry => {
        const truck = entry.truck ? truckMap.get(entry.truck) : null;
        const customer = entry.customer ? customerMap.get(entry.customer) : null;
        const pfi = entry.pfi ? pfiMap.get(entry.pfi) : null;
        return {
          ...entry,
          status: inferStatus(entry),
          truckPlate: entry.truck_number || truck?.plate_number || '—',
          driverName: truck?.driver_name || '',
          destination: isFillingStation(customer)
            ? (customer?.customer_name || entry.customer_name || '')
            : (entry.location || ''),
          depotDisplay: entry.depot || entry.pfi_location || pfi?.location_name || '',
          custName: entry.customer_name || customer?.customer_name || '',
          pfiLabel: entry.pfi_number || pfi?.pfi_number || '',
          product: entry.pfi_product || pfi?.product_name || '',
          unitLabel: getPfiUnitLabel(pfi),
          qty: toNum(entry.quantity_allocated),
          code: entry.allocation_code || '',
          isFillingStation: isFillingStation(customer),
        };
      });
  }, [allEntries, truckMap, customerMap, pfiMap]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Filtering & Sorting
  // ═══════════════════════════════════════════════════════════════════════════

  const hasDateFilter = !!(dateFrom || dateTo);
  const hasAnyFilter = !!(searchQuery || hasDateFilter || statusFilter !== 'all' || pfiFilter || customerFilter || truckFilter || codeFilter || customerTypeFilter !== 'all');

  const filtered = useMemo(() => {
    let list = [...truckRecords];

    if (statusFilter === 'active') list = list.filter(r => r.status === 'loaded');
    if (statusFilter === 'delivered') list = list.filter(r => r.status === 'offloaded');
    if (pfiFilter) list = list.filter(r => r.pfi === Number(pfiFilter));
    if (customerFilter) list = list.filter(r => r.customer === Number(customerFilter));
    if (codeFilter) list = list.filter(r => r.code === codeFilter);
    if (truckFilter) list = list.filter(r => r.truckPlate === truckFilter);
    if (customerTypeFilter !== 'all') {
      list = list.filter(r => {
        return customerTypeFilter === 'filling_station' ? r.isFillingStation : !r.isFillingStation;
      });
    }

    if (dateFrom || dateTo) {
      list = list.filter(r => {
        const dateStr = r.date_offloaded || r.date_allocated;
        if (!dateStr) return false;
        const d = startOfDay(parseISO(dateStr));
        if (dateFrom && dateTo)
          return isWithinInterval(d, { start: startOfDay(parseISO(dateFrom)), end: endOfDay(parseISO(dateTo)) });
        if (dateFrom) return d >= startOfDay(parseISO(dateFrom));
        if (dateTo) return d <= endOfDay(parseISO(dateTo));
        return true;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.truckPlate.toLowerCase().includes(q) ||
        e.driverName.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q) ||
        e.depotDisplay.toLowerCase().includes(q) ||
        e.custName.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.pfiLabel.toLowerCase().includes(q) ||
        e.product.toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => {
      const dateA = a.date_offloaded || a.date_allocated || '';
      const dateB = b.date_offloaded || b.date_allocated || '';
      return dateB.localeCompare(dateA);
    });
  }, [truckRecords, statusFilter, pfiFilter, customerFilter, truckFilter, codeFilter, dateFrom, dateTo, searchQuery, customerTypeFilter]);

  // Group filtered records by allocation code — preserving the sorted order
  const grouped = useMemo((): [string, TruckRecord[]][] => {
    const map = new Map<string, TruckRecord[]>();
    filtered.forEach(r => {
      const key = r.code || '';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });

    // 1. Sort records inside each code group: recent ones up (date_offloaded falling back to date_allocated)
    map.forEach(records => {
      records.sort((x, y) => {
        const dateX = x.date_offloaded || x.date_allocated || '';
        const dateY = y.date_offloaded || y.date_allocated || '';
        return dateY.localeCompare(dateX);
      });
    });

    // 2. Sort the code groups themselves by their most recent record's date in descending order (recent ones up)
    return [...map.entries()].sort(([codeA, recordsA], [codeB, recordsB]) => {
      const maxDateA = recordsA.reduce((max, r) => {
        const d = r.date_offloaded || r.date_allocated || '';
        return d > max ? d : max;
      }, '');
      const maxDateB = recordsB.reduce((max, r) => {
        const d = r.date_offloaded || r.date_allocated || '';
        return d > max ? d : max;
      }, '');
      return maxDateB.localeCompare(maxDateA);
    });
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Derived / Summaries
  // ═══════════════════════════════════════════════════════════════════════════

  const activeRecords = useMemo(() => truckRecords.filter(r => r.status === 'loaded'), [truckRecords]);

  const totals = useMemo(() => {
    let activeCount = 0;
    let totalInTransit = 0;
    let totalDelivered = 0;
    let deliveredTrips = 0;
    filtered.forEach(r => {
      if (r.status === 'loaded') {
        activeCount++;
        totalInTransit += r.qty;
      } else if (r.status === 'offloaded') {
        totalDelivered += r.qty;
        deliveredTrips++;
      }
    });
    return { activeCount, totalInTransit, totalDelivered, deliveredTrips };
  }, [filtered]);

  // Plates currently loaded → exclude from allocation dialog
  const loadedTruckPlates = useMemo(() => {
    const set = new Set<string>();
    activeRecords.forEach(r => set.add(r.truckPlate));
    return set;
  }, [activeRecords]);

  // Available trucks = active fleet trucks NOT currently loaded
  const availableTrucks = useMemo(
    () => allTrucks.filter(t => !loadedTruckPlates.has(t.plate_number)),
    [allTrucks, loadedTruckPlates],
  );

  const summaryCards = useMemo((): SummaryCard[] => [
    {
      title: 'Trucks in Transit',
      value: String(totals.activeCount),
      icon: <Truck size={20} />,
      tone: totals.activeCount > 0 ? 'amber' : 'neutral',
    },
    {
      title: 'Volume in Transit',
      value: `${fmtQty(totals.totalInTransit)} Ltrs`,
      icon: <DropletIcon size={20} />,
      tone: totals.totalInTransit > 0 ? 'amber' : 'neutral',
    },
    {
      title: 'Quantity Sold',
      value: `${fmtQty(totals.totalDelivered)} Ltrs`,
      icon: <CheckCircle2 size={20} />,
      tone: 'green',
    },
    // {
    //   title: 'Trips Delivered',
    //   value: String(totals.deliveredTrips),
    //   icon: <Fuel size={20} />,
    //   tone: totals.deliveredTrips > 0 ? 'green' : 'neutral',
    // },
  ], [totals]);

  // PFI options for Allocate dialog — active only
  const activePfiOptions = useMemo(() =>
    allPfis
      .filter(p => p.status === 'active')
      .sort((a, b) => a.pfi_number.localeCompare(b.pfi_number))
      .map(p => ({
        id: p.id,
        label: `${p.pfi_number} — ${p.product_name || 'N/A'} · ${p.location_name || 'N/A'}`,
      })),
    [allPfis]);

  // PFI options for Edit dialog — all, active first
  const allPfiOptions = useMemo(() =>
    allPfis
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return a.pfi_number.localeCompare(b.pfi_number);
      })
      .map(p => ({
        id: p.id,
        label: `${p.pfi_number} — ${p.product_name || 'N/A'} · ${p.location_name || 'N/A'}${p.status === 'finished' ? '  (finished)' : ''}`,
      })),
    [allPfis]);

  const selectedPfi = useMemo(() => (loadPfi ? pfiMap.get(Number(loadPfi)) || null : null), [loadPfi, pfiMap]);

  // Auto-sum of selected trucks' max_capacity
  const autoSumCapacity = useMemo(() => {
    let total = 0;
    selectedTruckIds.forEach(id => {
      const t = allTrucks.find(t => t.id === id);
      if (t?.max_capacity) total += t.max_capacity;
    });
    return total;
  }, [selectedTruckIds, allTrucks]);

  const trucksWithNoCapacity = useMemo(() => {
    const result: string[] = [];
    selectedTruckIds.forEach(id => {
      const t = allTrucks.find(t => t.id === id);
      if (t && !t.max_capacity) result.push(t.plate_number);
    });
    return result;
  }, [selectedTruckIds, allTrucks]);

  const distinctTruckPlates = useMemo(() => {
    const set = new Set<string>();
    truckRecords.forEach(r => { if (r.truckPlate && r.truckPlate !== '—') set.add(r.truckPlate); });
    return [...set].sort();
  }, [truckRecords]);

  const distinctPfis = useMemo(() => {
    const map = new Map<number, string>();
    truckRecords.forEach(r => { if (r.pfi) map.set(r.pfi, r.pfiLabel); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [truckRecords]);

  const distinctCustomers = useMemo(() => {
    const map = new Map<number, string>();
    truckRecords.forEach(r => { if (r.customer) map.set(r.customer, r.custName); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [truckRecords]);

  const distinctAllocationCodes = useMemo(() => {
    const codes = new Set<string>();
    truckRecords.forEach(r => { if (r.code) codes.add(r.code); });
    const codeOrder = new Map<string, number>();
    deliveryCodes.forEach((c, i) => codeOrder.set(c, i));
    return [...codes].sort((a, b) => {
      const aR = codeOrder.get(a) ?? 10_000;
      const bR = codeOrder.get(b) ?? 10_000;
      return aR !== bR ? aR - bR : a.localeCompare(b);
    });
  }, [truckRecords, deliveryCodes]);

  const periodLabel = hasDateFilter
    ? `${dateFrom ? format(parseISO(dateFrom), 'dd MMM') : '…'} – ${dateTo ? format(parseISO(dateTo), 'dd MMM yyyy') : '…'}`
    : 'all time';

  // ═══════════════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory-all'] });
    qc.invalidateQueries({ queryKey: ['delivery-sales'] });
    qc.invalidateQueries({ queryKey: ['fleet-trucks'] });
  }, [qc]);

  const openLoadDialog = () => {
    setLoadPfi('');
    setLoadCode('');
    setLoadDepot('');
    setLoadLocation('');
    setDateAllocated(format(new Date(), 'yyyy-MM-dd'));
    setLoadNotes('');
    setSelectedTruckIds(new Set());
    setTruckSearch('');
    setNewCodeInput('');
    setShowNewCodeInput(false);
    setLoadDialogOpen(true);
  };

  const toggleTruck = (truckId: number) => {
    setSelectedTruckIds(prev => {
      const next = new Set(prev);
      next.has(truckId) ? next.delete(truckId) : next.add(truckId);
      return next;
    });
  };

  const addNewCode = () => {
    const normalized = newCodeInput.trim().toUpperCase().replace(/\s+/g, '-');
    if (!normalized) return;
    if (deliveryCodes.includes(normalized)) {
      toast({ title: `Code "${normalized}" already exists`, variant: 'destructive' });
      return;
    }
    setDeliveryCodes(prev => [...prev, normalized].sort());
    setLoadCode(normalized);
    setNewCodeInput('');
    setShowNewCodeInput(false);
    toast({ title: `Code "${normalized}" created and selected` });
  };

  const handleLoadSave = useCallback(async () => {
    if (selectedTruckIds.size === 0) {
      toast({ title: 'Select at least one truck', variant: 'destructive' });
      return;
    }
    if (!loadPfi) {
      toast({ title: 'Select a PFI source', variant: 'destructive' });
      return;
    }

    const truckCount = selectedTruckIds.size;
    setSaving(true);
    try {
      const depot = loadDepot || selectedPfi?.location_name || '';
      const location = loadLocation || '';
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const normalizedCode = loadCode ? loadCode.trim().toUpperCase().replace(/\s+/g, '-') : null;

      const promises: Promise<unknown>[] = [];
      for (const truckId of selectedTruckIds) {
        const truckObj = allTrucks.find(t => t.id === truckId);
        const truckQty = truckObj?.max_capacity || 0;
        promises.push(
          apiClient.admin.createDeliveryInventory({
            pfi: Number(loadPfi),
            allocation_code: normalizedCode,
            truck: truckId,
            truck_number: truckObj?.plate_number || '',
            depot: depot || undefined,
            location: location || undefined,
            quantity_allocated: truckQty,
            date_allocated: dateAllocated,
            loading_status: 'loaded',
            notes: loadNotes.trim() || undefined,
            created_by: currentUser,
          }),
        );
      }

      const createdRecords = await Promise.all(promises);

      // Update local code map so Sales Ledger can read it
      const updates: Record<number, string> = {};
      createdRecords.forEach(record => {
        const created = record as { id?: number };
        if (created?.id && normalizedCode) updates[created.id] = normalizedCode;
      });
      if (Object.keys(updates).length > 0) {
        setLoadingCodeMap(prev => ({ ...prev, ...updates }));
      }

      toast({
        title: `${truckCount} truck${truckCount > 1 ? 's' : ''} allocated${normalizedCode ? ` under ${normalizedCode}` : ''}`,
        description: autoSumCapacity > 0
          ? `${fmtQty(autoSumCapacity)} ${getPfiUnitLabel(selectedPfi)} total · PFI ${selectedPfi?.pfi_number || ''}`
          : `PFI ${selectedPfi?.pfi_number || ''}`,
      });
      setLoadDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [selectedTruckIds, loadCode, loadPfi, loadDepot, loadLocation, loadNotes, dateAllocated, selectedPfi, allTrucks, autoSumCapacity, toast, invalidateAll]);

  const handleOffload = useCallback(async () => {
    if (!offloadTarget) return;
    setOffloading(true);
    try {
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      await apiClient.admin.updateDeliveryInventory(offloadTarget.id, {
        loading_status: 'offloaded',
        date_offloaded: offloadDate,
        offloaded_by: currentUser,
      });
      toast({ title: `${offloadTarget.truckPlate} confirmed as sold` });
      setOffloadTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update',
        variant: 'destructive',
      });
    } finally {
      setOffloading(false);
    }
  }, [offloadTarget, offloadDate, toast, invalidateAll]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Find the loaded truck record in our enriched list to get truck_number and allocation_code/date
      const targetRecord = truckRecords.find(r => r.id === deleteTarget.id);

      if (targetRecord) {
        // Find matching sales ledger entries
        const matchedSales = allSales.filter(s => {
          // 1. Direct match on allocation_code if present
          if (s.allocation_code && targetRecord.code && s.allocation_code === targetRecord.code) {
            return true;
          }
          // 2. Fallback to truck plate & loading/allocation date match
          const sTruck = s.truck_number || '';
          const iTruck = targetRecord.truckPlate || targetRecord.truck_number || '';
          const sDate = s.date_loaded || '';
          const iDate = targetRecord.date_allocated || '';

          return sTruck && iTruck && sTruck === iTruck && sDate === iDate;
        });

        // Delete matched sales records first
        if (matchedSales.length > 0) {
          await Promise.all(matchedSales.map(sale => apiClient.admin.deleteDeliverySale(sale.id)));
        }
      }

      await apiClient.admin.deleteDeliveryInventory(deleteTarget.id);
      toast({
        title: 'Record deleted',
        description: 'Successfully deleted the inventory entry and all associated sales ledger records.'
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
  }, [deleteTarget, truckRecords, allSales, toast, invalidateAll]);

  const openEditDialog = (r: TruckRecord) => {
    setEditTarget({
      id: r.id,
      truckPlate: r.truckPlate,
      currentCode: r.code,
      currentPfi: r.pfi ? String(r.pfi) : '',
      currentDepot: r.depotDisplay,
      currentDate: r.date_allocated || '',
      currentLocation: r.destination,
    });
    setEditForm({
      code: r.code,
      pfi: r.pfi ? String(r.pfi) : '',
      depot: r.depotDisplay,
      date: r.date_allocated || '',
      location: r.destination,
    });
  };

  const handleEditSave = useCallback(async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const normalizedCode = editForm.code.trim().toUpperCase().replace(/\s+/g, '-');
      await apiClient.admin.updateDeliveryInventory(editTarget.id, {
        allocation_code: normalizedCode || null,
        pfi: editForm.pfi ? Number(editForm.pfi) : null,
        depot: editForm.depot.trim() || undefined,
        date_allocated: editForm.date || undefined,
        location: editForm.location.trim() || undefined,
      });

      if (normalizedCode) {
        setLoadingCodeMap(prev => ({ ...prev, [editTarget.id]: normalizedCode }));
      } else {
        setLoadingCodeMap(prev => { const next = { ...prev }; delete next[editTarget.id]; return next; });
      }

      toast({ title: 'Record updated' });
      setEditTarget(null);
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
  }, [editTarget, editForm, toast, invalidateAll]);

  const toggleCodeCollapse = (code: string) => {
    setCollapsedCodes(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setPfiFilter('');
    setCustomerFilter('');
    setTruckFilter('');
    setCodeFilter('');
    setCustomerTypeFilter('all');
  };

  const handleBulkAssign = useCallback(async () => {
    if (selectedRowIds.size === 0) return;
    const isClearCode = bulkAssignCode === '__CLEAR__';
    if (!bulkAssignCode && !bulkAssignPfi) {
      toast({ title: 'Select a code and/or PFI to assign', variant: 'destructive' });
      return;
    }
    setBulkAssigning(true);
    try {
      const patch: Record<string, unknown> = {};
      if (isClearCode) {
        patch.allocation_code = null; // explicitly clear the code
      } else if (bulkAssignCode) {
        patch.allocation_code = bulkAssignCode;
      }
      if (bulkAssignPfi) patch.pfi = Number(bulkAssignPfi);

      await Promise.all([...selectedRowIds].map(id =>
        apiClient.admin.updateDeliveryInventory(id, patch as Parameters<typeof apiClient.admin.updateDeliveryInventory>[1]),
      ));

      // Update local code map
      if (isClearCode) {
        setLoadingCodeMap(prev => {
          const next = { ...prev };
          selectedRowIds.forEach(id => { delete next[id]; });
          return next;
        });
      } else if (bulkAssignCode) {
        setLoadingCodeMap(prev => {
          const next = { ...prev };
          selectedRowIds.forEach(id => { next[id] = bulkAssignCode; });
          return next;
        });
      }

      toast({
        title: `Updated ${selectedRowIds.size} record${selectedRowIds.size !== 1 ? 's' : ''}`,
        description: [
          isClearCode ? 'Code removed (no code)' : bulkAssignCode && `Code → ${bulkAssignCode}`,
          bulkAssignPfi && `PFI → ${allPfis.find(p => p.id === Number(bulkAssignPfi))?.pfi_number || bulkAssignPfi}`,
        ].filter(Boolean).join(' · '),
      });

      setSelectedRowIds(new Set());
      setBulkAssignOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Bulk update failed',
        variant: 'destructive',
      });
    } finally {
      setBulkAssigning(false);
    }
  }, [selectedRowIds, bulkAssignCode, bulkAssignPfi, allPfis, toast, invalidateAll]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedRowIds.size === 0) return;
    setBulkDeleting(true);
    try {
      // Find all loaded truck records matching the selected IDs
      const targetRecords = truckRecords.filter(r => selectedRowIds.has(r.id));

      // Find matching sales ledger entries for any of the selected records
      const matchedSales = allSales.filter(s => {
        return targetRecords.some(targetRecord => {
          // 1. Direct match on allocation_code if present
          if (s.allocation_code && targetRecord.code && s.allocation_code === targetRecord.code) {
            return true;
          }
          // 2. Fallback to truck plate & loading/allocation date match
          const sTruck = s.truck_number || '';
          const iTruck = targetRecord.truckPlate || targetRecord.truck_number || '';
          const sDate = s.date_loaded || '';
          const iDate = targetRecord.date_allocated || '';

          return sTruck && iTruck && sTruck === iTruck && sDate === iDate;
        });
      });

      // 1. Delete matched sales records in parallel
      if (matchedSales.length > 0) {
        await Promise.all(matchedSales.map(sale => apiClient.admin.deleteDeliverySale(sale.id)));
      }

      // 2. Delete the selected inventory records in parallel
      await Promise.all([...selectedRowIds].map(id => apiClient.admin.deleteDeliveryInventory(id)));

      toast({
        title: `Deleted ${selectedRowIds.size} record${selectedRowIds.size !== 1 ? 's' : ''}`,
        description: `Successfully deleted selected inventory entries and all their associated daily sales records/payments.`,
      });

      setSelectedRowIds(new Set());
      setBulkDeleteOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Bulk delete failed',
        variant: 'destructive',
      });
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedRowIds, truckRecords, allSales, toast, invalidateAll]);

  const exportExcel = useCallback(() => {
    if (!filtered.length) return;
    const rows = filtered.map((r, idx) => ({
      'S/N': idx + 1,
      'Code': r.code || '—',
      'Truck': r.truckPlate,
      'Driver': r.driverName || '—',
      'PFI': r.pfiLabel || '—',
      'Product': r.product || '—',
      'Depot': r.depotDisplay || '—',
      'Destination': r.destination || '—',
      [`Quantity (${r.unitLabel})`]: r.qty,
      'Status': statusBadge[r.status]?.label || r.status,
      'Date Loaded': r.date_allocated ? format(parseISO(r.date_allocated), 'dd/MM/yyyy') : '',
      'Date Offloaded': r.date_offloaded ? format(parseISO(r.date_offloaded), 'dd/MM/yyyy') : '',
      'Loaded By': r.created_by || '',
      'Offloaded By': r.offloaded_by || '',
      'Notes': r.notes || '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `DELIVERY-INVENTORY-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  }, [filtered]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  const isLoading = inventoryQuery.isLoading || trucksQuery.isLoading || pfisQuery.isLoading || salesQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* ── Header ───────────────────────────────────────── */}
            <PageHeader
              title="Delivery Inventory"
              description="Track truck loading cycles grouped by allocation code."
              actions={
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  {!readOnly && (
                    <>
                      {/* <Button variant="outline" className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => setManageCodesOpen(true)}>
                        <Settings size={16} /> Manage Codes
                      </Button> */}
                      <Button className="gap-2 bg-green-700 hover:bg-green-800" onClick={openLoadDialog}>
                        <Plus size={16} /> Allocate Trucks
                      </Button>
                    </>
                  )}
                </div>
              }
            />

            {/* ── Summary Cards ─────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />



            {/* ── Period indicator ──────────────────────────────── */}
            {/* {hasDateFilter && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <CalendarDays size={15} className="shrink-0" />
                <span>Showing <strong>{periodLabel}</strong></span>
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-medium underline"
                >
                  Clear filter
                </button>
              </div>
            )} */}

            {/* ── Search + Filters Bar ──────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search truck, PFI, product, customer, depot, destination, code…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</label>
                  <select aria-label="Filter by status" value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="all">All Statuses</option>
                    <option value="active">In Transit</option>
                    <option value="delivered">Sold</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[130px]">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Truck</label>
                  <select aria-label="Filter by truck" value={truckFilter}
                    onChange={e => setTruckFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">All Trucks</option>
                    {distinctTruckPlates.map(plate => {
                      const count = truckRecords.filter(r => r.truckPlate === plate).length;
                      return <option key={plate} value={plate}>{plate}{count > 0 ? ` (${count} entries)` : ''}</option>;
                    })}
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[150px]">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Customer</label>
                  <select aria-label="Filter by customer" value={customerFilter}
                    onChange={e => setCustomerFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">All Customers</option>
                    {distinctCustomers.map(([id, name]) => {
                      const count = truckRecords.filter(r => r.customer === id).length;
                      return <option key={id} value={String(id)}>{name}{count > 0 ? ` (${count} entries)` : ''}</option>;
                    })}
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[150px]">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Customer Type</label>
                  <select aria-label="Filter by Customer Type" value={customerTypeFilter}
                    onChange={e => setCustomerTypeFilter(e.target.value as any)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="all">All Customer Types</option>
                    <option value="normal">Normal Customers Only</option>
                    <option value="filling_station">Filling Stations Only</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[140px]">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">PFI Code</label>
                  <select aria-label="Filter by allocation code" value={codeFilter}
                    onChange={e => setCodeFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium">
                    <option value="">All PFIs</option>
                    {distinctAllocationCodes.map(code => {
                      const count = truckRecords.filter(r => r.code === code).length;
                      return <option key={code} value={code}>{code}{count > 0 ? ` (${count} entries)` : ''}</option>;
                    })}
                  </select>
                </div>

                {/* {hasAnyFilter && (
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm"
                      className="gap-1.5 text-xs text-slate-500 hover:text-slate-700 h-9"
                      onClick={clearAllFilters}>
                      <X size={13} /> Clear all
                    </Button>
                  </div>
                )} */}
              </div>

              {/* <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <CalendarDays size={16} className="text-slate-400 shrink-0" />
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="h-9 w-[140px] text-sm" title="From date" />
                  <span className="text-xs text-slate-400">to</span>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="h-9 w-[140px] text-sm" title="To date" />
                  {hasDateFilter && (
                    <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={15} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([
                    { label: 'Today', from: startOfDay(new Date()), to: endOfDay(new Date()) },
                    { label: 'Yesterday', from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) },
                    { label: 'This Week', from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) },
                    { label: 'This Month', from: startOfMonth(new Date()), to: endOfMonth(new Date()) },
                    { label: 'Last Month', from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) },
                  ] as const).map(preset => {
                    const pFrom = format(preset.from, 'yyyy-MM-dd');
                    const pTo = format(preset.to, 'yyyy-MM-dd');
                    const isActive = dateFrom === pFrom && dateTo === pTo;
                    return (
                      <button key={preset.label} type="button"
                        onClick={() => { if (isActive) { setDateFrom(''); setDateTo(''); } else { setDateFrom(pFrom); setDateTo(pTo); } }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div> */}

              {/* Active Filter Chips */}
              {[
                statusFilter !== 'all' && { label: `Status: ${statusFilter === 'active' ? 'In Transit' : 'Sold'}`, clear: () => setStatusFilter('all') },
                truckFilter && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('') },
                pfiFilter && { label: `PFI: ${distinctPfis.find(([id]) => String(id) === pfiFilter)?.[1] || pfiFilter}`, clear: () => setPfiFilter('') },
                customerFilter && { label: `Customer: ${distinctCustomers.find(([id]) => String(id) === customerFilter)?.[1] || customerFilter}`, clear: () => setCustomerFilter('') },
                customerTypeFilter !== 'all' && { label: `Type: ${customerTypeFilter === 'filling_station' ? 'Filling Station' : 'Normal Customer'}`, clear: () => setCustomerTypeFilter('all') },
                codeFilter && { label: `Allocation Code: ${codeFilter}`, clear: () => setCodeFilter('') },
                searchQuery && { label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') },
              ].filter((x): x is { label: string; clear: () => void } => !!x).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400 shrink-0">You're viewing:</span>
                    {[
                      statusFilter !== 'all' && { label: `Status: ${statusFilter === 'active' ? 'In Transit' : 'Sold'}`, clear: () => setStatusFilter('all') },
                      truckFilter && { label: `Truck: ${truckFilter}`, clear: () => setTruckFilter('') },
                      pfiFilter && { label: `PFI: ${distinctPfis.find(([id]) => String(id) === pfiFilter)?.[1] || pfiFilter}`, clear: () => setPfiFilter('') },
                      customerFilter && { label: `Customer: ${distinctCustomers.find(([id]) => String(id) === customerFilter)?.[1] || customerFilter}`, clear: () => setCustomerFilter('') },
                      customerTypeFilter !== 'all' && { label: `Type: ${customerTypeFilter === 'filling_station' ? 'Filling Station' : 'Normal Customer'}`, clear: () => setCustomerTypeFilter('all') },
                      codeFilter && { label: `Allocation Code: ${codeFilter}`, clear: () => setCodeFilter('') },
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
            </div>

            {/* ── Bulk Selection Toolbar ───────────────────────── */}
            {selectedRowIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg shadow-lg">
                <span className="text-sm font-bold">
                  {selectedRowIds.size} row{selectedRowIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex-1" />
                {!readOnly && (
                  <>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-white text-blue-700 hover:bg-blue-50 font-bold"
                      onClick={() => {
                        setBulkAssignCode('');
                        setBulkAssignPfi('');
                        setBulkAssignOpen(true);
                      }}
                    >
                      <Tag size={13} /> Assign PFI
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold"
                      onClick={() => {
                        setBulkDeleteOpen(true);
                      }}
                    >
                      <Trash2 size={13} /> Delete Selected
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs gap-1 text-blue-100 hover:text-white hover:bg-blue-500"
                  onClick={() => setSelectedRowIds(new Set())}
                >
                  <X size={13} /> Clear selection
                </Button>
              </div>
            )}

            {/* ── Table ────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">
                    {hasAnyFilter ? 'No records match your filters' : 'No truck records yet'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {hasAnyFilter
                      ? 'Try adjusting your search, filters, or date range.'
                      : 'Click "Allocate Trucks" to start tracking deliveries.'}
                  </p>
                  {hasAnyFilter && (
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={clearAllFilters}>
                      <X size={13} /> Clear all filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        {/* <TableHead className="w-[44px] text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all visible rows"
                            className="h-4 w-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
                            checked={filtered.length > 0 && filtered.every(r => selectedRowIds.has(r.id))}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedRowIds(new Set(filtered.map(r => r.id)));
                              } else {
                                setSelectedRowIds(new Set());
                              }
                            }}
                          />
                        </TableHead> */}
                        <TableHead className="text-sm text-slate-700 w-[40px] text-center">#</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[115px]">PFI Code</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[120px]">Truck</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[105px]">Quantity</TableHead>
                        <TableHead className="text-sm text-slate-700">Depot Loaded</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700">PFI</TableHead> */}
                        <TableHead className="text-sm text-slate-700">Product</TableHead>
                        <TableHead className="text-sm text-slate-700">Customer</TableHead>
                        <TableHead className="text-sm text-slate-700">Rate(s)</TableHead>
                        <TableHead className="text-sm text-slate-700">Destination</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[85px]">Status</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[95px]">Date Loaded</TableHead>
                        <TableHead className="text-sm text-slate-700 w-[95px]">Date Sold</TableHead>
                        {/* <TableHead className="font-semibold text-slate-700 w-[90px]">Sold By</TableHead> */}
                        <TableHead className="text-sm text-slate-700 w-[190px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const rows: React.ReactNode[] = [];

                        grouped.forEach(([code, records]) => {
                          const theme = code ? getCodeTheme(code) : null;
                          const isCollapsed = collapsedCodes.has(code);
                          const totalQty = records.reduce((s, r) => s + r.qty, 0);
                          const loadedCount = records.filter(r => r.status === 'loaded').length;
                          const soldCount = records.filter(r => r.status === 'offloaded').length;

                          // ── Code group header ──
                          rows.push(
                            <TableRow
                              key={`grp-${code || '__none__'}`}
                              className={`cursor-pointer select-none border-b-2 ${theme ? `${theme.header} border-slate-200` : 'bg-slate-100 border-slate-200'
                                }`}
                              onClick={() => toggleCodeCollapse(code)}
                            >
                              <TableCell colSpan={16} className="py-2.5 px-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-slate-500 shrink-0">
                                    {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                  </span>

                                  {code ? (
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${theme?.badge || 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                                      <Tag size={11} /> {code}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border bg-slate-200 text-slate-500 border-slate-300">
                                      <Tag size={11} /> No Code
                                    </span>
                                  )}

                                  <span className="text-xs font-medium text-slate-600">
                                    {records.length} truck{records.length !== 1 ? 's' : ''}
                                  </span>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className="text-xs font-semibold text-slate-700">
                                    {fmtQty(totalQty)} {records[0]?.unitLabel || 'Litres'}
                                  </span>

                                  {loadedCount > 0 && (
                                    <>
                                      <span className="text-xs text-slate-300">|</span>
                                      <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                        {loadedCount} in transit
                                      </span>
                                    </>
                                  )}
                                  {soldCount > 0 && (
                                    <>
                                      <span className="text-xs text-slate-300">|</span>
                                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                        {soldCount} sold
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>,
                          );

                          // ── Truck rows ──
                          if (!isCollapsed) {
                            records.forEach((r, idx) => {
                              const badge = statusBadge[r.status];
                              const Icon = badge?.icon;
                              const salesEntries = truckSalesMap.get(r.id);

                              rows.push(
                                <TableRow
                                  key={r.id}
                                  className={`hover:bg-slate-50/60 transition-colors border-l-[3px] ${selectedRowIds.has(r.id)
                                    ? 'bg-blue-50/60 border-l-blue-400'
                                    : (theme ? theme.row : 'border-l-transparent')
                                    }`}
                                >
                                  {/* Checkbox */}
                                  <TableCell className="text-slate-400 text-center text-xs">{idx + 1}</TableCell>

                                  {/* Code column — inline per row */}
                                  <TableCell>
                                    {r.code ? (() => {
                                      const t = getCodeTheme(r.code);
                                      return (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${t?.badge || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                          <Tag size={9} />{r.code}
                                        </span>
                                      );
                                    })() : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </TableCell>

                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <span className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                                        <Truck size={12} className="text-slate-400 shrink-0" />
                                        {r.truckPlate}
                                      </span>
                                      {salesEntries && salesEntries.length > 1 && (
                                        <span className="inline-flex self-start items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                          Split Load
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>

                                  <TableCell className="text-sm font-semibold text-slate-800">
                                    {r.qty > 0 ? `${fmtQty(r.qty)} ${r.unitLabel}` : '—'}
                                  </TableCell>

                                  <TableCell className="text-slate-800 text-sm">{r.depotDisplay || '—'}</TableCell>
                                  {/* <TableCell className="text-slate-700 font-medium whitespace-nowrap text-xs">{r.pfiLabel || '—'}</TableCell> */}
                                  <TableCell className="font-medium text-slate-800 whitespace-nowrap text-sm">{r.product || '—'}</TableCell>

                                  {/* Customers + per-customer qty (from Sales Ledger) */}
                                  <TableCell>
                                    {salesEntries && salesEntries.length > 0 ? (
                                      <div className="flex flex-col gap-1.5 py-1">
                                        {salesEntries.map(e => {
                                          const hasSplit = salesEntries.length > 1;
                                          return (
                                            <div key={e.customerId || 'none'} className="flex items-center gap-2 h-[22px]">
                                              <span className="text-sm text-slate-900 font-medium capitalize whitespace-nowrap">
                                                {e.customerName || `Customer #${e.customerId}`}
                                              </span>
                                              {e.qty > 0 && (
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${hasSplit
                                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                                                  }`}>
                                                  {fmtQty(e.qty)}L
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : r.custName ? (
                                      <span className="text-sm text-slate-900 font-medium capitalize whitespace-nowrap">
                                        {r.custName}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </TableCell>

                                  {/* Rates (from Sales Ledger) */}
                                  <TableCell>
                                    {salesEntries && salesEntries.length > 0 ? (
                                      <div className="flex flex-col gap-1.5 py-1">
                                        {salesEntries.map((e, idx) => (
                                          <div key={e.customerId || idx} className="h-[22px] flex items-center">
                                            <span className="text-sm text-slate-700 whitespace-nowrap font-medium">
                                              {e.rates.size > 0
                                                ? [...e.rates].map(rate => `₦${rate.toLocaleString()}`).join(', ')
                                                : <span className="text-slate-300">—</span>
                                              }
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </TableCell>

                                  {/* Destination (from Sales Ledger if split, or fallback to r.destination) */}
                                  <TableCell>
                                    {salesEntries && salesEntries.length > 0 ? (
                                      <div className="flex flex-col gap-1.5 py-1">
                                        {salesEntries.map((e, idx) => {
                                          const customerObj = e.customerId ? customerMap.get(e.customerId) : null;
                                          const isFS = isFillingStation(customerObj);
                                          const destDisplay = isFS
                                            ? (customerObj?.customer_name || e.customerName || '')
                                            : (e.location || r.destination || '—');
                                          return (
                                            <div key={e.customerId || idx} className="h-[22px] flex items-center">
                                              <span className="text-sm text-slate-700 capitalize whitespace-nowrap">
                                                {destDisplay || '—'}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="text-slate-700 capitalize text-sm">{r.destination || '—'}</span>
                                    )}
                                  </TableCell>

                                  <TableCell>
                                    {badge && Icon ? (
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
                                        <Icon size={11} /> {badge.label}
                                      </span>
                                    ) : '—'}
                                  </TableCell>

                                  <TableCell className="whitespace-nowrap text-slate-700 text-sm">
                                    {r.date_allocated ? format(parseISO(r.date_allocated), 'dd MMM yy') : '—'}
                                  </TableCell>

                                  <TableCell className="whitespace-nowrap text-slate-700 text-sm">
                                    {r.date_offloaded ? format(parseISO(r.date_offloaded), 'dd MMM yy') : '—'}
                                  </TableCell>

                                  {/* <TableCell className="whitespace-nowrap text-slate-500 text-xs">
                                    {r.offloaded_by || '—'}
                                  </TableCell> */}

                                  <TableCell>
                                    <div className="flex gap-1 flex-wrap">
                                      {r.status === 'loaded' && !readOnly && (
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2"
                                          onClick={() => { setOffloadTarget(r); setOffloadDate(format(new Date(), 'yyyy-MM-dd')); }}
                                          title="Confirm this truck has been sold/offloaded"
                                        >
                                          <CheckCircle2 size={11} /> Offload
                                        </Button>
                                      )}
                                      {!readOnly && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs gap-1 px-2"
                                          onClick={() => openEditDialog(r)}
                                          title="Edit this allocation record"
                                        >
                                          <Pencil size={12} /> Edit
                                        </Button>
                                      )}
                                      {/* {!readOnly && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                          onClick={() => setDeleteTarget({ id: r.id, label: `${r.truckPlate}${r.code ? ` (${r.code})` : ''}` })}
                                          title="Delete this loading record"
                                        >
                                          <Trash2 size={12} />
                                        </Button>
                                      )} */}
                                    </div>
                                  </TableCell>
                                </TableRow>,
                              );
                            });
                          }
                        });

                        return rows;
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                {filtered.length} record{filtered.length !== 1 ? 's' : ''} in {grouped.length} code group{grouped.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Allocate Trucks Dialog                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[95vh] overflow-y-auto">
          <DialogHeader className="pb-3">
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Allocate Trucks</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">Load trucks under a PFI Code</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Allocate trucks for delivery</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">

            {/* ── 1. PFI Source ────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={14} className="text-blue-600" />
                PFI Source <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select PFI"
                value={loadPfi}
                onChange={e => {
                  const pfiId = e.target.value;
                  const pfi = pfiId ? pfiMap.get(Number(pfiId)) : null;
                  setLoadPfi(pfiId);
                  setLoadDepot(pfi?.location_name || '');
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <option value="">Select a PFI</option>
                {activePfiOptions.map(o => (
                  <option key={o.id} value={String(o.id)}>{o.label}</option>
                ))}
              </select>

              {/* {selectedPfi && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Product</p>
                      <p className="font-semibold text-slate-900">{selectedPfi.product_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Depot</p>
                      <p className="font-semibold text-slate-900">{selectedPfi.location_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Status</p>
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">Active</span>
                    </div>
                  </div>
                </div>
              )} */}
            </div>

            {/* ── 2. Allocation Code ───────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Tag size={14} className="text-blue-600" />
                PFI Code <span className="text-red-500">*</span>
              </Label>

              {deliveryCodes.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  No codes yet — create one below to continue.
                </div>
              ) : (
                <select
                  aria-label="Select allocation code"
                  value={loadCode}
                  onChange={e => setLoadCode(e.target.value)}
                  className={`h-10 w-full rounded-lg border px-3.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${loadCode ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                >
                  <option value="">Select a code…</option>
                  {deliveryCodes.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              )}

              {/* Code chip shortcuts */}
              {deliveryCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {deliveryCodes.map(code => {
                    const theme = getCodeTheme(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setLoadCode(code)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${loadCode === code
                          ? (theme ? `${theme.badge} ring-2 ring-offset-1 shadow-sm` : 'bg-blue-600 text-white border-blue-600')
                          : (theme ? `${theme.badge} opacity-60 hover:opacity-100` : 'bg-slate-100 text-slate-600 border-slate-200')
                          }`}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Inline new code creation */}
              {!showNewCodeInput ? (
                <button
                  type="button"
                  onClick={() => setShowNewCodeInput(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors mt-1"
                >
                  <Plus size={13} /> Create new code
                </button>
              ) : (
                <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
                  <Input
                    placeholder="e.g. LOAD-001"
                    value={newCodeInput}
                    onChange={e => setNewCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addNewCode();
                      if (e.key === 'Escape') { setShowNewCodeInput(false); setNewCodeInput(''); }
                    }}
                    className="h-8 text-sm font-mono font-semibold flex-1 border-slate-300"
                    autoFocus
                  />
                  <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 shrink-0" onClick={addNewCode} disabled={!newCodeInput.trim()}>
                    <Plus size={12} /> Add
                  </Button>
                  <button type="button" onClick={() => { setShowNewCodeInput(false); setNewCodeInput(''); }}
                    className="text-slate-400 hover:text-slate-600 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* ── 3. Date Loaded ───────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <CalendarDays size={14} className="text-blue-600" /> Date Loaded
              </Label>
              <Input type="date" value={dateAllocated} onChange={e => setDateAllocated(e.target.value)} className="h-10" />
            </div>

            {/* ── 4. Select Trucks ─────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Truck size={14} className="text-blue-600" />
                  Select Trucks <span className="text-red-500">*</span>
                </Label>
                {selectedTruckIds.size > 0 && (
                  <span className="text-xs font-bold text-white bg-blue-600 px-2.5 py-1 rounded-full">
                    {selectedTruckIds.size} selected
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <Input placeholder="Search trucks…" className="pl-9 h-9 text-sm"
                  value={truckSearch} onChange={e => setTruckSearch(e.target.value)} />
              </div>

              <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                {(() => {
                  const q = truckSearch.trim().toLowerCase();
                  const visible = q
                    ? availableTrucks.filter(t =>
                      t.plate_number.toLowerCase().includes(q) ||
                      (t.driver_name || '').toLowerCase().includes(q))
                    : availableTrucks;

                  if (visible.length === 0) {
                    return (
                      <p className="text-xs text-slate-500 text-center py-6">
                        {availableTrucks.length === 0 ? 'All trucks are currently loaded' : 'No trucks match your search'}
                      </p>
                    );
                  }

                  return (
                    <div className="flex flex-wrap gap-2">
                      {visible.map(t => {
                        const isSel = selectedTruckIds.has(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTruck(t.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-medium text-sm transition-all ${isSel
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-300'
                              }`}
                          >
                            <Truck size={13} />
                            <span>{t.plate_number}</span>
                            {/* {t.driver_name && (
                              <span className={`text-xs truncate ${isSel ? 'text-blue-100' : 'text-slate-400'}`}>{t.driver_name}</span>
                            )} */}
                            {t.max_capacity ? (
                              <span className={`text-xs font-bold ml-1 ${isSel ? 'text-blue-100' : 'text-slate-400'}`}>
                                {fmtQty(t.max_capacity)}L
                              </span>
                            ) : (
                              <span className={`text-xs ${isSel ? 'text-yellow-200' : 'text-amber-500'}`}>no cap.</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {availableTrucks.length === 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  <AlertTriangle size={13} /> All active trucks are currently loaded
                </p>
              )}
            </div>

            {/* ── 5. Auto-calculated Qty Summary ──────────────── */}
            {selectedTruckIds.size > 0 && (
              <div className={`rounded-lg border-2 p-4 ${autoSumCapacity > 0 ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                {autoSumCapacity > 0 ? (
                  <>
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">
                      Total Allocation (Auto-calculated from capacity)
                    </p>
                    <p className="text-3xl font-black text-blue-900">{fmtQty(autoSumCapacity)} {getPfiUnitLabel(selectedPfi)}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {selectedTruckIds.size} truck{selectedTruckIds.size !== 1 ? 's' : ''}
                      {selectedTruckIds.size > 1 && ` · ≈ ${fmtQty(Math.round(autoSumCapacity / selectedTruckIds.size))} ${getPfiUnitLabel(selectedPfi)} each`}
                      {selectedPfi && ` · ${selectedPfi.pfi_number}`}
                    </p>
                    {trucksWithNoCapacity.length > 0 && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {trucksWithNoCapacity.join(', ')} ha{trucksWithNoCapacity.length !== 1 ? 've' : 's'} no capacity — will save as 0 L
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Capacity Warning</p>
                    <p className="text-sm font-semibold text-amber-800">
                      Selected truck{trucksWithNoCapacity.length !== 1 ? 's have' : ' has'} no max capacity set.
                    </p>
                    <p className="text-xs text-amber-700 mt-1">Set capacity in Fleet Trucks, or quantity will save as 0.</p>
                    <p className="text-xs font-mono text-amber-600 mt-1">{trucksWithNoCapacity.join(', ')}</p>
                  </>
                )}
              </div>
            )}

            {/* ── 6. Notes (optional) ──────────────────────────── */}
            {/* <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-600">Notes (optional)</Label>
              <Input
                placeholder="Any remarks about this allocation…"
                value={loadNotes}
                onChange={e => setLoadNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div> */}
          </div>

          <DialogFooter className="gap-3 pt-5 border-t border-slate-100">
            <Button variant="outline" onClick={() => setLoadDialogOpen(false)} disabled={saving} className="h-10">
              Cancel
            </Button>
            <Button
              onClick={handleLoadSave}
              disabled={saving || selectedTruckIds.size === 0 || !loadPfi}
              className="gap-2 h-10 bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
              {saving
                ? 'Allocating…'
                : `Allocate ${selectedTruckIds.size || ''} Truck${selectedTruckIds.size !== 1 ? 's' : ''}${loadCode ? ` → ${loadCode}` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Confirm Sold Dialog                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!offloadTarget} onOpenChange={open => { if (!open) setOffloadTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <span>Offload Truck</span>
            </DialogTitle>
            <DialogDescription className="pt-1 text-slate-600">
              Mark <strong>{offloadTarget?.truckPlate}</strong> ({fmtQty(offloadTarget?.qty || 0)} {offloadTarget?.unitLabel || 'Litres'}) as offloaded and sold.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {offloadTarget && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Truck</span>
                  <span className="font-semibold text-slate-800">{offloadTarget.truckPlate}</span>
                </div>
                {offloadTarget.code && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PFI Code</span>
                    <span className="font-bold text-slate-800">{offloadTarget.code}</span>
                  </div>
                )}
                {/* {offloadTarget.pfiLabel && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PFI</span>
                    <span className="font-medium text-slate-800">{offloadTarget.pfiLabel}</span>
                  </div>
                )} */}
                <div className="flex justify-between">
                  <span className="text-slate-500">Quantity</span>
                  <span className="font-bold text-slate-800">{fmtQty(offloadTarget.qty)} {offloadTarget.unitLabel}</span>
                </div>
                {offloadTarget.destination && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination</span>
                    <span className="font-medium text-slate-800">{offloadTarget.destination}</span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Date Offloaded</Label>
              <Input type="date" value={offloadDate} onChange={e => setOffloadDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOffloadTarget(null)} disabled={offloading}>Cancel</Button>
            <Button onClick={handleOffload} disabled={offloading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {offloading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {offloading ? 'Offloading...' : 'Offload Truck'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Edit Record Dialog                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Pencil className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <span className="font-bold">Edit Allocation</span>
                <p className="text-sm font-normal text-slate-500 mt-0.5">{editTarget?.truckPlate}</p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Edit allocation record</DialogDescription>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Tag size={13} className="text-blue-600" /> Allocation Code
                </Label>
                <select
                  aria-label="Edit allocation code"
                  value={editForm.code}
                  onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold"
                >
                  <option value="">No code</option>
                  {deliveryCodes.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <FileText size={13} className="text-blue-600" /> PFI
                </Label>
                <select
                  aria-label="Edit PFI"
                  value={editForm.pfi}
                  onChange={e => {
                    const pfiId = e.target.value;
                    const pfi = pfiId ? pfiMap.get(Number(pfiId)) : null;
                    setEditForm(f => ({ ...f, pfi: pfiId, depot: pfi?.location_name || f.depot }));
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm"
                >
                  <option value="">No PFI</option>
                  {allPfiOptions.map(o => <option key={o.id} value={String(o.id)}>{o.label}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <DropletIcon size={13} className="text-blue-600" /> Depot
                </Label>
                <Input
                  placeholder="Depot / loading point"
                  value={editForm.depot}
                  onChange={e => setEditForm(f => ({ ...f, depot: e.target.value }))}
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700">Destination</Label>
                <Input
                  placeholder="e.g. Kano, Abuja"
                  value={editForm.location}
                  onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-blue-600" /> Date Loaded
                </Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Pencil size={15} />}
              {editSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Delete Allocation Record?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Remove <strong>{deleteTarget?.label}</strong> from the inventory.
              This will also permanently delete all associated daily sales records and payments recorded under this truck cycle in the sales ledger.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {deleting ? 'Deleting…' : 'Delete Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Bulk Delete Confirmation                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={bulkDeleteOpen} onOpenChange={open => { if (!open) setBulkDeleteOpen(false); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Delete Selected Records?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              This will permanently delete the <strong>{selectedRowIds.size}</strong> selected allocation records and all their associated daily sales records and payments from the ledger.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="gap-2">
              {bulkDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedRowIds.size} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Bulk Assign Code / PFI Dialog                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={bulkAssignOpen} onOpenChange={open => { if (!open) setBulkAssignOpen(false); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Tag className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <span className="font-bold">Bulk Assign</span>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Updating {selectedRowIds.size} selected record{selectedRowIds.size !== 1 ? 's' : ''}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Bulk assign code and PFI</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Leave a field blank to keep its current value unchanged.
            </p>

            {/* Code */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Tag size={14} className="text-blue-600" /> Allocation Code
              </Label>
              <select
                aria-label="Bulk assign code"
                value={bulkAssignCode}
                onChange={e => setBulkAssignCode(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold"
              >
                <option value="">— Keep existing code —</option>
                <option value="__CLEAR__" className="text-red-600">✕ Remove code (set to none)</option>
                {deliveryCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
              {deliveryCodes.length === 0 && (
                <p className="text-xs text-amber-600">No codes created yet. Create codes in the Allocate Trucks dialog first.</p>
              )}
            </div>

            {/* PFI */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText size={14} className="text-blue-600" /> PFI Source
              </Label>
              <select
                aria-label="Bulk assign PFI"
                value={bulkAssignPfi}
                onChange={e => setBulkAssignPfi(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm"
              >
                <option value="">— Keep existing PFI —</option>
                {allPfiOptions.map(o => (
                  <option key={o.id} value={String(o.id)}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Preview */}
            {(bulkAssignCode || bulkAssignPfi) && (
              <div className={`border rounded-lg p-3 text-sm ${bulkAssignCode === '__CLEAR__'
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
                }`}>
                <p className={`font-semibold mb-1 ${bulkAssignCode === '__CLEAR__' ? 'text-red-800' : 'text-blue-800'
                  }`}>Will apply to {selectedRowIds.size} record{selectedRowIds.size !== 1 ? 's' : ''}:</p>
                <ul className={`space-y-0.5 ${bulkAssignCode === '__CLEAR__' ? 'text-red-700' : 'text-blue-700'
                  }`}>
                  {bulkAssignCode === '__CLEAR__'
                    ? <li>• Remove allocation code (set to none)</li>
                    : bulkAssignCode && <li>• Code → <strong>{bulkAssignCode}</strong></li>
                  }
                  {bulkAssignPfi && <li>• PFI → <strong>{allPfis.find(p => p.id === Number(bulkAssignPfi))?.pfi_number || bulkAssignPfi}</strong></li>}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)} disabled={bulkAssigning}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={bulkAssigning || (!bulkAssignCode && !bulkAssignPfi)}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {bulkAssigning ? <Loader2 size={15} className="animate-spin" /> : <Tag size={15} />}
              {bulkAssigning
                ? `Updating ${selectedRowIds.size} records…`
                : `Apply to ${selectedRowIds.size} Record${selectedRowIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Manage Allocation Codes Dialog                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={manageCodesOpen} onOpenChange={open => {
        setManageCodesOpen(open);
        if (!open) { setNewManageCode(''); setCodeSearchQuery(''); setEditingCode(null); setEditingCodeValue(''); }
      }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Tag className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <span className="font-bold">Manage Allocation Codes</span>
                <p className="text-xs font-normal text-slate-500 mt-0.5">
                  {deliveryCodes.length} code{deliveryCodes.length !== 1 ? 's' : ''} active · sourced from inventory records
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Manage allocation codes list</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Add New Code */}
            <div className="flex gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Create New Code</Label>
                <Input
                  placeholder="e.g. A2, LOAD-003, PFI-15…"
                  value={newManageCode}
                  onChange={e => setNewManageCode(e.target.value.toUpperCase())}
                  className="h-9 font-mono font-bold text-slate-800"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const normalized = newManageCode.trim().toUpperCase().replace(/\s+/g, '-');
                      if (!normalized) return;
                      if (deliveryCodes.includes(normalized)) {
                        toast({ title: `Code "${normalized}" already exists`, variant: 'destructive' });
                        return;
                      }
                      setDeliveryCodes(prev => [...prev, normalized].sort());
                      setNewManageCode('');
                      toast({ title: `Code "${normalized}" created` });
                    }
                  }}
                />
              </div>
              <Button
                size="sm"
                className="h-9 bg-blue-600 hover:bg-blue-700 font-bold px-4 shrink-0"
                disabled={!newManageCode.trim()}
                onClick={() => {
                  const normalized = newManageCode.trim().toUpperCase().replace(/\s+/g, '-');
                  if (!normalized) return;
                  if (deliveryCodes.includes(normalized)) {
                    toast({ title: `Code "${normalized}" already exists`, variant: 'destructive' });
                    return;
                  }
                  setDeliveryCodes(prev => [...prev, normalized].sort());
                  setNewManageCode('');
                  toast({ title: `Code "${normalized}" created` });
                }}
              >
                <Plus size={14} className="mr-1" /> Add
              </Button>
            </div>

            {/* Code List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  All Codes ({deliveryCodes.length})
                </Label>
                <input
                  placeholder="Search…"
                  value={codeSearchQuery}
                  onChange={e => setCodeSearchQuery(e.target.value)}
                  className="h-7 px-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-400 w-28 font-medium"
                />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto divide-y divide-slate-100 bg-white shadow-sm">
                {deliveryCodes.length === 0 ? (
                  <div className="p-6 text-center">
                    <Tag size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400 font-medium">No allocation codes yet.</p>
                    <p className="text-xs text-slate-300 mt-1">Create one above or allocate trucks with a code.</p>
                  </div>
                ) : (() => {
                  const q = codeSearchQuery.trim().toLowerCase();
                  const displayList = q ? deliveryCodes.filter(c => c.toLowerCase().includes(q)) : deliveryCodes;

                  if (displayList.length === 0) {
                    return <p className="p-4 text-center text-sm text-slate-400">No codes match "{codeSearchQuery}"</p>;
                  }

                  // Build per-code truck count map from real inventory data
                  const codeTruckCount: Record<string, number> = {};
                  const codeOffloadedCount: Record<string, number> = {};
                  truckRecords.forEach(r => {
                    if (!r.code) return;
                    codeTruckCount[r.code] = (codeTruckCount[r.code] || 0) + 1;
                    if (r.status === 'offloaded') {
                      codeOffloadedCount[r.code] = (codeOffloadedCount[r.code] || 0) + 1;
                    }
                  });

                  // Codes that come from real inventory records
                  const inventoryCodeSet = new Set(
                    allEntries.map(e => (e.allocation_code || '').trim().toUpperCase()).filter(Boolean)
                  );

                  // Rename handler — updates all inventory records and the codes list
                  const handleRenameCode = async (oldCode: string, newCode: string) => {
                    const normalized = newCode.trim().toUpperCase().replace(/\s+/g, '-');
                    if (!normalized || normalized === oldCode) {
                      setEditingCode(null);
                      return;
                    }
                    if (deliveryCodes.includes(normalized)) {
                      toast({ title: `Code "${normalized}" already exists`, variant: 'destructive' });
                      return;
                    }
                    setRenamingCode(true);
                    try {
                      // Update every inventory record that has the old code
                      const toUpdate = allEntries.filter(
                        e => (e.allocation_code || '').trim().toUpperCase() === oldCode
                      );
                      await Promise.all(
                        toUpdate.map(e =>
                          apiClient.admin.updateDeliveryInventory(e.id, { allocation_code: normalized } as any)
                        )
                      );
                      // Update deliveryCodes list
                      setDeliveryCodes(prev =>
                        prev.map(c => c === oldCode ? normalized : c).sort()
                      );
                      // Update local code map
                      setLoadingCodeMap(prev => {
                        const next: Record<number, string> = {};
                        Object.entries(prev).forEach(([id, c]) => {
                          next[Number(id)] = c === oldCode ? normalized : c;
                        });
                        return next;
                      });

                      // Immediately update ledger settings on the backend to sync all maps
                      if (ledgerSettingsQuery.data) {
                        const currentSettings = ledgerSettingsQuery.data;
                        // Update pfi_code_map
                        const nextPfiCodeMap = { ...currentSettings.pfi_code_map };
                        Object.entries(nextPfiCodeMap).forEach(([pfi, c]) => {
                          if (c === oldCode) nextPfiCodeMap[pfi] = normalized;
                        });
                        // Update sale_trip_map
                        const nextSaleTripMap = { ...currentSettings.sale_trip_map };
                        Object.entries(nextSaleTripMap).forEach(([id, c]) => {
                          if (c === oldCode) nextSaleTripMap[id] = normalized;
                        });
                        // Update loading_code_map
                        const nextLoadingCodeMap = { ...currentSettings.loading_code_map };
                        Object.entries(nextLoadingCodeMap).forEach(([id, c]) => {
                          if (c === oldCode) nextLoadingCodeMap[id] = normalized;
                        });
                        // Update trip_codes (excluding ones from inventory)
                        const manualOnlyCodes = (currentSettings.trip_codes || [])
                          .map((c: string) => c === oldCode ? normalized : c);

                        const updatedSettingsPayload = {
                          ...currentSettings,
                          pfi_code_map: nextPfiCodeMap,
                          sale_trip_map: nextSaleTripMap,
                          loading_code_map: nextLoadingCodeMap,
                          trip_codes: manualOnlyCodes,
                        };

                        await apiClient.admin.updateDeliveryLedgerSettings(updatedSettingsPayload, { key: LEDGER_SETTINGS_KEY });
                        qc.invalidateQueries({ queryKey: ['delivery-ledger-settings', LEDGER_SETTINGS_KEY] });
                      }

                      toast({
                        title: `Code renamed: "${oldCode}" → "${normalized}"`,
                        description: toUpdate.length > 0
                          ? `Updated ${toUpdate.length} inventory record${toUpdate.length !== 1 ? 's' : ''}`
                          : 'Manual code renamed',
                      });
                      setEditingCode(null);
                      invalidateAll();
                    } catch (err: unknown) {
                      toast({
                        title: 'Rename failed',
                        description: err instanceof Error ? err.message : 'Please try again',
                        variant: 'destructive',
                      });
                    } finally {
                      setRenamingCode(false);
                    }
                  };

                  return displayList.map(code => {
                    const total = codeTruckCount[code] || 0;
                    const offloaded = codeOffloadedCount[code] || 0;
                    const active = total - offloaded;
                    const isFromInventory = inventoryCodeSet.has(code);
                    const isEditing = editingCode === code;

                    return (
                      <div key={code} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
                        {/* Code badge or rename input */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              autoFocus
                              value={editingCodeValue}
                              onChange={e => setEditingCodeValue(e.target.value.toUpperCase())}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameCode(code, editingCodeValue);
                                if (e.key === 'Escape') { setEditingCode(null); setEditingCodeValue(''); }
                              }}
                              className="font-mono text-sm font-bold border-2 border-blue-400 rounded-lg px-2.5 py-1 w-32 focus:outline-none bg-blue-50 text-slate-800"
                              disabled={renamingCode}
                            />
                            <button
                              type="button"
                              onClick={() => handleRenameCode(code, editingCodeValue)}
                              disabled={renamingCode || !editingCodeValue.trim()}
                              className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-40 transition-colors"
                              title="Save rename"
                            >
                              {renamingCode ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingCode(null); setEditingCodeValue(''); }}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-sm font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg min-w-[80px] text-center">
                            {code}
                          </span>
                        )}

                        {/* Stats — hide when editing */}
                        {!isEditing && (
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            {total > 0 ? (
                              <>
                                <span className="text-xs text-slate-500 font-medium">
                                  {total} truck{total !== 1 ? 's' : ''}
                                </span>
                                {active > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                    {active} active
                                  </span>
                                )}
                                {offloaded > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                    {offloaded} delivered
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                                pending · no trucks yet
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action buttons — only when not editing */}
                        {!isEditing && (
                          <>
                            {/* Rename */}
                            <button
                              type="button"
                              onClick={() => { setEditingCode(code); setEditingCodeValue(code); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                              title={`Rename ${code}`}
                            >
                              <Pencil size={13} />
                            </button>

                            {/* Source badge */}
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${isFromInventory ? 'bg-slate-100 text-slate-500' : 'bg-purple-50 text-purple-600 border border-purple-200'
                              }`}>
                              {isFromInventory ? 'inventory' : 'manual'}
                            </span>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => {
                                if (isFromInventory) {
                                  toast({
                                    title: `Cannot remove "${code}"`,
                                    description: 'This code is assigned to inventory records. Rename or reassign those trucks first.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                setDeliveryCodes(prev => prev.filter(c => c !== code));
                                toast({ title: `Code "${code}" removed` });
                              }}
                              className={`p-1.5 rounded-lg transition-colors shrink-0 ${isFromInventory
                                ? 'text-slate-200 cursor-not-allowed'
                                : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                              title={isFromInventory ? 'Cannot delete — assigned to inventory records' : `Delete ${code}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  });
                })()
                }
              </div>
              <p className="text-[10px] text-slate-400 italic leading-relaxed">
                Codes from inventory records cannot be deleted here. To remove a code completely, reassign or delete the truck entries using it. Manual (pending) codes can be deleted freely.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full bg-slate-900 hover:bg-slate-800 font-semibold" onClick={() => setManageCodesOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
