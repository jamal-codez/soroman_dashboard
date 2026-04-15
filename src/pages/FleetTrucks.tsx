// filepath: /Users/sableboxx/soroman_dashboard-2/src/pages/FleetTrucks.tsx
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Search, Download, Loader2, Truck, Pencil, Trash2,
  Phone, User, Hash, FileText, TrendingDown, TrendingUp, Wallet,
  ArrowUpDown, Eye, Calendar as CalendarIcon, Fuel, Camera, AlertTriangle, Users,
  Star, MapPin, Clock, Shield, Wrench, Upload, X, CircleAlert,
  TruckIcon,
  FuelIcon,
  RouteIcon,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface FleetTruck {
  id: number;
  plate_number: string;
  chassis_number?: string;
  truck_make?: string;
  max_capacity?: number;
  driver_name: string;
  driver_phone?: string;
  driver_alt_phone?: string;
  motor_boy_name?: string;
  motor_boy_phone1?: string;
  motor_boy_phone2?: string;
  spare_driver_name?: string;
  spare_driver_phone?: string;
  passport_photo?: string;
  truck_status?: string;
  // Insurance & Road Worthiness
  insurance_expiry?: string;
  road_worthiness_expiry?: string;
  // Maintenance
  last_service_date?: string;
  next_service_date?: string;
  mileage?: number;
  // Fuel
  fuel_capacity?: number;
  avg_litres_per_trip?: number;
  // Documents (base64-encoded file uploads)
  insurance_cert_doc?: string;
  vehicle_papers_doc?: string;
  drivers_license_doc?: string;
  // Incident / accident history (JSON string: array of { date, description })
  incidents?: string;
  notes?: string;
  is_active?: boolean;
  created_at?: string;
}

interface LedgerEntry {
  id: number;
  truck: number;
  truck_plate?: string;
  truck_driver?: string;
  entry_type: 'expense' | 'income';
  category: string;
  amount: string | number;
  date: string;
  description?: string;
  entered_by?: string;
  created_at?: string;
}

type PagedResponse<T> = { count: number; results: T[] };

type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

