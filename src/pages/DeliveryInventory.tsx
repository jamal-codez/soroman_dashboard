import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  CalendarDays, X,
} from 'lucide-react';
import {
  format, parseISO, isWithinInterval, startOfDay, endOfDay,
  subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
} from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface FleetTruck {
  id: number;
  plate_number: string;
  driver_name: string;
  driver_phone?: string;
  max_capacity?: number;
  is_active?: boolean;
}

interface DeliveryCustomer {
  id: number;
  customer_name: string;
  phone_number?: string;
  status: string;
  outstanding_limit?: string | number | null;
}

interface BackendPfi {
  id: number;
  pfi_number: string;
  status: 'active' | 'finished';
  location_name?: string;
  product_name?: string;
  starting_qty_litres?: number;
  sold_qty_litres?: number;
}

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
}

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
  qty: number;
};

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

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function DeliveryInventory() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters & Search ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pfiFilter, setPfiFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [truckFilter, setTruckFilter] = useState('');

  // ── Load Trucks Dialog ──────────────────────────────────────────
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [loadPfi, setLoadPfi] = useState('');
  const [loadQty, setLoadQty] = useState('');
  const [loadDepot, setLoadDepot] = useState('');
  const [loadNotes, setLoadNotes] = useState('');
  const [selectedTruckIds, setSelectedTruckIds] = useState<Set<number>>(new Set());
  const [truckCustomers, setTruckCustomers] = useState<Record<number, string>>({});
  const [truckDestinations, setTruckDestinations] = useState<Record<number, string>>({});
  const [truckSearch, setTruckSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Offload Dialog ─────────────────────────────────────────────────
  const [offloadTarget, setOffloadTarget] = useState<TruckRecord | null>(null);
  const [offloadDate, setOffloadDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [offloading, setOffloading] = useState(false);

  // ── Delete Dialog ──────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const inventoryQuery = useQuery({
    queryKey: ['delivery-inventory-all'],
    queryFn: async () =>
      safePaged<InventoryEntry>(
        await apiClient.admin.getDeliveryInventory({ page_size: 5000 }),
      ),
    staleTime: 30_000,
  });
  const allEntries = useMemo(() => inventoryQuery.data?.results || [], [inventoryQuery.data]);

  const trucksQuery = useQuery({
    queryKey: ['fleet-trucks'],
    queryFn: async () =>
      safePaged<FleetTruck>(
        await apiClient.admin.getFleetTrucks({ page_size: 1000 }),
      ),
    staleTime: 60_000,
  });
  const allTrucks = useMemo(() => {
    const trucks = trucksQuery.data?.results || [];
    return trucks.filter(t => t.is_active !== false).sort((a, b) => a.plate_number.localeCompare(b.plate_number));
  }, [trucksQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['delivery-customers-list'],
    queryFn: async () =>
      safePaged<DeliveryCustomer>(
        await apiClient.admin.getDeliveryCustomers({ page_size: 5000 }),
      ),
    staleTime: 60_000,
  });
  const customers = useMemo(
    () => (customersQuery.data?.results || []).filter(c => c.status === 'active'),
    [customersQuery.data],
  );

  const pfisQuery = useQuery({
    queryKey: ['pfis-for-delivery'],
    queryFn: async () =>
      safePaged<BackendPfi>(
        await apiClient.admin.getPfis({ page_size: 1000 }),
      ),
    staleTime: 60_000,
  });
  const allPfis = useMemo(() => pfisQuery.data?.results || [], [pfisQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Lookup Maps
  // ═══════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════
  // Enrich entries → truck records only (skip pure allocations with no truck)
  // ═══════════════════════════════════════════════════════════════════

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
          destination: entry.location || '',
          depotDisplay: entry.depot || entry.pfi_location || pfi?.location_name || '',
          custName: entry.customer_name || customer?.customer_name || '',
          pfiLabel: entry.pfi_number || pfi?.pfi_number || '',
          product: entry.pfi_product || pfi?.product_name || '',
          qty: toNum(entry.quantity_allocated),
        };
      });
  }, [allEntries, truckMap, customerMap, pfiMap]);

  // ═══════════════════════════════════════════════════════════════════
  // Filtering & Sorting — single unified list
  // ═══════════════════════════════════════════════════════════════════

  const hasDateFilter = !!(dateFrom || dateTo);
  const hasAnyFilter = !!(searchQuery || hasDateFilter || statusFilter !== 'all' || pfiFilter || customerFilter || truckFilter);

  const filtered = useMemo(() => {
    let list = [...truckRecords];

    // Status filter
    if (statusFilter === 'active') {
      list = list.filter(r => r.status === 'loaded');
    } else if (statusFilter === 'delivered') {
      list = list.filter(r => r.status === 'offloaded');
    }

    // PFI filter
    if (pfiFilter) {
      list = list.filter(r => r.pfi === Number(pfiFilter));
    }

    // Customer filter
    if (customerFilter) {
      list = list.filter(r => r.customer === Number(customerFilter));
    }

    // Truck filter
    if (truckFilter) {
      list = list.filter(r => r.truckPlate === truckFilter);
    }

    // Date range filter (date_offloaded for delivered, date_allocated for active)
    if (dateFrom || dateTo) {
      list = list.filter(r => {
        const dateStr = r.date_offloaded || r.date_allocated;
        if (!dateStr) return false;
        const d = startOfDay(parseISO(dateStr));
        if (dateFrom && dateTo) {
          return isWithinInterval(d, {
            start: startOfDay(parseISO(dateFrom)),
            end: endOfDay(parseISO(dateTo)),
          });
        }
        if (dateFrom) return d >= startOfDay(parseISO(dateFrom));
        if (dateTo) return d <= endOfDay(parseISO(dateTo));
        return true;
      });
    }

    // Text search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.truckPlate.toLowerCase().includes(q) ||
        e.driverName.toLowerCase().includes(q) ||
        e.destination.toLowerCase().includes(q) ||
        e.depotDisplay.toLowerCase().includes(q) ||
        e.custName.toLowerCase().includes(q) ||
        e.pfiLabel.toLowerCase().includes(q) ||
        e.product.toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q),
      );
    }

    // Sort: Active (loaded) first, then delivered, each group by most recent date
    return list.sort((a, b) => {
      const statusOrder = { loaded: 0, offloaded: 1, empty: 2 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      const dateA = a.date_offloaded || a.date_allocated || '';
      const dateB = b.date_offloaded || b.date_allocated || '';
      return dateB.localeCompare(dateA);
    });
  }, [truckRecords, statusFilter, pfiFilter, customerFilter, truckFilter, dateFrom, dateTo, searchQuery]);

  // ═══════════════════════════════════════════════════════════════════
  // Summaries
  // ═══════════════════════════════════════════════════════════════════

  // Always-live active counts (unfiltered — for cards & load-dialog)
  const activeRecords = useMemo(
    () => truckRecords.filter(r => r.status === 'loaded'),
    [truckRecords],
  );

  const totals = useMemo(() => {
    let totalInTransit = 0;
    let totalDelivered = 0;
    let deliveredTrips = 0;

    // Active trucks — always from full data (not filtered)
    activeRecords.forEach(r => { totalInTransit += r.qty; });

    // Delivered stats from filtered list so cards reflect filters
    filtered.forEach(r => {
      if (r.status === 'offloaded') {
        totalDelivered += r.qty;
        deliveredTrips++;
      }
    });

    // Distinct PFIs across filtered data
    const pfiIds = new Set<number>();
    filtered.forEach(r => { if (r.pfi) pfiIds.add(r.pfi); });

    return {
      activeCount: activeRecords.length,
      totalInTransit,
      totalDelivered,
      deliveredTrips,
      activePfiCount: pfiIds.size,
    };
  }, [activeRecords, filtered]);

  // Trucks currently loaded → exclude from "Load Truck" dialog
  const loadedTruckPlates = useMemo(() => {
    const set = new Set<string>();
    activeRecords.forEach(r => set.add(r.truckPlate));
    return set;
  }, [activeRecords]);

  const availableTrucks = useMemo(
    () => allTrucks.filter(t => !loadedTruckPlates.has(t.plate_number)),
    [allTrucks, loadedTruckPlates],
  );

  const periodLabel = hasDateFilter
    ? `${dateFrom ? format(parseISO(dateFrom), 'dd MMM') : '…'} – ${dateTo ? format(parseISO(dateTo), 'dd MMM yyyy') : '…'}`
    : 'all time';

  const summaryCards = useMemo((): SummaryCard[] => [
    {
      title: 'Trucks Loaded',
      value: String(totals.activeCount),
      // description: totals.activeCount > 0
      //   ? `${fmtQty(totals.totalInTransit)} L loaded right now`
      //   : 'No trucks currently loaded',
      icon: <Truck size={20} />,
      tone: totals.activeCount > 0 ? 'amber' : 'neutral',
    },
    {
      title: 'Current Volume Allocated',
      value: `${fmtQty(totals.totalInTransit)} L`,
      // description: totals.activeCount > 0
      //   ? `Across ${totals.activeCount} truck${totals.activeCount !== 1 ? 's' : ''} in transit`
      //   : 'Nothing loaded',
      icon: <DropletIcon size={20} />,
      tone: totals.totalInTransit > 0 ? 'amber' : 'neutral',
    },
    {
      title: 'Quantity Sold',
      value: `${fmtQty(totals.totalDelivered)} L`,
      // description: `${totals.deliveredTrips} trip${totals.deliveredTrips !== 1 ? 's' : ''} · ${periodLabel}`,
      icon: <CheckCircle2 size={20} />,
      tone: 'green',
    },
    // {
    //   title: 'Active PFIs',
    //   value: String(totals.activePfiCount),
    //   description: totals.activePfiCount > 0
    //     ? `Used across ${totals.activePfiCount} PFI${totals.activePfiCount !== 1 ? 's' : ''}`
    //     : 'No PFIs in use',
    //   icon: <FileText size={20} />,
    //   tone: totals.activePfiCount > 0 ? 'neutral' : 'neutral',
    // },
  ], [totals, periodLabel]);

  // PFI options (active first, then finished)
  const pfiOptions = useMemo(() => {
    return allPfis
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return a.pfi_number.localeCompare(b.pfi_number);
      })
      .map(p => ({
        id: p.id,
        label: `${p.pfi_number} — ${p.product_name || 'N/A'} · ${p.location_name || 'N/A'}${p.status === 'finished' ? '  (finished)' : ''}`,
      }));
  }, [allPfis]);

  // Selected PFI for auto-fill in dialog
  const selectedPfi = useMemo(() => {
    if (!loadPfi) return null;
    return pfiMap.get(Number(loadPfi)) || null;
  }, [loadPfi, pfiMap]);

  // Distinct trucks that appear in records (for truck filter dropdown)
  const distinctTruckPlates = useMemo(() => {
    const set = new Set<string>();
    truckRecords.forEach(r => { if (r.truckPlate && r.truckPlate !== '—') set.add(r.truckPlate); });
    return [...set].sort();
  }, [truckRecords]);

  // Distinct PFIs that appear in records (for PFI filter dropdown)
  const distinctPfis = useMemo(() => {
    const map = new Map<number, string>();
    truckRecords.forEach(r => { if (r.pfi) map.set(r.pfi, r.pfiLabel); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [truckRecords]);

  // Distinct customers that appear in records (for customer filter dropdown)
  const distinctCustomers = useMemo(() => {
    const map = new Map<number, string>();
    truckRecords.forEach(r => { if (r.customer) map.set(r.customer, r.custName); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [truckRecords]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['delivery-inventory'] });
    qc.invalidateQueries({ queryKey: ['delivery-inventory-all'] });
    qc.invalidateQueries({ queryKey: ['delivery-sales'] });
  }, [qc]);

  const openLoadDialog = () => {
    setLoadPfi('');
    setLoadQty('');
    setLoadDepot('');
    setLoadNotes('');
    setSelectedTruckIds(new Set());
    setTruckCustomers({});
    setTruckDestinations({});
    setTruckSearch('');
    setLoadDialogOpen(true);
  };

  const toggleTruck = (truckId: number) => {
    setSelectedTruckIds(prev => {
      const next = new Set(prev);
      if (next.has(truckId)) {
        next.delete(truckId);
        setTruckCustomers(tc => { const c = { ...tc }; delete c[truckId]; return c; });
        setTruckDestinations(td => { const d = { ...td }; delete d[truckId]; return d; });
      } else {
        next.add(truckId);
      }
      return next;
    });
  };

  const handleLoadSave = useCallback(async () => {
    if (selectedTruckIds.size === 0) {
      toast({ title: 'Select at least one truck', variant: 'destructive' });
      return;
    }
    const totalQty = Number(stripCommas(loadQty));
    if (!totalQty || totalQty <= 0) {
      toast({ title: 'Quantity must be greater than 0', variant: 'destructive' });
      return;
    }

    const truckCount = selectedTruckIds.size;
    const qtyPerTruck = Math.round(totalQty / truckCount);

    setSaving(true);
    try {
      const depot = loadDepot || selectedPfi?.location_name || '';
      const currentUser = localStorage.getItem('fullname') || 'Unknown';
      const promises = [...selectedTruckIds].map(truckId => {
        const truckObj = allTrucks.find(t => t.id === truckId);
        const custId = truckCustomers[truckId];
        const custObj = custId ? customers.find(c => String(c.id) === custId) : null;
        const dest = truckDestinations[truckId]?.trim() || '';

        return apiClient.admin.createDeliveryInventory({
          pfi: loadPfi ? Number(loadPfi) : undefined,
          truck: truckId,
          truck_number: truckObj?.plate_number || '',
          depot: depot || undefined,
          location: dest || undefined,
          customer: custId ? Number(custId) : undefined,
          customer_name: custObj?.customer_name || undefined,
          quantity_allocated: qtyPerTruck,
          date_allocated: format(new Date(), 'yyyy-MM-dd'),
          loading_status: 'loaded',
          notes: loadNotes.trim() || undefined,
          created_by: currentUser,
        });
      });

      await Promise.all(promises);
      toast({
        title: `${truckCount} truck${truckCount > 1 ? 's' : ''} loaded — ${fmtQty(totalQty)} L total`,
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
  }, [selectedTruckIds, loadQty, loadPfi, loadDepot, loadNotes, selectedPfi, truckCustomers, truckDestinations, allTrucks, customers, toast, invalidateAll]);

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
      toast({ title: `${offloadTarget.truckPlate} marked as delivered` });
      setOffloadTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to offload',
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
      await apiClient.admin.deleteDeliveryInventory(deleteTarget.id);
      toast({ title: 'Record deleted' });
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
  }, [deleteTarget, toast, invalidateAll]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setPfiFilter('');
    setCustomerFilter('');
    setTruckFilter('');
  };

  const exportExcel = useCallback(() => {
    if (!filtered.length) return;
    const rows = filtered.map((r, idx) => ({
      'S/N': idx + 1,
      'Truck': r.truckPlate,
      'Driver': r.driverName || '—',
      'PFI': r.pfiLabel || '—',
      'Product': r.product || '—',
      'Customer': r.custName || '—',
      'Depot': r.depotDisplay || '—',
      'Destination': r.destination || '—',
      'Quantity (L)': r.qty,
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
    const dateSuffix = hasDateFilter
      ? `${dateFrom || 'START'}-to-${dateTo || 'NOW'}`
      : format(new Date(), 'dd-MM-yyyy');
    XLSX.writeFile(wb, `DELIVERY-INVENTORY-${dateSuffix}.xlsx`);
  }, [filtered, hasDateFilter, dateFrom, dateTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = inventoryQuery.isLoading || trucksQuery.isLoading || pfisQuery.isLoading;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">

            {/* ── Header ──────────────────────────────────────── */}
            <PageHeader
              title="Delivery Inventory"
              description="Track truck loading cycles — from depot to delivery."
              actions={
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={exportExcel} disabled={filtered.length === 0}>
                    <Download size={16} /> Export
                  </Button>
                  <Button className="gap-2" onClick={openLoadDialog}>
                    <Plus size={16} /> Allocate Trucks
                  </Button>
                </div>
              }
            />

            {/* ── Summary Cards ───────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Period indicator ────────────────────────────── */}
            {hasDateFilter && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <CalendarDays size={15} className="shrink-0" />
                <span>
                  Showing data for <strong>{periodLabel}</strong>
                  {' '}— cards and table reflect this period.
                </span>
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-medium underline underline-offset-2"
                >
                  Clear filter
                </button>
              </div>
            )}

            {/* ── Search + Filters Bar ─────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              {/* Row 1: Search + record count */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search truck, driver, PFI, product, customer, depot, destination…"
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                {/* <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '…' : `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
                </div> */}
              </div>

              {/* Row 2: Filter dropdowns — always visible */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
                {/* Status */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</label>
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">In Transit</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>

                {/* Truck */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Truck</label>
                  <select
                    aria-label="Filter by truck"
                    value={truckFilter}
                    onChange={e => setTruckFilter(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All Trucks</option>
                    {distinctTruckPlates.map(plate => (
                      <option key={plate} value={plate}>{plate}</option>
                    ))}
                  </select>
                </div>

                {/* PFI */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">PFI</label>
                  <select
                    aria-label="Filter by PFI"
                    value={pfiFilter}
                    onChange={e => setPfiFilter(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All PFIs</option>
                    {distinctPfis.map(([id, label]) => (
                      <option key={id} value={String(id)}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Customer */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Customer</label>
                  <select
                    aria-label="Filter by customer"
                    value={customerFilter}
                    onChange={e => setCustomerFilter(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All Customers</option>
                    {distinctCustomers.map(([id, name]) => (
                      <option key={id} value={String(id)}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Clear all */}
                {hasAnyFilter && (
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-slate-500 hover:text-slate-700 h-9"
                      onClick={clearAllFilters}
                    >
                      <X size={13} /> Clear all
                    </Button>
                  </div>
                )}
              </div>

              {/* Row 3: Date range + timeframe presets */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <CalendarDays size={16} className="text-slate-400 shrink-0" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-9 w-[140px] text-sm"
                    title="From date"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-9 w-[140px] text-sm"
                    title="To date"
                  />
                  {hasDateFilter && (
                    <button
                      type="button"
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Clear date filter"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Timeframe presets */}
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
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (isActive) { setDateFrom(''); setDateTo(''); }
                          else { setDateFrom(pFrom); setDateTo(pTo); }
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Table ───────────────────────────────────────── */}
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
                      : 'Load a truck to start tracking deliveries.'}
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
                        <TableHead className="font-semibold text-slate-700 w-[48px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck</TableHead>
                        <TableHead className="font-semibold text-slate-700">PFI</TableHead>
                        <TableHead className="font-semibold text-slate-700">Product</TableHead>
                        <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                        <TableHead className="font-semibold text-slate-700">Depot</TableHead>
                        <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                        <TableHead className="font-semibold text-slate-700">Qty (L)</TableHead>
                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Loaded</TableHead>
                        <TableHead className="font-semibold text-slate-700">Allocated By</TableHead>
                        <TableHead className="font-semibold text-slate-700">Date Sold</TableHead>
                        <TableHead className="font-semibold text-slate-700">Confirmed By</TableHead>
                        <TableHead className="font-semibold text-slate-700 w-[130px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r, idx) => {
                        const badge = statusBadge[r.status];
                        const Icon = badge?.icon;

                        return (
                          <TableRow
                            key={r.id}
                            className={`hover:bg-slate-50/60 transition-colors ${
                              r.status === 'loaded' ? 'bg-blue-50/20' : ''
                            }`}
                          >
                            <TableCell className="text-slate-500">{idx + 1}</TableCell>

                            {/* Truck */}
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  {/* <Truck size={13} className="text-slate-400" /> */}
                                  {r.truckPlate}
                                </span>
                                {/* {r.driverName && (
                                  <span className="text-xs text-slate-500">{r.driverName}</span>
                                )} */}
                              </div>
                            </TableCell>

                            {/* PFI */}
                            <TableCell className="text-slate-700 font-medium whitespace-nowrap">
                              {r.pfiLabel || '—'}
                            </TableCell>

                            {/* Product */}
                            <TableCell className="font-medium text-slate-700 whitespace-nowrap">
                              {r.product || '—'}
                            </TableCell>

                            {/* Customer */}
                            <TableCell className="font-medium text-slate-700 capitalize whitespace-nowrap">
                              {r.custName || '—'}
                            </TableCell>

                            {/* Depot */}
                            <TableCell className="text-slate-600">{r.depotDisplay || '—'}</TableCell>

                            {/* Destination */}
                            <TableCell className="text-slate-600">{r.destination || '—'}</TableCell>

                            {/* Qty */}
                            <TableCell className="font-bold text-slate-800">
                              {r.qty > 0 ? fmtQty(r.qty) : '—'}
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              {badge && Icon ? (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
                                  <Icon size={12} />
                                  {badge.label}
                                </span>
                              ) : '—'}
                            </TableCell>

                            {/* Date Loaded */}
                            <TableCell className="whitespace-nowrap text-slate-600">
                              {r.date_allocated
                                ? format(parseISO(r.date_allocated), 'dd MMM yyyy')
                                : '—'}
                            </TableCell>

                            {/* Loaded By */}
                            <TableCell className="whitespace-nowrap text-slate-600 text-sm">
                              {r.created_by || '—'}
                            </TableCell>

                            {/* Date Offloaded */}
                            <TableCell className="whitespace-nowrap text-slate-600">
                              {r.date_offloaded
                                ? format(parseISO(r.date_offloaded), 'dd MMM yyyy')
                                : '—'}
                            </TableCell>                            

                            {/* Offloaded By */}
                            <TableCell className="whitespace-nowrap text-slate-600 text-sm">
                              {r.offloaded_by || '—'}
                            </TableCell>

                            {/* Actions */}
                            <TableCell>
                              <div className="flex gap-1">
                                {r.status === 'loaded' && (
                                  <Button
                                    size="sm" variant="outline"
                                    className="gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                    onClick={() => {
                                      setOffloadTarget(r);
                                      setOffloadDate(format(new Date(), 'yyyy-MM-dd'));
                                    }}
                                    title="Mark as offloaded / delivered"
                                  >
                                    <CheckCircle2 size={13} /> Confirm Sold
                                  </Button>
                                )}
                                {/* <Button
                                  size="sm" variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                  title="Delete record"
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: r.id,
                                      label: `${r.truckPlate} — ${fmtQty(r.qty)} L`,
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </Button> */}
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

            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filtered.length} of {truckRecords.length} records
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Load Trucks Dialog                                               */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Load Trucks</h2>
                <p className="text-sm font-normal text-slate-500 mt-0.5">
                  Select PFI, enter quantity, pick trucks, and assign customers.
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Load multiple trucks for delivery
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* ── PFI Source ───────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-500" />
                PFI Source <span className="text-red-500">*</span>
              </Label>
              <select
                aria-label="Select PFI"
                value={loadPfi}
                onChange={e => {
                  const pfiId = e.target.value;
                  const pfi = pfiId ? pfiMap.get(Number(pfiId)) : null;
                  setLoadPfi(pfiId);
                  if (pfi?.location_name) setLoadDepot(pfi.location_name);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select PFI…</option>
                {pfiOptions.map(o => (
                  <option key={o.id} value={String(o.id)}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* ── PFI details ─────────────────────────────────── */}
            {selectedPfi && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-2">PFI Details</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Product</span>
                    <p className="font-medium text-slate-800">{selectedPfi.product_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Depot</span>
                    <p className="font-medium text-slate-800">{selectedPfi.location_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">PFI Qty</span>
                    <p className="font-medium text-slate-800">
                      {selectedPfi.starting_qty_litres ? `${fmtQty(selectedPfi.starting_qty_litres)} L` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Status</span>
                    <p className={`font-medium ${selectedPfi.status === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {selectedPfi.status === 'active' ? 'Active' : 'Finished'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Total Quantity ───────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <DropletIcon size={15} className="text-slate-500" />
                Total Quantity (Litres) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 500,000"
                value={loadQty}
                onChange={e => setLoadQty(formatWithCommas(e.target.value))}
              />
              {selectedTruckIds.size > 0 && loadQty && (
                <p className="text-xs text-slate-500">
                  ≈ {fmtQty(Math.round(Number(stripCommas(loadQty)) / selectedTruckIds.size))} L per truck
                  ({selectedTruckIds.size} truck{selectedTruckIds.size !== 1 ? 's' : ''} selected)
                </p>
              )}
            </div>

            {/* ── Depot + Notes ─────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Depot</Label>
                <Input
                  placeholder="Auto-filled from PFI"
                  value={loadDepot}
                  onChange={e => setLoadDepot(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Notes</Label>
                <Input
                  placeholder="Optional…"
                  value={loadNotes}
                  onChange={e => setLoadNotes(e.target.value)}
                />
              </div>
            </div>

            {/* ── Select Trucks ────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Truck size={15} className="text-slate-500" />
                Select Trucks <span className="text-red-500">*</span>
                {selectedTruckIds.size > 0 && (
                  <span className="ml-auto text-xs font-normal text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {selectedTruckIds.size} selected
                  </span>
                )}
              </Label>

              {/* Truck search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <Input
                  placeholder="Search trucks by plate or driver…"
                  className="pl-8 h-9 text-sm"
                  value={truckSearch}
                  onChange={e => setTruckSearch(e.target.value)}
                />
              </div>

              {/* Truck buttons grid */}
              <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg p-2">
                {(() => {
                  const q = truckSearch.trim().toLowerCase();
                  const visibleTrucks = q
                    ? availableTrucks.filter(t =>
                        t.plate_number.toLowerCase().includes(q) ||
                        (t.driver_name || '').toLowerCase().includes(q),
                      )
                    : availableTrucks;

                  if (visibleTrucks.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 text-center py-4">
                        {availableTrucks.length === 0
                          ? 'All trucks are currently loaded'
                          : 'No trucks match your search'}
                      </p>
                    );
                  }

                  return (
                    <div className="flex flex-wrap gap-2">
                      {visibleTrucks.map(t => {
                        const isSelected = selectedTruckIds.has(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTruck(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                          >
                            <Truck size={13} />
                            <span>{t.plate_number}</span>
                            {t.driver_name && (
                              <span className={`text-xs ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                · {t.driver_name}
                              </span>
                            )}
                            {t.max_capacity && (
                              <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-slate-300'}`}>
                                {fmtQty(t.max_capacity)}L
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {availableTrucks.length === 0 && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={11} /> All trucks are currently loaded
                </p>
              )}
            </div>

            {/* ── Assign Customers & Destinations (per truck) ── */}
            {selectedTruckIds.size > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Per-Truck Assignment
                  <span className="text-xs font-normal text-slate-400 ml-1.5">(customer & destination per truck)</span>
                </Label>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
                  {[...selectedTruckIds].map(truckId => {
                    const truck = allTrucks.find(t => t.id === truckId);
                    if (!truck) return null;
                    return (
                      <div key={truckId} className="px-3 py-2.5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Truck size={13} className="text-blue-500 shrink-0" />
                          <span className="text-sm font-semibold text-slate-800">{truck.plate_number}</span>
                          {truck.driver_name && (
                            <span className="text-xs text-slate-400">· {truck.driver_name}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            aria-label={`Customer for ${truck.plate_number}`}
                            value={truckCustomers[truckId] || ''}
                            onChange={e => setTruckCustomers(tc => ({ ...tc, [truckId]: e.target.value }))}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                          >
                            <option value="">No customer</option>
                            {customers.map(c => (
                              <option key={c.id} value={String(c.id)}>{c.customer_name}</option>
                            ))}
                          </select>
                          <Input
                            placeholder="Destination (e.g. Kano, Abuja…)"
                            value={truckDestinations[truckId] || ''}
                            onChange={e => setTruckDestinations(td => ({ ...td, [truckId]: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Summary ─────────────────────────────────────── */}
            {selectedTruckIds.size > 0 && loadQty && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 font-semibold mb-1">Loading Summary</p>
                <p className="text-lg font-bold text-slate-800">
                  {formatWithCommas(stripCommas(loadQty))} L
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    across {selectedTruckIds.size} truck{selectedTruckIds.size !== 1 ? 's' : ''}
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  ≈ {fmtQty(Math.round(Number(stripCommas(loadQty)) / selectedTruckIds.size))} L per truck
                  {selectedPfi ? ` · ${selectedPfi.pfi_number} · ${selectedPfi.product_name || '—'}` : ''}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLoadDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleLoadSave} disabled={saving || selectedTruckIds.size === 0} className="gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
              {saving
                ? 'Loading…'
                : `Load ${selectedTruckIds.size || ''} Truck${selectedTruckIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Offload Dialog                                                   */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!offloadTarget} onOpenChange={open => { if (!open) setOffloadTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <span>Mark as Delivered</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Mark <strong>{offloadTarget?.truckPlate}</strong> ({fmtQty(offloadTarget?.qty || 0)} L)
              as offloaded at destination.
              {offloadTarget?.custName && (
                <> Customer: <strong>{offloadTarget.custName}</strong>.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {offloadTarget && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Truck</span>
                  <span className="font-medium text-slate-800">{offloadTarget.truckPlate}</span>
                </div>
                {offloadTarget.pfiLabel && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">PFI</span>
                    <span className="font-medium text-slate-800">{offloadTarget.pfiLabel}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Quantity</span>
                  <span className="font-bold text-slate-800">{fmtQty(offloadTarget.qty)} L</span>
                </div>
                {offloadTarget.destination && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Destination</span>
                    <span className="font-medium text-slate-800">{offloadTarget.destination}</span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Date Offloaded</Label>
              <Input type="date" value={offloadDate} onChange={e => setOffloadDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOffloadTarget(null)} disabled={offloading}>Cancel</Button>
            <Button onClick={handleOffload} disabled={offloading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {offloading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {offloading ? 'Confirming…' : 'Confirm Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* Delete Confirmation                                              */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <span>Delete Record?</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>? This can't be undone.
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
