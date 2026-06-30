import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, CalendarDays, X, Download, Eye,
  CheckCircle2, Clock, ShieldCheck, Truck,
  ChevronLeft, ChevronRight, DollarSign, Package, Ticket,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type ActorObj = {
  id?: number | null;
  full_name?: string | null;
  email?: string | null;
  role?: number | string | null;
  label?: string | null;
};

interface AuditOrder {
  id: number;
  created_at: string;
  order_reference?: string | null;
  customer_name?: string | null;
  company_name?: string | null;
  location?: string | null;
  product?: string | null;
  quantity?: string | number | null;
  amount?: string | number | null;
  account_details?: string | null;

  // ── Payment stage ──────────────────────────────────────────────
  payment_confirmed_at?: string | null;
  // legacy snapshot fields
  payment_user_name?: string | null;
  payment_user_email?: string | null;
  // dynamic actor fields (preferred)
  payment_actor_id?: number | null;
  payment_actor_full_name?: string | null;
  payment_actor_email?: string | null;
  payment_actor_obj?: ActorObj | null;

  // ── Release stage ─────────────────────────────────────────────
  released_at?: string | null;
  release_user_name?: string | null;
  release_user_email?: string | null;
  release_actor_id?: number | null;
  release_actor_full_name?: string | null;
  release_actor_email?: string | null;
  release_actor_obj?: ActorObj | null;

  // ── Ticket generation stage ───────────────────────────────────
  ticket_generated_at?: string | null;
  ticket_user_name?: string | null;
  ticket_user_email?: string | null;
  ticket_actor_full_name?: string | null;
  ticket_actor_email?: string | null;
  ticket_actor_obj?: ActorObj | null;

  // ── Security exit stage ───────────────────────────────────────
  truck_exit_at?: string | null;
  truck_exit_user_name?: string | null;
  truck_exit_user_email?: string | null;
  truck_exit_actor_id?: number | null;
  truck_exit_actor_full_name?: string | null;
  truck_exit_actor_email?: string | null;
  truck_exit_actor_obj?: ActorObj | null;
}