type SortField = 'plate' | 'debits' | 'credits' | 'balance';
type SortDir = 'asc' | 'desc';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const fmt = (n: number) =>
  `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtShort = (n: number) => fmt(n);

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Format a raw string with thousand separators for display in input */
const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9]/g, '');
  const intPart = cleaned.replace(/^0+(?=\d)/, '');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** Strip commas to get a raw number string */
const stripCommas = (v: string): string => v.replace(/,/g, '');

const safePaged = <T,>(raw: unknown): PagedResponse<T> => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.results)) return { count: Number(r.count ?? r.results.length), results: r.results as T[] };
    if (Array.isArray(raw)) return { count: (raw as T[]).length, results: raw as T[] };
  }
  return { count: 0, results: [] };
};

const TRUCK_STATUS_OPTIONS = ['Excellent', 'Good', 'Fair', 'Bad'] as const;
type TruckStatusRating = typeof TRUCK_STATUS_OPTIONS[number];

const statusColors: Record<TruckStatusRating, { badge: string; text: string }> = {
  'Excellent': { badge: 'text-emerald-700 border-emerald-300 bg-emerald-50', text: 'text-emerald-700' },
  'Good': { badge: 'text-blue-700 border-blue-300 bg-blue-50', text: 'text-blue-700' },
  'Fair': { badge: 'text-amber-700 border-amber-300 bg-amber-50', text: 'text-amber-700' },
  'Bad': { badge: 'text-red-700 border-red-300 bg-red-50', text: 'text-red-700' },
};

/** Parse stored truck_status like "Bad — no tyres" into { rating, reason } */
const parseStatus = (raw?: string): { rating: TruckStatusRating; reason: string } => {
  if (!raw) return { rating: 'Good', reason: '' };
  for (const opt of TRUCK_STATUS_OPTIONS) {
    if (raw === opt) return { rating: opt, reason: '' };
    if (raw.startsWith(`${opt} — `)) return { rating: opt, reason: raw.slice(opt.length + 3) };
  }
  // Legacy: free-text status → treat as Bad with the text as reason
  return { rating: 'Bad', reason: raw };
};

/** Encode { rating, reason } back into a single string for storage */
const encodeStatus = (rating: TruckStatusRating, reason: string): string => {
  const trimmed = reason.trim();
  if (!trimmed || rating === 'Excellent' || rating === 'Good') return rating;
  return `${rating} — ${trimmed}`;
};

/** Incident entry stored as JSON array in truck.incidents */
interface IncidentEntry {
  date: string;
  description: string;
}

const parseIncidents = (raw?: string): IncidentEntry[] => {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
};

/** Check if a date string is expired (before today) */
const isExpired = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  try { return parseISO(dateStr) < startOfDay(new Date()); } catch { return false; }
};

/** Check if a date string is expiring within N days */
const isExpiringSoon = (dateStr?: string, withinDays = 30): boolean => {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    const now = new Date();
    return d >= startOfDay(now) && d <= endOfDay(subDays(now, -withinDays));
  } catch { return false; }
};

const matchesDateRange = (dateStr: string | undefined, from: Date | null, to: Date | null): boolean => {
  if (!dateStr || (!from && !to)) return true;
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (from && to) return isWithinInterval(d, { start: startOfDay(from), end: endOfDay(to) });
    if (from) return d >= startOfDay(from);
    if (to) return d <= endOfDay(to);
    return true;
  } catch { return true; }
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

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function FleetTrucks() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Filters ────────────────────────────────────────────────────────
  const [timePreset, setTimePreset] = useState<TimePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [truckSearch, setTruckSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ── Drill-down ─────────────────────────────────────────────────────
  const [selectedTruck, setSelectedTruck] = useState<FleetTruck | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailTypeFilter, setDetailTypeFilter] = useState<string>('all');
  const [showPersonnel, setShowPersonnel] = useState(false);

  // ── Truck CRUD dialog ──────────────────────────────────────────────
  const [truckDialogOpen, setTruckDialogOpen] = useState(false);
  const [truckEditing, setTruckEditing] = useState<FleetTruck | null>(null);
  const [truckForm, setTruckForm] = useState({
    plate_number: '', chassis_number: '', truck_make: '',
    driver_name: '', driver_phone: '', driver_alt_phone: '',
    motor_boy_name: '', motor_boy_phone1: '', motor_boy_phone2: '',
    spare_driver_name: '', spare_driver_phone: '',
    passport_photo: '',
    truck_status_rating: 'Good' as TruckStatusRating,
    truck_status_reason: '',
    max_capacity: '', notes: '',
    // New fields
    insurance_expiry: '', road_worthiness_expiry: '',
    last_service_date: '', next_service_date: '', mileage: '',
    fuel_capacity: '', avg_litres_per_trip: '',
    insurance_cert_doc: '', vehicle_papers_doc: '', drivers_license_doc: '',
    incidents: [] as IncidentEntry[],
    new_incident_date: '', new_incident_desc: '',
  });
  const [truckSaving, setTruckSaving] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Inline status update ───────────────────────────────────────────
  const [statusSaving, setStatusSaving] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════

  const trucksQuery = useQuery({
    queryKey: ['fleet-trucks'],
    queryFn: async () => safePaged<FleetTruck>(await apiClient.admin.getFleetTrucks({ page_size: 500 })),
    staleTime: 30_000,
  });
  const trucks = useMemo(() => trucksQuery.data?.results || [], [trucksQuery.data]);

  const ledgerQuery = useQuery({
    queryKey: ['fleet-ledger'],
    queryFn: async () => safePaged<LedgerEntry>(await apiClient.admin.getFleetLedger({ page_size: 5000 })),
    staleTime: 30_000,
  });
  const allEntries = useMemo(() => ledgerQuery.data?.results || [], [ledgerQuery.data]);

  // ═══════════════════════════════════════════════════════════════════
  // Date range logic
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

  const filteredEntries = useMemo(
    () => allEntries.filter(e => matchesDateRange(e.date, dateRange.from, dateRange.to)),
    [allEntries, dateRange]
  );

  // ═══════════════════════════════════════════════════════════════════
  // Per-truck summaries
  // ═══════════════════════════════════════════════════════════════════

  const truckSummaries = useMemo(() => {
    const map = new Map<number, { debits: number; credits: number }>();
    filteredEntries.forEach(e => {
      const cur = map.get(e.truck) || { debits: 0, credits: 0 };
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') cur.debits += a;
      else cur.credits += a;
      map.set(e.truck, cur);
    });
    return map;
  }, [filteredEntries]);

  // ── Per-truck trip stats (all-time, from all income entries) ────────
  const truckTripStats = useMemo(() => {
    const map = new Map<number, { totalTrips: number; totalRevenue: number; lastTripDate: string | null; trips: LedgerEntry[] }>();
    // Use ALL entries (not filtered by date) for lifetime trip count
    allEntries
      .filter(e => e.entry_type === 'income')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .forEach(e => {
        const cur = map.get(e.truck) || { totalTrips: 0, totalRevenue: 0, lastTripDate: null, trips: [] };
        cur.totalTrips += 1;
        cur.totalRevenue += toNum(e.amount);
        if (!cur.lastTripDate) cur.lastTripDate = e.date;
        cur.trips.push(e);
        map.set(e.truck, cur);
      });
    return map;
  }, [allEntries]);

  // ── Global totals ──────────────────────────────────────────────────

  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    filteredEntries.forEach(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') debits += a;
      else credits += a;
    });
    return { debits, credits, balance: credits - debits, truckCount: trucks.length, entries: filteredEntries.length };
  }, [filteredEntries, trucks]);

  // ── Sorted & filtered trucks ───────────────────────────────────────

  const displayTrucks = useMemo(() => {
    let list = trucks.map(t => {
      const s = truckSummaries.get(t.id) || { debits: 0, credits: 0 };
      return { ...t, debits: s.debits, credits: s.credits, balance: s.credits - s.debits };
    });

    if (truckSearch.trim()) {
      const q = truckSearch.toLowerCase();
      list = list.filter(t =>
        t.plate_number.toLowerCase().includes(q) ||
        t.driver_name.toLowerCase().includes(q) ||
        (t.driver_phone || '').includes(q) ||
        (t.chassis_number || '').toLowerCase().includes(q) ||
        (t.truck_make || '').toLowerCase().includes(q) ||
        (t.motor_boy_name || '').toLowerCase().includes(q) ||
        (t.spare_driver_name || '').toLowerCase().includes(q) ||
        (t.truck_status || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'plate': cmp = a.plate_number.localeCompare(b.plate_number); break;
        case 'debits': cmp = a.debits - b.debits; break;
        case 'credits': cmp = a.credits - b.credits; break;
        case 'balance': cmp = a.balance - b.balance; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [trucks, truckSummaries, truckSearch, sortField, sortDir]);

  // ── Drill-down entries for selected truck ──────────────────────────

  const detailEntries = useMemo(() => {
    if (!selectedTruck) return [];
    let entries = allEntries
      .filter(e => e.truck === selectedTruck.id)
      .filter(e => matchesDateRange(e.date, dateRange.from, dateRange.to));

    if (detailTypeFilter !== 'all') entries = entries.filter(e => e.entry_type === detailTypeFilter);

    if (detailSearch.trim()) {
      const q = detailSearch.toLowerCase();
      entries = entries.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q) ||
        (e.entered_by || '').toLowerCase().includes(q)
      );
    }

    return entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selectedTruck, allEntries, dateRange, detailTypeFilter, detailSearch]);

  // Running balance: oldest first, accumulating top-down (classic ledger)
  const detailWithBalance = useMemo(() => {
    const sorted = [...detailEntries].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || a.id - b.id
    );
    let running = 0;
    return sorted.map(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'income') running += a;
      else running -= a;
      return { ...e, runningBalance: running };
    });
  }, [detailEntries]);

  const detailTotals = useMemo(() => {
    let debits = 0; let credits = 0;
    detailEntries.forEach(e => {
      const a = toNum(e.amount);
      if (e.entry_type === 'expense') debits += a;
      else credits += a;
    });
    return { debits, credits, balance: credits - debits };
  }, [detailEntries]);

  // ═══════════════════════════════════════════════════════════════════
  // Summary cards
  // ═══════════════════════════════════════════════════════════════════

  const summaryCards = useMemo((): SummaryCard[] => {
    // Active trucks = trucks that have at least 1 ledger entry in the selected period
    const activeTruckIds = new Set(filteredEntries.map(e => e.truck));
    const activeTruckCount = trucks.filter(t => activeTruckIds.has(t.id)).length;
    // Avg cost per truck = total debits ÷ fleet size (fleet cost-efficiency KPI)
    const avgCostPerTruck = totals.truckCount > 0 ? totals.debits / totals.truckCount : 0;

    return [
      { title: 'total trucks', value: String(totals.truckCount), icon: <Truck size={20} />, tone: 'neutral' },
      { title: 'active this period', value: String(activeTruckCount), icon: <TrendingUp size={20} />, tone: activeTruckCount > 0 ? 'green' : 'amber' },
      { title: 'average cost per truck', value: fmtShort(avgCostPerTruck), icon: <Wallet size={20} />, tone: avgCostPerTruck > 0 ? 'red' : 'neutral' },
    ];
  }, [totals, filteredEntries, trucks]);

  // ═══════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['fleet-trucks'] });
    qc.invalidateQueries({ queryKey: ['fleet-ledger'] });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'plate' ? 'asc' : 'desc'); }
  };

  const handlePresetChange = (preset: TimePreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); }
  };

  const openAddTruck = () => {
    setTruckEditing(null);
    setTruckForm({
      plate_number: '', chassis_number: '', truck_make: '',
      driver_name: '', driver_phone: '', driver_alt_phone: '',
      motor_boy_name: '', motor_boy_phone1: '', motor_boy_phone2: '',
      spare_driver_name: '', spare_driver_phone: '',
      passport_photo: '',
      truck_status_rating: 'Good',
      truck_status_reason: '',
      max_capacity: '', notes: '',
      insurance_expiry: '', road_worthiness_expiry: '',
      last_service_date: '', next_service_date: '', mileage: '',
      fuel_capacity: '', avg_litres_per_trip: '',
      insurance_cert_doc: '', vehicle_papers_doc: '', drivers_license_doc: '',
      incidents: [], new_incident_date: '', new_incident_desc: '',
    });
    setTruckDialogOpen(true);
  };

  const openEditTruck = (t: FleetTruck) => {
    setTruckEditing(t);
    const parsed = parseStatus(t.truck_status);
    setTruckForm({
      plate_number: t.plate_number,
      chassis_number: t.chassis_number || '',
      truck_make: t.truck_make || '',
      driver_name: t.driver_name,
      driver_phone: t.driver_phone || '',
      driver_alt_phone: t.driver_alt_phone || '',
      motor_boy_name: t.motor_boy_name || '',
      motor_boy_phone1: t.motor_boy_phone1 || '',
      motor_boy_phone2: t.motor_boy_phone2 || '',
      spare_driver_name: t.spare_driver_name || '',
      spare_driver_phone: t.spare_driver_phone || '',
      passport_photo: t.passport_photo || '',
      truck_status_rating: parsed.rating,
      truck_status_reason: parsed.reason,
      max_capacity: t.max_capacity ? t.max_capacity.toLocaleString() : '',
      notes: t.notes || '',
      insurance_expiry: t.insurance_expiry || '',
      road_worthiness_expiry: t.road_worthiness_expiry || '',
      last_service_date: t.last_service_date || '',
      next_service_date: t.next_service_date || '',
      mileage: t.mileage ? t.mileage.toLocaleString() : '',
      fuel_capacity: t.fuel_capacity ? String(t.fuel_capacity) : '',
      avg_litres_per_trip: t.avg_litres_per_trip ? String(t.avg_litres_per_trip) : '',
      insurance_cert_doc: t.insurance_cert_doc || '',
      vehicle_papers_doc: t.vehicle_papers_doc || '',
      drivers_license_doc: t.drivers_license_doc || '',
      incidents: parseIncidents(t.incidents),
      new_incident_date: '', new_incident_desc: '',
    });
    setTruckDialogOpen(true);
  };

  const handleSaveTruck = useCallback(async () => {
    if (!truckForm.plate_number.trim()) {
      toast({ title: 'Plate number is required', variant: 'destructive' }); return;
    }
    if (!truckForm.driver_name.trim()) {
      toast({ title: 'Driver name is required', variant: 'destructive' }); return;
    }
    setTruckSaving(true);
    try {
      const capacityRaw = Number(stripCommas(truckForm.max_capacity));
      const mileageRaw = Number(stripCommas(truckForm.mileage));
      const fuelCapRaw = Number(truckForm.fuel_capacity);
      const avgLitresRaw = Number(truckForm.avg_litres_per_trip);
      const payload = {
        plate_number: truckForm.plate_number.trim().toUpperCase(),
        chassis_number: truckForm.chassis_number.trim() || '',
        truck_make: truckForm.truck_make.trim() || '',
        driver_name: truckForm.driver_name.trim(),
        driver_phone: truckForm.driver_phone.trim() || '',
        driver_alt_phone: truckForm.driver_alt_phone.trim() || '',
        motor_boy_name: truckForm.motor_boy_name.trim() || '',
        motor_boy_phone1: truckForm.motor_boy_phone1.trim() || '',
        motor_boy_phone2: truckForm.motor_boy_phone2.trim() || '',
        spare_driver_name: truckForm.spare_driver_name.trim() || '',
        spare_driver_phone: truckForm.spare_driver_phone.trim() || '',
        passport_photo: truckForm.passport_photo.trim() || '',
        truck_status: encodeStatus(truckForm.truck_status_rating, truckForm.truck_status_reason),
        max_capacity: capacityRaw > 0 ? capacityRaw : null,
        notes: truckForm.notes.trim() || '',
        // New fields — dates must be null (not '') for Django DateField
        insurance_expiry: truckForm.insurance_expiry || null,
        road_worthiness_expiry: truckForm.road_worthiness_expiry || null,
        last_service_date: truckForm.last_service_date || null,
        next_service_date: truckForm.next_service_date || null,
        mileage: mileageRaw > 0 ? mileageRaw : null,
        fuel_capacity: fuelCapRaw > 0 ? fuelCapRaw : null,
        avg_litres_per_trip: avgLitresRaw > 0 ? avgLitresRaw : null,
        insurance_cert_doc: truckForm.insurance_cert_doc || '',
        vehicle_papers_doc: truckForm.vehicle_papers_doc || '',
        drivers_license_doc: truckForm.drivers_license_doc || '',
        incidents: truckForm.incidents.length > 0 ? JSON.stringify(truckForm.incidents) : '',
      };
      if (truckEditing) {
        await apiClient.admin.updateFleetTruck(truckEditing.id, payload);
        toast({ title: 'Truck updated' });
      } else {
        await apiClient.admin.createFleetTruck(payload);
        toast({ title: 'Truck added' });
      }
      setTruckDialogOpen(false);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save truck', variant: 'destructive' });
    } finally { setTruckSaving(false); }
  }, [truckForm, truckEditing, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.admin.deleteFleetTruck(deleteTarget.id);
      toast({ title: 'Truck deleted' });
      setDeleteTarget(null);
      invalidateAll();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Delete failed', variant: 'destructive' });
    } finally { setDeleting(false); }
  }, [deleteTarget, toast]);

  // ── Export: Summary ────────────────────────────────────────────────
  const exportSummary = useCallback(() => {
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();
    const rows = displayTrucks.map(t => ({
      'Plate Number': t.plate_number,
      'Chassis No': t.chassis_number || '',
      'Truck Make': t.truck_make || '',
      'Driver': t.driver_name,
      'Phone': t.driver_phone || '',
      'Alt Phone': t.driver_alt_phone || '',
      'Motor Boy': t.motor_boy_name || '',
      'Motor Boy Ph1': t.motor_boy_phone1 || '',
      'Motor Boy Ph2': t.motor_boy_phone2 || '',
      'Spare Driver': t.spare_driver_name || '',
      'Spare Driver Ph': t.spare_driver_phone || '',
      'Truck Status': t.truck_status || '',
      'Max Capacity (L)': t.max_capacity || '',
      'Insurance Expiry': t.insurance_expiry || '',
      'Road Worthiness Expiry': t.road_worthiness_expiry || '',
      'Last Service': t.last_service_date || '',
      'Next Service': t.next_service_date || '',
      'Mileage (km)': t.mileage || '',
      'Avg L/Trip': t.avg_litres_per_trip || '',
      'Fuel Capacity (L)': t.fuel_capacity || '',
      'Debits (₦)': t.debits,
      'Credits (₦)': t.credits,
      'Balance (₦)': t.balance,
    }));
    rows.push({
      'Plate Number': 'TOTAL',
      'Chassis No': '',
      'Truck Make': '',
      'Driver': '',
      'Phone': '',
      'Alt Phone': '',
      'Motor Boy': '',
      'Motor Boy Ph1': '',
      'Motor Boy Ph2': '',
      'Spare Driver': '',
      'Spare Driver Ph': '',
      'Truck Status': '',
      'Max Capacity (L)': '' as any,
      'Insurance Expiry': '',
      'Road Worthiness Expiry': '',
      'Last Service': '',
      'Next Service': '',
      'Mileage (km)': '' as any,
      'Avg L/Trip': '' as any,
      'Fuel Capacity (L)': '' as any,
      'Debits (₦)': totals.debits,
      'Credits (₦)': totals.credits,
      'Balance (₦)': totals.balance,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Summary');
    XLSX.writeFile(wb, `FLEET-SUMMARY-${period}.xlsx`);
  }, [displayTrucks, totals, timePreset, customFrom, customTo]);

  // ── Export: Single truck detail ────────────────────────────────────
  const exportTruckDetail = useCallback(() => {
    if (!selectedTruck) return;
    const period = timePreset === 'custom'
      ? `${customFrom || '?'}_TO_${customTo || '?'}`
      : timePreset.toUpperCase();
    let running = 0;
    // Oldest first (classic ledger order) — use id as tiebreaker for same-date entries
    const sorted = [...detailEntries].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || a.id - b.id
    );
    const rows = sorted.map(e => {
      const a = toNum(e.amount);
      const debit = e.entry_type === 'expense' ? a : 0;
      const credit = e.entry_type === 'income' ? a : 0;
      running += credit - debit;
      return {
        'Date': e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '',
        'Description': e.description || e.category,
        'Category': e.category,
        'Debit (₦)': debit || '',
        'Credit (₦)': credit || '',
        'Balance (₦)': running,
        'Entered By': e.entered_by || '',
      };
    });
    rows.push({
      'Date': '',
      'Description': 'TOTAL',
      'Category': '',
      'Debit (₦)': detailTotals.debits as any,
      'Credit (₦)': detailTotals.credits as any,
      'Balance (₦)': detailTotals.balance,
      'Entered By': '',
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedTruck.plate_number);
    XLSX.writeFile(wb, `TRUCK-LEDGER-${selectedTruck.plate_number}-${period}.xlsx`);
  }, [selectedTruck, detailEntries, detailTotals, timePreset, customFrom, customTo]);

  // ═══════════════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════════════

  const isLoading = trucksQuery.isLoading || ledgerQuery.isLoading;

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      size={13}
      className={`inline ml-1 ${sortField === field ? 'text-slate-900' : 'text-slate-400'}`}
    />
  );

  const periodLabel = timePreset === 'custom'
    ? `${customFrom ? format(parseISO(customFrom), 'dd MMM') : '?'} – ${customTo ? format(parseISO(customTo), 'dd MMM yyyy') : '?'}`
    : timePreset === 'all'
      ? 'All Time'
      : timePreset.charAt(0).toUpperCase() + timePreset.slice(1);

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            {/* Header */}
            <PageHeader
              title="Fleet"
              description="At-a-glance truck performance — debits, credits, and balance per truck for any period."
              actions={
                <div className="flex gap-2">
                  <Button className="gap-2" onClick={openAddTruck}>
                    <Plus size={16} /> Add Truck
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={exportSummary}>
                    <Download size={16} /> Download Report
                  </Button>
                </div>
              }
            />

            {/* ── Time Filter ──────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-slate-600 mr-1">
                  <CalendarIcon size={14} className="inline mr-1" />Period:
                </span>
                {(['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'] as TimePreset[]).map(tp => (
                  <button
                    key={tp}
                    onClick={() => handlePresetChange(tp)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      timePreset === tp
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {tp === 'all' ? 'All Time' : tp === 'custom' ? 'Date Range' : tp.charAt(0).toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </div>
              {timePreset === 'custom' && (
                <div className="flex flex-wrap gap-3 mt-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">To</Label>
                    <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-[160px]" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Summary Cards ─────────────────────────────────────── */}
            <SummaryCards cards={summaryCards} />

            {/* ── Search bar ───────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input placeholder="Search by truck, driver, chassis, motor boy, status…" className="pl-10" value={truckSearch} onChange={e => setTruckSearch(e.target.value)} />
              </div>
              {/* <Button variant="outline" className="gap-2" onClick={exportSummary}><Download size={16} /> Export</Button>
              <Button className="gap-2 sm:hidden" onClick={openAddTruck}><Plus size={16} /> Add Truck</Button> */}
            </div>

            {/* ── Trucks Table ──────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded" />)}</div>
              ) : displayTrucks.length === 0 ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500 font-medium">No trucks found</p>
                  <p className="text-sm text-slate-400 mt-1">{trucks.length > 0 ? 'Adjust your search.' : 'Click "Add Truck" to register one.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700 w-[50px]">S/N</TableHead>
                        <TableHead className="font-semibold text-slate-700">Truck No.</TableHead>
                        <TableHead className="font-semibold text-slate-700 hidden md:table-cell">Capacity</TableHead>
                        <TableHead className="font-semibold text-slate-700 hidden md:table-cell">Driver</TableHead>
                        <TableHead className="font-semibold text-slate-700 hidden md:table-cell">Driver's Contact</TableHead>
                        <TableHead className="font-semibold text-red-700 text-left cursor-pointer select-none" onClick={() => toggleSort('debits')}>
                          Debits <SortIcon field="debits" />
                        </TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-left cursor-pointer select-none" onClick={() => toggleSort('credits')}>
                          Credits <SortIcon field="credits" />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-left cursor-pointer select-none" onClick={() => toggleSort('balance')}>
                          Balance <SortIcon field="balance" />
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700 text-center w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayTrucks.map((t, idx) => {
                        const balColor = t.balance > 0 ? 'text-emerald-700' : t.balance < 0 ? 'text-red-700' : 'text-slate-500';
                        return (
                          <TableRow
                            key={t.id}
                            className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                            onClick={() => { setSelectedTruck(t); setDetailSearch(''); setDetailTypeFilter('all'); setShowPersonnel(true); }}
                          >
                            <TableCell className="text-sm text-center text-slate-500 font-medium">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-bold text-slate-900">{t.plate_number}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-semibold text-slate-700 hidden md:table-cell">
                              {t.max_capacity ? `${t.max_capacity.toLocaleString()} Litres` : '—'}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-2.5">
                                {t.passport_photo ? (
                                  <img
                                    src={t.passport_photo}
                                    alt=""
                                    className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <User size={14} className="text-slate-400" />
                                  </div>
                                )}
                                <p className="text-sm font-bold uppercase text-slate-900">{t.driver_name}</p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell" onClick={e => e.stopPropagation()}>
                              <div className="space-y-0.5">
                                {t.driver_phone ? (
                                  <a href={`tel:${t.driver_phone}`} className="text-sm text-blue-700 underline hover:text-blue-800 block">{t.driver_phone}</a>
                                ) : (
                                  <span className="text-sm text-slate-400">—</span>
                                )}
                                {t.driver_alt_phone && (
                                  <a href={`tel:${t.driver_alt_phone}`} className="text-sm text-blue-700 underline hover:text-blue-800 block">{t.driver_alt_phone}</a>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-red-600">
                              {t.debits > 0 ? fmt(t.debits) : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-left font-semibold text-emerald-600">
                              {t.credits > 0 ? fmt(t.credits) : '—'}
                            </TableCell>
                            <TableCell className={`text-sm text-left font-bold ${balColor}`}>
                              {t.debits === 0 && t.credits === 0 ? '—' : fmt(t.balance)}
                            </TableCell>
                            <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="outline"
                                  className="gap-1.5 px-3 py-1 text-sm font-medium text-green-600 border-green-300 bg-green-50/40 hover:bg-green-100 hover:text-green-800 hover:border-green-400 transition-all shadow-sm"
                                  onClick={() => { setSelectedTruck(t); setDetailSearch(''); setDetailTypeFilter('all'); setShowPersonnel(true); }}>
                                  <Eye size={16} />
                                  View Details
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      {/* <TableRow className="bg-slate-50 border-t-2 border-slate-300">
                        <TableCell className="font-bold text-slate-800 text-sm">TOTAL ({displayTrucks.length} trucks)</TableCell>
                        <TableCell className="hidden md:table-cell" />
                        <TableCell className="text-right font-bold text-red-700 text-sm">{fmt(totals.debits)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-sm">{fmt(totals.credits)}</TableCell>
                        <TableCell className={`text-right font-bold text-sm ${totals.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                          {fmt(totals.balance)}
                        </TableCell>
                        <TableCell />
                      </TableRow> */}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* {!isLoading && displayTrucks.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {displayTrucks.length} of {trucks.length} truck{trucks.length !== 1 ? 's' : ''} · Period: {periodLabel}
              </p>
            )} */}

          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Drill-Down: Truck Ledger Sheet                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedTruck} onOpenChange={open => { if (!open) { setSelectedTruck(null); setShowPersonnel(false); } }}>
        <DialogContent className="sm:max-w-[900px] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><Truck className="w-5 h-5 text-green-700" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg text-green-700 font-bold">{selectedTruck?.plate_number}</h2>
                <p className="text-sm font-normal text-black mt-0.5">
                  {selectedTruck?.max_capacity ? `${selectedTruck.max_capacity.toLocaleString()} Litres` : '—'}
                  {selectedTruck?.truck_make && <> · <span className="font-semibold">{selectedTruck.truck_make}</span></>}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Truck ledger detail</DialogDescription>
          </DialogHeader>

          {/* ── Toggle: Personnel vs Ledger ────────────────── */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
            <button
              onClick={() => setShowPersonnel(true)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                showPersonnel ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users size={13} className="inline mr-1.5" />Truck Personnel & Info
            </button>
            <button
              onClick={() => setShowPersonnel(false)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                !showPersonnel ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Wallet size={13} className="inline mr-1.5" />Expenses & Ledger
            </button>
          </div>

          {/* ═══════════════════════════════════════════════════ */}
          {/* Personnel / Info View                              */}
          {/* ═══════════════════════════════════════════════════ */}
          {showPersonnel && selectedTruck && (() => {
            const tripStats = truckTripStats.get(selectedTruck.id) || { totalTrips: 0, totalRevenue: 0, lastTripDate: null, trips: [] };
            const truckAge = selectedTruck.created_at
              ? (() => {
                  const days = Math.floor((Date.now() - new Date(selectedTruck.created_at).getTime()) / 86400000);
                  if (days < 30) return `${days}d`;
                  if (days < 365) return `${Math.floor(days / 30)}mo`;
                  const yrs = Math.floor(days / 365);
                  const rem = Math.floor((days % 365) / 30);
                  return rem ? `${yrs}y ${rem}mo` : `${yrs}y`;
                })()
              : null;
            return (
            <div className="flex-1 overflow-auto py-3 px-1">
              <div className="space-y-4">

                {/* ── TRUCK DETAILS (first) ── */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Truck size={13} className="text-slate-500" />
                    Truck Details
                    {(() => {
                      const p = parseStatus(selectedTruck.truck_status);
                      const c = statusColors[p.rating];
                      return (
                        <Badge variant="outline" className={`ml-auto text-[11px] font-medium ${c.badge}`}>
                          {p.rating}
                          {p.reason && <span className="ml-1 font-normal">— {p.reason}</span>}
                        </Badge>
                      );
                    })()}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Plate Number</span>
                      <p className="text-sm font-bold text-slate-900">{selectedTruck.plate_number}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Chassis No</span>
                      <p className="text-sm font-bold text-slate-800">{selectedTruck.chassis_number || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Truck Make</span>
                      <p className="text-sm font-bold text-slate-800">{selectedTruck.truck_make || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">Capacity</span>
                      <p className="text-sm font-bold text-slate-800">{selectedTruck.max_capacity ? `${selectedTruck.max_capacity.toLocaleString()} Litres` : '—'}</p>
                    </div>
                  </div>
                  {/* Quick stats row */}
                  <div className="flex flex-wrap gap-8 mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <RouteIcon size={12} /> <span className="font-bold text-slate-800">{tripStats.totalTrips}</span> trip(s)
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <TrendingUp size={12} /> Total Revenue: <span className="font-bold text-emerald-700">{fmt(tripStats.totalRevenue)}</span>
                    </div>
                    {tripStats.lastTripDate && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Clock size={12} /> Last trip: <span className="font-bold text-slate-700">{format(parseISO(tripStats.lastTripDate), 'dd MMM yyyy')}</span>
                      </div>
                    )}
                    {/* {truckAge && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <CalendarIcon size={12} /> In fleet: <span className="font-bold text-slate-700">{truckAge}</span>
                      </div>
                    )} */}
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Wrench size={12} /> Last service: <span className="font-bold text-slate-700">{selectedTruck.last_service_date ? format(parseISO(selectedTruck.last_service_date), 'dd MMM yyyy') : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* ── MAIN DRIVER + TRUCK STATUS — side by side ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Main Driver */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      Main Driver
                    </h4>
                    <div className="flex gap-4">
                      {/* Passport photo */}
                      <div className="shrink-0">
                        {selectedTruck.passport_photo ? (
                          <img
                            src={selectedTruck.passport_photo}
                            alt="Driver passport"
                            className="h-[80px] w-[80px] rounded-xl object-cover border-2 border-white shadow-md"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="h-[80px] w-[80px] rounded-xl bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm">
                            <Camera size={22} className="text-slate-400" />
                          </div>
                        )}
                      </div>
                      {/* Driver details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 uppercase leading-tight">{selectedTruck.driver_name || '—'}</p>
                        {/* Trip count + Star rating row */}
                        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-green-800 text-sm font-bold">
                            <RouteIcon size={10} /> {tripStats.totalTrips} trip{tripStats.totalTrips !== 1 ? 's' : ''}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
                            {[1, 2, 3, 4, 5].map(i => (
                              <Star key={i} size={14} className="text-slate-200 fill-slate-200" />
                            ))}
                            <span className="ml-1 text-slate-400 font-medium">N/A</span>
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          <div>
                            <span className="text-[11px] font-medium text-slate-500">Phone Number</span>
                            <p className="text-sm font-semibold text-slate-800">
                              {selectedTruck.driver_phone
                                ? <a href={`tel:${selectedTruck.driver_phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">{selectedTruck.driver_phone}</a>
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-medium text-slate-500">Alt Phone Number</span>
                            <p className="text-sm font-semibold text-slate-800">
                              {selectedTruck.driver_alt_phone
                                ? <a href={`tel:${selectedTruck.driver_alt_phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">{selectedTruck.driver_alt_phone}</a>
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Truck Status (inline update) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Update Truck Status</h4>
                    {(() => {
                      const currentParsed = parseStatus(selectedTruck.truck_status);
                      return (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            {TRUCK_STATUS_OPTIONS.map(opt => {
                              const c = statusColors[opt];
                              const isActive = currentParsed.rating === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={statusSaving}
                                  onClick={async () => {
                                    if (isActive) return;
                                    const newStatus = encodeStatus(opt, '');
                                    setStatusSaving(true);
                                    try {
                                      await apiClient.admin.updateFleetTruck(selectedTruck.id, { truck_status: newStatus });
                                      setSelectedTruck(prev => prev ? { ...prev, truck_status: newStatus } : prev);
                                      invalidateAll();
                                      toast({ title: `Status updated to ${opt}` });
                                    } catch {
                                      toast({ title: 'Failed to update status', variant: 'destructive' });
                                    } finally { setStatusSaving(false); }
                                  }}
                                  className={`px-3 py-2 text-sm font-normal rounded-lg border-2 transition-all ${
                                    isActive
                                      ? `${c.badge} border-current shadow-sm`
                                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-500'
                                  } ${statusSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {statusSaving ? '…' : opt}
                                </button>
                              );
                            })}
                          </div>
                          {(currentParsed.rating === 'Fair' || currentParsed.rating === 'Bad') && (
                            <Input
                              placeholder="Reason (e.g. no tyres, leaking tank)…"
                              className="h-9 text-sm"
                              defaultValue={currentParsed.reason}
                              disabled={statusSaving}
                              onBlur={async (e) => {
                                const newReason = e.target.value.trim();
                                if (newReason === currentParsed.reason) return;
                                const newStatus = encodeStatus(currentParsed.rating, newReason);
                                setStatusSaving(true);
                                try {
                                  await apiClient.admin.updateFleetTruck(selectedTruck.id, { truck_status: newStatus });
                                  setSelectedTruck(prev => prev ? { ...prev, truck_status: newStatus } : prev);
                                  invalidateAll();
                                } catch {
                                  toast({ title: 'Failed to update reason', variant: 'destructive' });
                                } finally { setStatusSaving(false); }
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* ── MOTOR BOY + SPARE DRIVER — side by side ── */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Motor Boy */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                      Motor Boy
                    </h4>
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Name</span>
                        <p className="text-sm font-bold text-slate-900 uppercase">{selectedTruck.motor_boy_name || '—'}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Phone Number</span>
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedTruck.motor_boy_phone1
                            ? <a href={`tel:${selectedTruck.motor_boy_phone1}`} className="text-blue-600 hover:text-blue-800 hover:underline">{selectedTruck.motor_boy_phone1}</a>
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Alt Phone</span>
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedTruck.motor_boy_phone2
                            ? <a href={`tel:${selectedTruck.motor_boy_phone2}`} className="text-blue-600 hover:text-blue-800 hover:underline">{selectedTruck.motor_boy_phone2}</a>
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Spare Driver */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                      Spare Driver
                    </h4>
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Name</span>
                        <p className="text-sm font-bold text-slate-900 uppercase">{selectedTruck.spare_driver_name || '—'}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Phone</span>
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedTruck.spare_driver_phone
                            ? <a href={`tel:${selectedTruck.spare_driver_phone}`} className="text-blue-600 hover:text-blue-800 hover:underline">{selectedTruck.spare_driver_phone}</a>
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── INSURANCE & ROAD WORTHINESS ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 border ${
                    isExpired(selectedTruck.insurance_expiry)
                      ? 'bg-red-50 border-red-300'
                      : isExpiringSoon(selectedTruck.insurance_expiry)
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-white border-slate-200'
                  }`}>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <Shield size={13} className="text-slate-500" />
                      Insurance
                    </h4>
                    <div className="space-y-1">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Expiry Date</span>
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedTruck.insurance_expiry ? format(parseISO(selectedTruck.insurance_expiry), 'dd MMM yyyy') : '—'}
                        </p>
                      </div>
                      {isExpired(selectedTruck.insurance_expiry) && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 rounded-md px-2 py-1">
                          <CircleAlert size={12} /> EXPIRED
                        </div>
                      )}
                      {!isExpired(selectedTruck.insurance_expiry) && isExpiringSoon(selectedTruck.insurance_expiry) && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-md px-2 py-1">
                          <AlertTriangle size={12} /> Expiring soon
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`rounded-xl p-4 border ${
                    isExpired(selectedTruck.road_worthiness_expiry)
                      ? 'bg-red-50 border-red-300'
                      : isExpiringSoon(selectedTruck.road_worthiness_expiry)
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-white border-slate-200'
                  }`}>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <Shield size={13} className="text-slate-500" />
                      Road Worthiness
                    </h4>
                    <div className="space-y-1">
                      <div>
                        <span className="text-[11px] font-medium text-slate-500">Expiry Date</span>
                        <p className="text-sm font-semibold text-slate-800">
                          {selectedTruck.road_worthiness_expiry ? format(parseISO(selectedTruck.road_worthiness_expiry), 'dd MMM yyyy') : '—'}
                        </p>
                      </div>
                      {isExpired(selectedTruck.road_worthiness_expiry) && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 rounded-md px-2 py-1">
                          <CircleAlert size={12} /> EXPIRED
                        </div>
                      )}
                      {!isExpired(selectedTruck.road_worthiness_expiry) && isExpiringSoon(selectedTruck.road_worthiness_expiry) && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-md px-2 py-1">
                          <AlertTriangle size={12} /> Expiring soon
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── DOCUMENTS ── */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FileText size={13} className="text-slate-500" />
                    Documents
                  </h4>
                  {(() => {
                    const docs = [
                      { label: 'Insurance Certificate', data: selectedTruck.insurance_cert_doc },
                      { label: 'Vehicle Papers', data: selectedTruck.vehicle_papers_doc },
                      { label: "Driver's License", data: selectedTruck.drivers_license_doc },
                    ];
                    const hasDocs = docs.some(d => d.data);
                    if (!hasDocs) return <p className="text-sm text-slate-400 py-2 text-center">No documents uploaded</p>;
                    return (
                      <div className="grid grid-cols-3 gap-3">
                        {docs.map(doc => (
                          <div key={doc.label} className="text-center">
                            {doc.data ? (
                              <>
                                <div
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-[3/4] flex items-center justify-center"
                                  onClick={() => {
                                    // Open in new tab for full view
                                    const w = window.open();
                                    if (w) {
                                      w.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f1f5f9"><img src="${doc.data}" style="max-width:90vw;max-height:90vh;object-fit:contain" /></body></html>`);
                                      w.document.title = doc.label;
                                    }
                                  }}
                                >
                                  <img
                                    src={doc.data}
                                    alt={doc.label}
                                    className="w-full h-full object-cover"
                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                    <Eye size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                                <p className="text-[10px] font-medium text-slate-500 mt-1.5">{doc.label}</p>
                              </>
                            ) : (
                              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 aspect-[3/4] flex flex-col items-center justify-center">
                                <FileText size={18} className="text-slate-300 mb-1" />
                                <p className="text-[10px] text-slate-400">{doc.label}</p>
                                <p className="text-[9px] text-slate-300">Not uploaded</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ── INCIDENT / ACCIDENT HISTORY ── */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CircleAlert size={13} className="text-slate-500" />
                    Recorded Incidents
                    <span className="ml-auto text-[11px] font-semibold text-slate-400 normal-case tracking-normal">
                      {parseIncidents(selectedTruck.incidents).length} recorded
                    </span>
                  </h4>
                  {(() => {
                    const incidents = parseIncidents(selectedTruck.incidents);
                    if (incidents.length === 0) return <p className="text-sm text-slate-400 py-2 text-center">No incidents recorded</p>;
                    return (
                      <div className="space-y-0 max-h-[180px] overflow-auto">
                        {incidents
                          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                          .map((inc, idx) => (
                          <div key={idx} className={`flex items-start gap-3 py-2 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertTriangle size={13} className="text-red-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">{inc.description}</p>
                              <p className="text-[11px] text-slate-400">
                                {inc.date ? format(parseISO(inc.date), 'dd MMM yyyy') : '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ── NOTES ── */}
                {selectedTruck.notes && (
                  <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Notes</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedTruck.notes}</p>
                  </div>
                )}

                {/* ── TRIP HISTORY ── */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <MapPin size={13} className="text-slate-500" />
                    Trip History
                    <span className="ml-auto text-[11px] font-semibold text-slate-400 normal-case tracking-normal">
                      {tripStats.totalTrips} total
                    </span>
                  </h4>
                  {tripStats.trips.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3 text-center">No trips recorded yet</p>
                  ) : (
                    <div className="space-y-0 max-h-[200px] overflow-auto">
                      {tripStats.trips.slice(0, 20).map((trip, idx) => (
                        <div
                          key={trip.id}
                          className={`flex items-center gap-3 py-2 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                            <Truck size={14} className="text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{trip.description || trip.category || 'Trip'}</p>
                            <p className="text-[11px] text-slate-400">
                              {trip.date ? format(parseISO(trip.date), 'dd MMM yyyy') : '—'}
                              {trip.entered_by ? ` · ${trip.entered_by}` : ''}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-emerald-700 shrink-0">{fmt(toNum(trip.amount))}</p>
                        </div>
                      ))}
                      {tripStats.trips.length > 20 && (
                        <p className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
                          +{tripStats.trips.length - 20} more — switch to Expenses & Ledger to see all
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── EDIT BUTTON ── */}
                <div className="border-t-2 border-slate-200 pt-4">
                  <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={() => { openEditTruck(selectedTruck); }}>
                    <Pencil size={14} /> Edit Truck Details
                  </Button>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════ */}
          {/* Ledger / Expenses View                             */}
          {/* ═══════════════════════════════════════════════════ */}
          {!showPersonnel && (
            <>
              {/* Detail summary strip */}
              <div className="grid grid-cols-3 gap-3 my-2 shrink-0">
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-red-500">Debits</p>
                  <p className="text-lg font-bold text-red-700 mt-0.5">{fmt(detailTotals.debits)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500">Credits</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">{fmt(detailTotals.credits)}</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${detailTotals.balance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${detailTotals.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Balance</p>
                  <p className={`text-lg font-bold mt-0.5 ${detailTotals.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(detailTotals.balance)}</p>
                </div>
              </div>

              {/* Detail toolbar */}
              <div className="flex flex-col sm:flex-row gap-2 my-1 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input placeholder="Search entries…" className="pl-9 h-9 text-sm" value={detailSearch} onChange={e => setDetailSearch(e.target.value)} />
                </div>
                <select title="Filter by entry type" value={detailTypeFilter} onChange={e => setDetailTypeFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm w-full sm:w-[140px]">
                  <option value="all">All Types</option>
                  <option value="expense">Debits only</option>
                  <option value="income">Credits only</option>
                </select>
                <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={exportTruckDetail}>
                  <Download size={14} /> Export
                </Button>
              </div>

              {/* Detail table */}
              <div className="flex-1 overflow-auto border rounded-lg">
                {detailWithBalance.length === 0 ? (
                  <div className="p-10 text-center">
                    <FileText className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="text-slate-500 text-sm font-medium">No entries for this truck in the selected period</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 sticky top-0">
                        <TableHead className="font-semibold text-slate-700 text-xs">Date</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-xs">Description</TableHead>
                        <TableHead className="font-semibold text-red-700 text-xs text-right">Debit</TableHead>
                        <TableHead className="font-semibold text-emerald-700 text-xs text-right">Credit</TableHead>
                        <TableHead className="font-semibold text-slate-700 text-xs text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailWithBalance.map(e => {
                        const isExp = e.entry_type === 'expense';
                        const a = toNum(e.amount);
                        return (
                          <TableRow key={e.id} className="hover:bg-slate-50/60">
                            <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                              {e.date ? format(parseISO(e.date), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-slate-800">{e.description || e.category}</p>
                              {e.description && e.category && (
                                <p className="text-[11px] text-slate-400 mt-0.5">{e.category}{e.entered_by ? ` · ${e.entered_by}` : ''}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium text-red-600">
                              {isExp ? fmt(a) : ''}
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium text-emerald-600">
                              {!isExp ? fmt(a) : ''}
                            </TableCell>
                            <TableCell className={`text-sm text-right font-semibold ${e.runningBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {fmt(e.runningBalance)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Totals row */}
                      <TableRow className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0">
                        <TableCell className="font-bold text-slate-700 text-xs">Total</TableCell>
                        <TableCell className="text-xs text-slate-500">{detailWithBalance.length} entries</TableCell>
                        <TableCell className="text-right font-bold text-red-700 text-sm">{fmt(detailTotals.debits)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700 text-sm">{fmt(detailTotals.credits)}</TableCell>
                        <TableCell className={`text-right font-bold text-sm ${detailTotals.balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                          {fmt(detailTotals.balance)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* Truck Add/Edit Dialog                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={truckDialogOpen} onOpenChange={setTruckDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><Truck className="w-5 h-5 text-blue-600" /></div>
              <div>
                <h2 className="text-lg font-semibold">{truckEditing ? 'Edit Truck' : 'Add Truck'}</h2>
                <p className="text-sm font-normal text-slate-500 mt-0">
                  {truckEditing ? 'Update truck and driver details' : 'Register a new truck'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">{truckEditing ? 'Edit truck' : 'Add truck'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">

            {/* ── Section: Truck Details ─────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Truck size={13} /> Truck Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Hash size={14} className="text-slate-500" /> Truck Number <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="e.g. ABC-123-XY" value={truckForm.plate_number}
                    onChange={e => setTruckForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Hash size={14} className="text-slate-500" /> Chassis No
                  </Label>
                  <Input placeholder="e.g. XYZ123456789" value={truckForm.chassis_number}
                    onChange={e => setTruckForm(f => ({ ...f, chassis_number: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Truck size={14} className="text-slate-500" /> Truck Make
                  </Label>
                  <Input placeholder="e.g. MAN, Mack, DAF" value={truckForm.truck_make}
                    onChange={e => setTruckForm(f => ({ ...f, truck_make: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Fuel size={14} className="text-slate-500" /> Max Capacity (Litres)
                  </Label>
                  <Input type="text" inputMode="numeric" placeholder="e.g. 45,000" value={truckForm.max_capacity}
                    onChange={e => setTruckForm(f => ({ ...f, max_capacity: formatWithCommas(e.target.value) }))} />
                </div>
              </div>
            </div>

            {/* ── Section: Driver Details ────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <User size={13} /> Driver Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <User size={14} className="text-slate-500" /> Driver's Name <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="e.g. Musa Abdullahi" value={truckForm.driver_name}
                    onChange={e => setTruckForm(f => ({ ...f, driver_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> Driver's Phone
                  </Label>
                  <Input placeholder="e.g. 08012345678" value={truckForm.driver_phone}
                    onChange={e => setTruckForm(f => ({ ...f, driver_phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> Driver's Alt Phone
                  </Label>
                  <Input placeholder="e.g. 08012345678" value={truckForm.driver_alt_phone}
                    onChange={e => setTruckForm(f => ({ ...f, driver_alt_phone: e.target.value }))} />
                </div>
              </div>
              <div className="mt-2.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center mb-1.5 gap-1.5">
                    <Camera size={14} className="text-slate-500" /> Passport Photograph
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="cursor-pointer"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        toast({ title: 'File too large', description: 'Please select an image under 2MB', variant: 'destructive' });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setTruckForm(f => ({ ...f, passport_photo: reader.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <p className="text-xs text-slate-400">Upload driver's passport photograph</p>
                </div>
                {truckForm.passport_photo && (
                  <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <img
                      src={truckForm.passport_photo}
                      alt="Passport preview"
                      className="h-20 w-20 rounded-lg object-cover border border-slate-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-slate-500">Photo preview</p>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700 underline text-left"
                        onClick={() => setTruckForm(f => ({ ...f, passport_photo: '' }))}
                      >
                        Remove photo
                      </button>
                    </div>
                  </div>
                )}
            </div>

            {/* ── Section: Motor Boy ─────────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Users size={13} /> Motor Boy
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <User size={14} className="text-slate-500" /> Motor Boy's Name
                  </Label>
                  <Input placeholder="e.g. Chinedu Okafor" value={truckForm.motor_boy_name}
                    onChange={e => setTruckForm(f => ({ ...f, motor_boy_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> Motor Boy Phone 1
                  </Label>
                  <Input placeholder="e.g. 08012345678" value={truckForm.motor_boy_phone1}
                    onChange={e => setTruckForm(f => ({ ...f, motor_boy_phone1: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> Motor Boy Phone 2
                  </Label>
                  <Input placeholder="e.g. 09087654321" value={truckForm.motor_boy_phone2}
                    onChange={e => setTruckForm(f => ({ ...f, motor_boy_phone2: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* ── Section: Spare Driver ──────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <User size={13} /> Spare Driver (if available)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <User size={14} className="text-slate-500" /> Spare Driver Name
                  </Label>
                  <Input placeholder="e.g. Ibrahim Yusuf" value={truckForm.spare_driver_name}
                    onChange={e => setTruckForm(f => ({ ...f, spare_driver_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Phone size={14} className="text-slate-500" /> Spare Driver Phone
                  </Label>
                  <Input placeholder="e.g. 07012345678" value={truckForm.spare_driver_phone}
                    onChange={e => setTruckForm(f => ({ ...f, spare_driver_phone: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* ── Section: Status & Photo ────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Truck Status
              </h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-slate-500" /> Truck Condition
                  </Label>
                  <div className="flex gap-2">
                    {TRUCK_STATUS_OPTIONS.map(opt => {
                      const c = statusColors[opt];
                      const isActive = truckForm.truck_status_rating === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setTruckForm(f => ({
                              ...f,
                              truck_status_rating: opt,
                              // Clear reason if switching to Excellent or Good
                              truck_status_reason: (opt === 'Excellent' || opt === 'Good') ? '' : f.truck_status_reason,
                            }));
                          }}
                          className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                            isActive
                              ? `${c.badge} border-current ring-1 ring-current/20`
                              : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {(truckForm.truck_status_rating === 'Fair' || truckForm.truck_status_rating === 'Bad') && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-700">
                      Reason/Issue Details
                    </Label>
                    <Input
                      placeholder="e.g. No tyres, leaking tank, engine fault…"
                      value={truckForm.truck_status_reason}
                      onChange={e => setTruckForm(f => ({ ...f, truck_status_reason: e.target.value }))}
                    />
                    <p className="text-xs text-slate-400">Describe what's wrong with the truck</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section: Insurance & Road Worthiness ──────── */}
            <div>
              {/* <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Shield size={13} /> Insurance & Road Worthiness
              </h3> */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Shield size={14} className="text-slate-500" /> Insurance Expiry
                  </Label>
                  <Input type="date" value={truckForm.insurance_expiry}
                    onChange={e => setTruckForm(f => ({ ...f, insurance_expiry: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Shield size={14} className="text-slate-500" /> Road Worthiness Expiry
                  </Label>
                  <Input type="date" value={truckForm.road_worthiness_expiry}
                    onChange={e => setTruckForm(f => ({ ...f, road_worthiness_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* ── Section: Fuel & Maintenance ────────────────── */}
            {/* <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Wrench size={13} /> Fuel & Maintenance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Fuel size={14} className="text-slate-500" /> Avg Litres per Trip
                  </Label>
                  <Input type="number" step="0.1" placeholder="e.g. 350" value={truckForm.avg_litres_per_trip}
                    onChange={e => setTruckForm(f => ({ ...f, avg_litres_per_trip: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Fuel size={14} className="text-slate-500" /> Fuel Tank Capacity (L)
                  </Label>
                  <Input type="number" placeholder="e.g. 400" value={truckForm.fuel_capacity}
                    onChange={e => setTruckForm(f => ({ ...f, fuel_capacity: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Hash size={14} className="text-slate-500" /> Mileage (km)
                  </Label>
                  <Input type="text" inputMode="numeric" placeholder="e.g. 120,000" value={truckForm.mileage}
                    onChange={e => setTruckForm(f => ({ ...f, mileage: formatWithCommas(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Wrench size={14} className="text-slate-500" /> Last Service Date
                  </Label>
                  <Input type="date" value={truckForm.last_service_date}
                    onChange={e => setTruckForm(f => ({ ...f, last_service_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <CalendarIcon size={14} className="text-slate-500" /> Next Service Date
                  </Label>
                  <Input type="date" value={truckForm.next_service_date}
                    onChange={e => setTruckForm(f => ({ ...f, next_service_date: e.target.value }))} />
                </div>
              </div>
            </div> */}

            {/* ── Section: Documents ─────────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <FileText size={13} /> Documents
              </h3>
              <p className="text-xs text-slate-400 mb-3">Upload scans of truck documents (images or PDFs, max 2MB each)</p>
              <div className="space-y-3">
                {([
                  { key: 'insurance_cert_doc' as const, label: 'Insurance Certificate' },
                  { key: 'vehicle_papers_doc' as const, label: 'Vehicle Papers' },
                  { key: 'drivers_license_doc' as const, label: "Driver's License" },
                ] as const).map(doc => (
                  <div key={doc.key} className="space-y-1.5">
                    <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <Upload size={14} className="text-slate-500" /> {doc.label}
                    </Label>
                    {truckForm[doc.key] ? (
                      <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <img
                          src={truckForm[doc.key]}
                          alt={doc.label}
                          className="h-14 w-14 rounded-lg object-cover border border-slate-300"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="flex flex-col gap-1 flex-1">
                          <p className="text-xs text-slate-500">{doc.label} uploaded</p>
                          <button
                            type="button"
                            className="text-xs text-red-500 hover:text-red-700 underline text-left"
                            onClick={() => setTruckForm(f => ({ ...f, [doc.key]: '' }))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        className="cursor-pointer"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) {
                            toast({ title: 'File too large', description: 'Max 2MB per document', variant: 'destructive' });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => { setTruckForm(f => ({ ...f, [doc.key]: reader.result as string })); };
                          reader.readAsDataURL(file);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section: Incident / Accident History ───────── */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <CircleAlert size={13} /> Record an Incident
              </h3>
              {/* Existing incidents */}
              {truckForm.incidents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {truckForm.incidents.map((inc, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-red-50/50 rounded-lg border border-red-100">
                      <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{inc.description}</p>
                        <p className="text-[11px] text-slate-400">{inc.date ? format(parseISO(inc.date), 'dd MMM yyyy') : '—'}</p>
                      </div>
                      <button
                        type="button"
                        title="Remove incident"
                        className="text-red-400 hover:text-red-600 shrink-0"
                        onClick={() => setTruckForm(f => ({ ...f, incidents: f.incidents.filter((_, i) => i !== idx) }))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add new incident */}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Date</Label>
                  <Input type="date" className="h-9 text-sm" value={truckForm.new_incident_date}
                    onChange={e => setTruckForm(f => ({ ...f, new_incident_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Description</Label>
                  <Input className="h-9 text-sm" placeholder="e.g. Tyre burst on highway, minor collision…"
                    value={truckForm.new_incident_desc}
                    onChange={e => setTruckForm(f => ({ ...f, new_incident_desc: e.target.value }))} />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1"
                  disabled={!truckForm.new_incident_desc.trim()}
                  onClick={() => {
                    if (!truckForm.new_incident_desc.trim()) return;
                    setTruckForm(f => ({
                      ...f,
                      incidents: [...f.incidents, {
                        date: f.new_incident_date || new Date().toISOString().split('T')[0],
                        description: f.new_incident_desc.trim(),
                      }],
                      new_incident_date: '',
                      new_incident_desc: '',
                    }));
                  }}
                >
                  <Plus size={14} /> Add
                </Button>
              </div>
            </div>

            {/* ── Section: Notes ─────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <FileText size={14} className="text-slate-500" /> Notes
              </Label>
              <Textarea placeholder="Optional notes…" rows={2} value={truckForm.notes}
                onChange={e => setTruckForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTruckDialogOpen(false)} disabled={truckSaving}>Cancel</Button>
            <Button onClick={handleSaveTruck} disabled={truckSaving} className="gap-2">
              {truckSaving ? <Loader2 size={16} className="animate-spin" /> : truckEditing ? <Pencil size={16} /> : <Plus size={16} />}
              {truckSaving ? 'Saving…' : truckEditing ? 'Update Truck' : 'Add Truck'}
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
              <div className="bg-red-100 p-2 rounded-lg"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <span>Confirm Delete</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.label}</strong>?
              All ledger entries for this truck will also be removed.
              This action cannot be undone.
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