interface AuditEvent {
  id: number;
  action: string;
  timestamp: string;
  actor_id?: number | null;
  actor_email?: string | null;
  actor_full_name?: string | null;
  actor_obj?: {
    id?: number | null;
    email?: string | null;
    full_name?: string | null;
    role?: number | string | null;
    label?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
  prev_state?: string | null;
  new_state?: string | null;
}

interface Paginated<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const toNum = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (n: number) =>
  `\u20a6${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtQty = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtTs = (raw?: string | null): string => {
  if (!raw) return '\u2014';
  try { return format(parseISO(raw), 'dd MMM yyyy, HH:mm'); } catch { return String(raw); }
};

const fmtDate = (raw?: string | null): string => {
  if (!raw) return '\u2014';
  try { return format(parseISO(raw), 'dd MMM yyyy'); } catch { return String(raw); }
};

const ACTION_STYLES: Record<string, { dot: string; badge: string }> = {
  PAYMENT_CONFIRMED:  { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ORDER_RELEASED:     { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  TICKET_GENERATED:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  SECURITY_EXIT:      { dot: 'bg-slate-500',   badge: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const PAGE_SIZE = 50;

// ─── Actor resolution ──────────────────────────────────────────────────────
function resolveActor(
  obj?: ActorObj | null,
  fullName?: string | null,
  email?: string | null,
  userName?: string | null,
  userEmail?: string | null,
): string | null {
  return (
    obj?.full_name ||
    obj?.label ||
    fullName ||
    userName ||
    obj?.email ||
    email ||
    userEmail ||
    null
  );
}

// ─── Stage pill ────────────────────────────────────────────────────────────
function StagePill({ name, time, pending }: { name?: string | null; time?: string | null; pending?: boolean }) {
  if (pending || !name) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block shrink-0" />
        Pending
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{name}</div>
      {time && <div className="text-[11px] text-slate-500 mt-0.5">{fmtDate(time)}</div>}
    </div>
  );
}

// ─── Timeline steps definition ─────────────────────────────────────────────
const TIMELINE_STEPS = [
  { action: 'PAYMENT_CONFIRMED', label: 'Payment Confirmed',       icon: 'payment' },
  { action: 'ORDER_RELEASED',    label: 'Order Released',          icon: 'truck'   },
  { action: 'TICKET_GENERATED',  label: 'Ticket Generated',        icon: 'ticket'  },
  { action: 'SECURITY_EXIT',     label: 'Security Exit',           icon: 'shield'  },
] as const;

function StepIcon({ icon, done }: { icon: string; done: boolean }) {
  const cls = `w-4 h-4 ${done ? 'text-white' : 'text-slate-400'}`;
  if (icon === 'payment')  return <DollarSign  className={cls} />;
  if (icon === 'truck')    return <Truck       className={cls} />;
  if (icon === 'ticket')   return <Ticket      className={cls} />;
  if (icon === 'shield')   return <ShieldCheck className={cls} />;
  return <span className="w-2 h-2 rounded-full bg-slate-300" />;
}

function TimelineView({ events }: { events: AuditEvent[] }) {
  const byAction = useMemo(() => {
    const m = new Map<string, AuditEvent>();
    [...events].reverse().forEach(e => m.set(e.action, e));
    return m;
  }, [events]);

  const knownActions = new Set(TIMELINE_STEPS.map(s => s.action));
  const extraEvents = events.filter(e => !knownActions.has(e.action as typeof TIMELINE_STEPS[number]['action']));

  return (
    <div className="mt-4">
      {TIMELINE_STEPS.map((step, idx) => {
        const ev = byAction.get(step.action);
        const done = !!ev;
        const actorName = ev?.actor_obj?.full_name || ev?.actor_full_name || ev?.actor_email || null;
        const actorEmail = (actorName !== ev?.actor_email) ? (ev?.actor_obj?.email || ev?.actor_email || null) : null;
        const actorLabel = ev?.actor_obj?.label || null;
        const style = ACTION_STYLES[step.action] || { dot: 'bg-slate-400', badge: '' };

        return (
          <div key={step.action} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                done ? `${style.dot} border-transparent` : 'border-slate-200 bg-white'
              }`}>
                <StepIcon icon={step.icon} done={done} />
              </div>
              {idx < TIMELINE_STEPS.length - 1 && (
                <div className={`w-0.5 flex-1 min-h-[32px] ${done ? 'bg-slate-200' : 'bg-slate-100'}`} />
              )}
            </div>
            <div className="pb-5 min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm font-semibold ${done ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                {ev && <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">{fmtTs(ev.timestamp)}</span>}
              </div>
              {done ? (
                <div className="mt-1 text-sm text-slate-600">
                  <span className="font-medium">{actorName || '\u2014'}</span>
                  {actorEmail && <span className="text-xs text-slate-400 ml-1.5">\u00b7 {actorEmail}</span>}
                  {actorLabel && <span className="text-xs text-slate-500 ml-1">({actorLabel})</span>}
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">Not completed yet</p>
              )}
            </div>
          </div>
        );
      })}

      {extraEvents.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Other Events</p>
          {extraEvents.map(ev => (
            <div key={ev.id} className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ACTION_STYLES[ev.action]?.dot || 'bg-slate-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${ACTION_STYLES[ev.action]?.badge || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {ev.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">{fmtTs(ev.timestamp)}</span>
                </div>
                {(ev.actor_full_name || ev.actor_email) && (
                  <div className="text-xs text-slate-600 mt-1">{ev.actor_full_name || ev.actor_email}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export default function OrderAudit() {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [page, setPage] = useState(1);
  const [openOrder, setOpenOrder] = useState<AuditOrder | null>(null);

  const fromIso = useMemo(() => dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined, [dateRange.from]);
  const toIso   = useMemo(() => dateRange.to   ? format(dateRange.to,   'yyyy-MM-dd') : undefined, [dateRange.to]);

  const hasActiveFilters = !!(search || locationFilter || actionFilter || dateRange.from);

  const clearFilters = useCallback(() => {
    setSearch(''); setLocationFilter(''); setActionFilter('');
    setDateRange({ from: null, to: null }); setPage(1);
  }, []);

  // ── List query ────────────────────────────────────────────────────
  const listQuery = useQuery<Paginated<AuditOrder>>({
    queryKey: ['order-audit', { search, locationFilter, actionFilter, from: fromIso, to: toIso, page }],
    queryFn: async () => (await apiClient.admin.getOrderAudit({
      q: search.trim() || undefined,
      action: actionFilter || undefined,
      location: locationFilter.trim() || undefined,
      from: fromIso, to: toIso, page, page_size: PAGE_SIZE,
    })) as Paginated<AuditOrder>,
    placeholderData: prev => prev,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const orders = useMemo(() => listQuery.data?.results ?? [], [listQuery.data]);
  const totalCount = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ── Timeline query ────────────────────────────────────────────────
  const eventsQuery = useQuery<Paginated<AuditEvent>>({
    queryKey: ['order-audit-events', openOrder?.id],
    enabled: !!openOrder,
    queryFn: async () => (await apiClient.admin.getOrderAuditEvents(
      openOrder!.id, { page: 1, page_size: 200 }
    )) as Paginated<AuditEvent>,
    staleTime: 30_000,
  });

  // ── Summary cards ─────────────────────────────────────────────────
  const summaryCards = useMemo((): SummaryCard[] => {
    const confirmed = orders.filter(o => !!o.payment_confirmed_at).length;
    const released  = orders.filter(o => !!o.released_at).length;
    const ticketed  = orders.filter(o => !!o.ticket_generated_at).length;
    const exited    = orders.filter(o => !!o.truck_exit_at).length;
    const pending   = orders.filter(o => !o.truck_exit_at).length;
    return [
      { title: 'Total Orders',        value: String(totalCount), icon: <Package size={20} />,      tone: 'neutral' },
      { title: 'Payment Confirmed',   value: String(confirmed),  icon: <CheckCircle2 size={20} />, tone: 'green'   },
      { title: 'Released',            value: String(released),   icon: <Truck size={20} />,        tone: 'neutral' },
      { title: 'Tickets Generated',   value: String(ticketed),   icon: <Ticket size={20} />,       tone: 'neutral' },
      { title: 'Security Exit Done',  value: String(exited),     icon: <ShieldCheck size={20} />,  tone: 'green'   },
      { title: 'Awaiting Exit',       value: String(pending),    icon: <Clock size={20} />,        tone: pending > 0 ? 'amber' : 'neutral' },
    ];
  }, [orders, totalCount]);

  // ── Export ────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!orders.length) return;
    const rows = orders.map((o, idx) => ({
      'S/N': idx + 1,
      'Order Ref': o.order_reference || '—',
      'Date': fmtDate(o.created_at),
      'Customer': o.customer_name || '—',
      'Company': o.company_name || '—',
      'Location': o.location || '—',
      'Product': o.product || '—',
      'Quantity (L)': toNum(o.quantity),
      'Amount': toNum(o.amount),
      'Account Details': o.account_details || '—',
      'Payment Confirmed By': resolveActor(o.payment_actor_obj, o.payment_actor_full_name, o.payment_actor_email, o.payment_user_name, o.payment_user_email) || '—',
      'Payment Confirmed At': fmtTs(o.payment_confirmed_at),
      'Released By': resolveActor(o.release_actor_obj, o.release_actor_full_name, o.release_actor_email, o.release_user_name, o.release_user_email) || '—',
      'Released At': fmtTs(o.released_at),
      'Ticket Generated By': resolveActor(o.ticket_actor_obj, o.ticket_actor_full_name, o.ticket_actor_email, o.ticket_user_name, o.ticket_user_email) || '—',
      'Ticket Generated At': fmtTs(o.ticket_generated_at),
      'Truck Exit By': resolveActor(o.truck_exit_actor_obj, o.truck_exit_actor_full_name, o.truck_exit_actor_email, o.truck_exit_user_name, o.truck_exit_user_email) || '—',
      'Truck Exit At': fmtTs(o.truck_exit_at),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Order Audit');
    XLSX.writeFile(wb, `ORDER-AUDIT-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast({ title: 'Exported successfully' });
  }, [orders, toast]);

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
          <div className="max-w-[1600px] mx-auto space-y-5">

            <PageHeader
              title="Order Audit Trail"
              description="Full accountability trail — who confirmed payment, who released, and who logged truck exit for every order."
              actions={
                <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!orders.length}>
                  <Download size={16} /> Export
                </Button>
              }
            />

            <SummaryCards cards={summaryCards} />

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    placeholder="Search reference, customer, product, location…"
                    className="pl-10"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select
                  aria-label="Filter by stage"
                  value={actionFilter}
                  onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                  className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-[200px]"
                >
                  <option value="">All Stages</option>
                  <option value="PAYMENT_CONFIRMED">Payment Confirmed</option>
                  <option value="ORDER_RELEASED">Released / Ticketed</option>
                  <option value="SECURITY_EXIT">Security Exit</option>
                </select>
                <Input
                  placeholder="Filter by location…"
                  className="h-10 min-w-[160px]"
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center pt-2 border-t border-slate-100">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 justify-start text-left font-normal text-sm gap-2 min-w-[230px]">
                      <CalendarDays size={15} className="text-slate-400" />
                      {dateRange.from && dateRange.to
                        ? `${format(dateRange.from, 'dd MMM yyyy')} – ${format(dateRange.to, 'dd MMM yyyy')}`
                        : 'Pick date range'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                      onSelect={range => { setDateRange({ from: range?.from ?? null, to: range?.to ?? null }); setPage(1); }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-slate-500 hover:text-red-600" onClick={clearFilters}>
                    <X size={14} /> Clear filters
                  </Button>
                )}

                <span className="ml-auto text-xs text-slate-400 hidden sm:block">
                  {listQuery.isFetching
                    ? 'Loading…'
                    : `${totalCount.toLocaleString()} record${totalCount !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="w-12 font-semibold text-slate-700">#</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Date</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Order Ref</TableHead>
                      <TableHead className="font-semibold text-slate-700">Customer</TableHead>
                      <TableHead className="font-semibold text-slate-700">Location</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Product / Qty</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Amount</TableHead>
                      <TableHead className="font-semibold text-slate-700">Account Details</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Payment Confirmed By
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          Released By
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          Ticket Generated By
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
                          Truck Exit By
                        </span>
                      </TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {listQuery.isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={13}><Skeleton className="h-10 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : listQuery.isError ? (
                      <TableRow>
                        <TableCell colSpan={13} className="py-10 text-center text-red-600">
                          {(listQuery.error as Error)?.message || 'Failed to load audit data.'}
                        </TableCell>
                      </TableRow>
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="py-14 text-center">
                          <Package className="mx-auto text-slate-300 mb-3" size={40} />
                          <p className="text-slate-500 font-medium">No orders found</p>
                          <p className="text-sm text-slate-400 mt-1">
                            {hasActiveFilters ? 'Try adjusting your filters.' : 'Order audit records will appear here.'}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o, idx) => (
                        <TableRow
                          key={o.id}
                          className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                          onClick={() => setOpenOrder(o)}
                        >
                          <TableCell className="text-slate-400 text-xs">
                            {(page - 1) * PAGE_SIZE + idx + 1}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-slate-600 text-xs">
                            {fmtDate(o.created_at)}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                            {o.order_reference || `ORD-${String(o.id).padStart(5, '0')}`}
                          </TableCell>
                          <TableCell className="max-w-[160px]">
                            <div className="text-sm font-medium text-slate-800 truncate leading-tight">
                              {o.customer_name || '—'}
                            </div>
                            {o.company_name && (
                              <div className="text-xs text-slate-500 truncate mt-0.5">{o.company_name}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-600 max-w-[130px] truncate">
                            {o.location || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-800">{o.product || '—'}</div>
                            {o.quantity ? (
                              <div className="text-xs text-slate-500">{fmtQty(toNum(o.quantity))} L</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                            {o.amount ? fmtMoney(toNum(o.amount)) : '—'}
                          </TableCell>
                          <TableCell className="text-slate-600 text-xs whitespace-pre-line max-w-[140px]">
                            {o.account_details || '—'}
                          </TableCell>
                          <TableCell>
                            <StagePill
                              name={resolveActor(o.payment_actor_obj, o.payment_actor_full_name, o.payment_actor_email, o.payment_user_name, o.payment_user_email)}
                              time={o.payment_confirmed_at}
                              pending={!o.payment_confirmed_at}
                            />
                          </TableCell>
                          <TableCell>
                            <StagePill
                              name={resolveActor(o.release_actor_obj, o.release_actor_full_name, o.release_actor_email, o.release_user_name, o.release_user_email)}
                              time={o.released_at}
                              pending={!o.released_at}
                            />
                          </TableCell>
                          <TableCell>
                            <StagePill
                              name={resolveActor(o.ticket_actor_obj, o.ticket_actor_full_name, o.ticket_actor_email, o.ticket_user_name, o.ticket_user_email)}
                              time={o.ticket_generated_at}
                              pending={!o.ticket_generated_at}
                            />
                          </TableCell>
                          <TableCell>
                            <StagePill
                              name={resolveActor(o.truck_exit_actor_obj, o.truck_exit_actor_full_name, o.truck_exit_actor_email, o.truck_exit_user_name, o.truck_exit_user_email)}
                              time={o.truck_exit_at}
                              pending={!o.truck_exit_at}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600"
                              title="View timeline"
                              onClick={e => { e.stopPropagation(); setOpenOrder(o); }}
                            >
                              <Eye size={15} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 bg-white">
                <span className="text-xs text-slate-500">
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  {totalCount > 0 && <> · <strong>{totalCount.toLocaleString()}</strong> total</>}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={page <= 1 || listQuery.isFetching}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} /> Previous
                  </Button>
                  <Button
                    variant="outline" size="sm" className="gap-1"
                    disabled={page >= totalPages || listQuery.isFetching}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Timeline Drawer ─────────────────────────────────────────── */}
      <Sheet open={!!openOrder} onOpenChange={open => { if (!open) setOpenOrder(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-slate-800">
              <Clock size={18} className="text-slate-500" />
              Order Timeline
            </SheetTitle>
            <SheetDescription className="text-sm text-slate-500">
              {openOrder && (
                <>
                  <strong>
                    {openOrder.order_reference || `ORD-${String(openOrder.id).padStart(5, '0')}`}
                  </strong>
                  {openOrder.customer_name && <> · {openOrder.customer_name}</>}
                  {openOrder.company_name && <span className="text-slate-400"> ({openOrder.company_name})</span>}
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          {openOrder && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Product</span>
                <span className="font-medium text-slate-800">{openOrder.product || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity</span>
                <span className="font-medium text-slate-800">
                  {openOrder.quantity ? `${fmtQty(toNum(openOrder.quantity))} L` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-semibold text-slate-800">
                  {openOrder.amount ? fmtMoney(toNum(openOrder.amount)) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location</span>
                <span className="font-medium text-slate-800">{openOrder.location || '—'}</span>
              </div>
              {openOrder.account_details && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">Account</span>
                  <span className="font-medium text-slate-800 text-right whitespace-pre-line text-xs">
                    {openOrder.account_details}
                  </span>
                </div>
              )}
            </div>
          )}

          {eventsQuery.isLoading ? (
            <div className="mt-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : eventsQuery.isError ? (
            <p className="mt-6 text-sm text-red-600">
              {(eventsQuery.error as Error)?.message || 'Failed to load timeline.'}
            </p>
          ) : (
            <TimelineView events={eventsQuery.data?.results ?? []} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
