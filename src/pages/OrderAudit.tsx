import { useState, useMemo, useCallback, Fragment } from 'react';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, CalendarDays, X, Download,
  CheckCircle2, Clock, ShieldCheck, Truck,
  ChevronLeft, ChevronRight, DollarSign, Package, Ticket, ChevronDown, ChevronUp,
  MapPin, Fuel, FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  format, parseISO,
  startOfWeek, startOfMonth, startOfYear, subDays,
} from 'date-fns';
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

const ACTION_STYLES: Record<string, { dot: string; ring: string; badge: string; label: string }> = {
  ORDER_CREATED:      { dot: 'bg-slate-700',   ring: 'ring-slate-200',   badge: 'bg-slate-50 text-slate-700 border-slate-200',   label: 'Order Created'      },
  PAYMENT_CONFIRMED:  { dot: 'bg-emerald-500', ring: 'ring-emerald-100', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Payment Confirmed' },
  ORDER_RELEASED:     { dot: 'bg-blue-500',    ring: 'ring-blue-100',    badge: 'bg-blue-50 text-blue-700 border-blue-200',       label: 'Order Released'     },
  TICKET_GENERATED:   { dot: 'bg-amber-500',   ring: 'ring-amber-100',   badge: 'bg-amber-50 text-amber-700 border-amber-200',    label: 'Ticket Generated'   },
  SECURITY_EXIT:      { dot: 'bg-purple-500',  ring: 'ring-purple-100',  badge: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Security Exit'      },
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
  let datePart = '';
  let timePart = '';
  if (time) {
    try {
      const d = parseISO(time);
      datePart = format(d, 'dd MMM yyyy');
      timePart = format(d, 'HH:mm');
    } catch { datePart = time; }
  }
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{name}</div>
      {datePart && (
        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
          <span>{datePart}</span>
          {timePart && <><span className="text-slate-300">·</span><span className="font-medium text-slate-600">{timePart}</span></>}
        </div>
      )}
    </div>
  );
}

// ─── Timeline steps definition ─────────────────────────────────────────────
const TIMELINE_STEPS = [
  { action: 'ORDER_CREATED',     label: 'Order Created',           icon: 'package' },
  { action: 'PAYMENT_CONFIRMED', label: 'Payment Confirmed',       icon: 'payment' },
  { action: 'ORDER_RELEASED',    label: 'Order Released',          icon: 'truck'   },
  { action: 'TICKET_GENERATED',  label: 'Ticket Generated',        icon: 'ticket'  },
  { action: 'SECURITY_EXIT',     label: 'Security Exit',           icon: 'shield'  },
] as const;

function StepIcon({ icon, done }: { icon: string; done: boolean }) {
  const cls = `w-4 h-4 ${done ? 'text-white' : 'text-slate-400'}`;
  if (icon === 'package')  return <Package     className={cls} />;
  if (icon === 'payment')  return <DollarSign  className={cls} />;
  if (icon === 'truck')    return <Truck       className={cls} />;
  if (icon === 'ticket')   return <Ticket      className={cls} />;
  if (icon === 'shield')   return <ShieldCheck className={cls} />;
  return <span className="w-2 h-2 rounded-full bg-slate-300" />;
}

function TimelineView({ events, order }: { events: AuditEvent[]; order: AuditOrder | null }) {
  if (!order) return null;
  // Last occurrence of each action wins (e.g. re-confirmations)
  const byAction = useMemo(() => {
    const m = new Map<string, AuditEvent>();
    [...events].reverse().forEach(e => m.set(e.action, e));
    return m;
  }, [events]);

  const knownActions = new Set(TIMELINE_STEPS.map(s => s.action));
  const extraEvents = events.filter(
    e => !knownActions.has(e.action as typeof TIMELINE_STEPS[number]['action']),
  );

  const fmtSplit = (raw?: string | null) => {
    if (!raw) return { date: null, time: null };
    try {
      const d = parseISO(raw);
      return { date: format(d, 'dd MMM yyyy'), time: format(d, 'HH:mm') };
    } catch { return { date: raw, time: null }; }
  };

  return (
    <div className="mt-5 space-y-0">
      {TIMELINE_STEPS.map((step, idx) => {
        const isCreated = step.action === 'ORDER_CREATED';
        const ev = isCreated ? null : byAction.get(step.action);

        // For ORDER_CREATED use the order's created_at; for others use the event timestamp
        const rawTs = isCreated ? order.created_at : ev?.timestamp;
        const done = isCreated ? !!order.created_at : !!ev;

        const actorName = ev
          ? (ev.actor_obj?.full_name || ev.actor_full_name || ev.actor_obj?.email || ev.actor_email || null)
          : null;
        const actorRole = ev?.actor_obj?.label || null;
        const actorEmail = actorName && actorName !== ev?.actor_email
          ? (ev?.actor_obj?.email || ev?.actor_email || null)
          : null;

        const style = ACTION_STYLES[step.action] ?? { dot: 'bg-slate-400', ring: 'ring-slate-100', badge: '', label: step.label };
        const { date, time } = fmtSplit(rawTs);
        const isLast = idx === TIMELINE_STEPS.length - 1;

        return (
          <div key={step.action} className="flex gap-4">
            {/* Left rail */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ring-4 shrink-0 transition-colors ${
                done
                  ? `${style.dot} ring-white shadow-sm`
                  : 'bg-slate-100 ring-white border border-slate-200'
              }`}>
                <StepIcon icon={step.icon} done={done} />
              </div>
              {!isLast && (
                <div className={`w-px flex-1 min-h-[36px] mt-1 ${done ? 'bg-slate-200' : 'bg-slate-100'}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 min-w-0 flex-1 ${isLast ? 'pb-2' : ''}`}>
              {/* Step label + timestamp on same row */}
              <div className="flex items-start justify-between gap-3 pt-1.5">
                <p className={`text-sm font-bold leading-tight ${done ? 'text-slate-900' : 'text-slate-400'}`}>
                  {step.label}
                </p>
                {done && date && (
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-slate-700">{date}</div>
                    {time && <div className="text-[11px] text-slate-500 mt-0.5">{time}</div>}
                  </div>
                )}
              </div>

              {/* Actor details */}
              {done && !isCreated && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {actorName ? (
                    <>
                      <span className="text-sm font-semibold text-slate-700">{actorName}</span>
                      {actorRole && (
                        <span className="text-xs text-slate-500">{actorRole}</span>
                      )}
                      {actorEmail && (
                        <span className="text-[11px] text-slate-400">{actorEmail}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-slate-400 italic">Actor not recorded</span>
                  )}
                </div>
              )}

              {done && isCreated && (
                <p className="mt-1 text-xs text-slate-500">Order placed in the system</p>
              )}

              {!done && (
                <p className="mt-1 text-xs text-slate-400">Not completed yet</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Extra / unexpected events */}
      {extraEvents.length > 0 && (
        <div className="mt-2 space-y-2 pt-4 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Other Events</p>
          {extraEvents.map(ev => {
            const { date, time } = (() => {
              try {
                const d = parseISO(ev.timestamp);
                return { date: format(d, 'dd MMM yyyy'), time: format(d, 'HH:mm') };
              } catch { return { date: ev.timestamp, time: null }; }
            })();
            return (
              <div key={ev.id} className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ACTION_STYLES[ev.action]?.dot || 'bg-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ACTION_STYLES[ev.action]?.badge || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {ev.action.replace(/_/g, ' ')}
                    </span>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-semibold text-slate-600">{date}</div>
                      {time && <div className="text-[11px] text-slate-400">{time}</div>}
                    </div>
                  </div>
                  {(ev.actor_full_name || ev.actor_email) && (
                    <div className="text-xs text-slate-600 mt-1.5 font-medium">
                      {ev.actor_full_name || ev.actor_email}
                      {ev.actor_obj?.label && (
                        <span className="font-normal text-slate-400 ml-1">\u00b7 {ev.actor_obj.label}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

  type TimePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

  const PRESETS: { key: TimePreset; label: string }[] = [
    { key: 'today',     label: 'Today'      },
    { key: 'yesterday', label: 'Yesterday'  },
    { key: 'week',      label: 'This Week'  },
    { key: 'month',     label: 'This Month' },
    { key: 'year',      label: 'This Year'  },
    { key: 'all',       label: 'All Time'   },
    { key: 'custom',    label: 'Date Range' },
  ];

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [pfiFilter, setPfiFilter] = useState('');
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [calRange, setCalRange] = useState<{ from?: Date; to?: Date }>({});
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { fromIso, toIso } = useMemo(() => {
    const today = new Date();
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
    if (timePreset === 'custom') return { fromIso: customFrom || undefined, toIso: customTo || undefined };
    if (timePreset === 'today')     return { fromIso: fmt(today), toIso: fmt(today) };
    if (timePreset === 'yesterday') { const y = subDays(today, 1); return { fromIso: fmt(y), toIso: fmt(y) }; }
    if (timePreset === 'week')      return { fromIso: fmt(startOfWeek(today, { weekStartsOn: 1 })), toIso: fmt(today) };
    if (timePreset === 'month')     return { fromIso: fmt(startOfMonth(today)), toIso: fmt(today) };
    if (timePreset === 'year')      return { fromIso: fmt(startOfYear(today)), toIso: fmt(today) };
    return { fromIso: undefined, toIso: undefined };
  }, [timePreset, customFrom, customTo]);

  const hasActiveFilters = !!(search || locationFilter || actionFilter || productFilter || pfiFilter || timePreset !== 'all' || customFrom || customTo);

  const clearFilters = useCallback(() => {
    setSearch(''); setLocationFilter(''); setActionFilter('');
    setProductFilter(''); setPfiFilter('');
    setTimePreset('all'); setCustomFrom(''); setCustomTo(''); setCalRange({});
    setPage(1);
  }, []);

  // ── List query ────────────────────────────────────────────────────
  const listQuery = useQuery<Paginated<AuditOrder>>({
    queryKey: ['order-audit', { search, locationFilter, actionFilter, productFilter, pfiFilter, from: fromIso, to: toIso, page }],
    queryFn: async () => (await apiClient.admin.getOrderAudit({
      q: search.trim() || undefined,
      action: actionFilter || undefined,
      location: locationFilter.trim() || undefined,
      product: productFilter.trim() || undefined,
      pfi: pfiFilter.trim() || undefined,
      from: fromIso, to: toIso, page, page_size: PAGE_SIZE,
    })) as Paginated<AuditOrder>,
    placeholderData: prev => prev,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const orders = useMemo(() => listQuery.data?.results ?? [], [listQuery.data]);
  const totalCount = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const expandedOrder = useMemo(
    () => orders.find(o => o.id === expandedId) ?? null,
    [orders, expandedId],
  );

  // ── Timeline query — fetches when a row is expanded ───────────────
  const eventsQuery = useQuery<Paginated<AuditEvent>>({
    queryKey: ['order-audit-events', expandedId],
    enabled: expandedId !== null,
    queryFn: async () => (await apiClient.admin.getOrderAuditEvents(
      expandedId!, { page: 1, page_size: 200 }
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
      // 'Released By': resolveActor(o.release_actor_obj, o.release_actor_full_name, o.release_actor_email, o.release_user_name, o.release_user_email) || '—',
      // 'Released At': fmtTs(o.released_at),
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
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search by customer, reference, company, PFI…"
                  className="pl-10 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
                {search && (
                  <button
                    type="button"
                    title="Clear search"
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100" />

              {/* Date presets */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays size={12} /> Date Period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.filter(p => p.key !== 'custom').map(({ key, label }) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => { setTimePreset(key); setCustomFrom(''); setCustomTo(''); setCalRange({}); setPage(1); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${timePreset === key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="Pick a custom date range"
                        onClick={() => setTimePreset('custom')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5 ${timePreset === 'custom'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <CalendarDays size={11} />
                        {timePreset === 'custom' && calRange.from
                          ? calRange.to
                            ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                            : format(calRange.from, 'dd MMM yyyy')
                          : 'Custom Range'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: calRange.from, to: calRange.to }}
                        onSelect={r => {
                          setCalRange(r ?? {});
                          setTimePreset('custom');
                          if (r?.from) setCustomFrom(format(r.from, 'yyyy-MM-dd'));
                          if (r?.to) setCustomTo(format(r.to, 'yyyy-MM-dd'));
                          if (r?.from && r?.to) { setCalOpen(false); setPage(1); }
                        }}
                        initialFocus
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Filter dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">

                {/* Stage */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Stage
                  </p>
                  <select
                    aria-label="Filter by stage"
                    value={actionFilter}
                    onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                    className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">All Stages</option>
                    <option value="PAYMENT_CONFIRMED">Payment Confirmed</option>
                    <option value="ORDER_RELEASED">Released</option>
                    <option value="TICKET_GENERATED">Ticket Generated</option>
                    <option value="SECURITY_EXIT">Security Exit</option>
                  </select>
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Location
                  </p>
                  <Input
                    placeholder="Filter by location…"
                    value={locationFilter}
                    onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
                    className="h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>

                {/* Product */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Fuel size={12} /> Product
                  </p>
                  <Input
                    placeholder="Filter by product…"
                    value={productFilter}
                    onChange={e => { setProductFilter(e.target.value); setPage(1); }}
                    className="h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>

                {/* PFI */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={12} /> PFI
                  </p>
                  <Input
                    placeholder="Filter by PFI number…"
                    value={pfiFilter}
                    onChange={e => { setPfiFilter(e.target.value); setPage(1); }}
                    className="h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  />
                </div>

              </div>

              {/* Bottom bar: active chips + clear */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {timePreset !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CalendarDays size={11} />
                      {timePreset === 'custom' && calRange.from
                        ? calRange.to
                          ? `${format(calRange.from, 'dd MMM')} – ${format(calRange.to, 'dd MMM yyyy')}`
                          : format(calRange.from, 'dd MMM yyyy')
                        : PRESETS.find(p => p.key === timePreset)?.label}
                      <button onClick={() => { setTimePreset('all'); setCustomFrom(''); setCustomTo(''); setCalRange({}); setPage(1); }} title="Remove date filter" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                  {actionFilter && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <CheckCircle2 size={10} />{ACTION_STYLES[actionFilter]?.label ?? actionFilter}
                      <button onClick={() => { setActionFilter(''); setPage(1); }} title="Remove stage filter" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                  {locationFilter && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <MapPin size={10} />{locationFilter}
                      <button onClick={() => { setLocationFilter(''); setPage(1); }} title="Remove location filter" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                  {productFilter && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Fuel size={10} />{productFilter}
                      <button onClick={() => { setProductFilter(''); setPage(1); }} title="Remove product filter" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                  {pfiFilter && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <FileText size={10} />{pfiFilter}
                      <button onClick={() => { setPfiFilter(''); setPage(1); }} title="Remove PFI filter" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                  {search && (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">
                      <Search size={10} />"{search}"
                      <button onClick={() => { setSearch(''); setPage(1); }} title="Clear search" className="ml-0.5 hover:text-slate-900" type="button"><X size={10} /></button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500 h-8 text-xs" onClick={clearFilters}>
                      <X size={13} /> Clear all
                    </Button>
                  )}
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {listQuery.isFetching ? 'Loading…' : `${totalCount.toLocaleString()} record${totalCount !== 1 ? 's' : ''}`}
                  </span>
                </div>
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
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Customer</TableHead>
                      {/* <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Company</TableHead> */}
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Location</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Product</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Quantity</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Amount</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Account Details</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Payment Confirmed By
                        </span>
                      </TableHead>
                      {/* <TableHead className="font-semibold text-slate-700 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                          Released By
                        </span>
                      </TableHead> */}
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
                          <TableCell colSpan={15}><Skeleton className="h-10 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : listQuery.isError ? (
                      <TableRow>
                        <TableCell colSpan={15} className="py-10 text-center text-red-600">
                          {(listQuery.error as Error)?.message || 'Failed to load audit data.'}
                        </TableCell>
                      </TableRow>
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="py-14 text-center">
                          <Package className="mx-auto text-slate-300 mb-3" size={40} />
                          <p className="text-slate-500 font-medium">No orders found</p>
                          <p className="text-sm text-slate-400 mt-1">
                            {hasActiveFilters ? 'Try adjusting your filters.' : 'Order audit records will appear here.'}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((o, idx) => {
                        const isExpanded = expandedId === o.id;
                        return (
                          <Fragment key={o.id}>
                            <TableRow
                              className={`transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50' : 'hover:bg-blue-50/30'}`}
                              onClick={() => setExpandedId(isExpanded ? null : o.id)}
                            >
                              <TableCell className="text-slate-400 text-xs">
                                {(page - 1) * PAGE_SIZE + idx + 1}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                <div className="font-medium text-slate-700">{fmtDate(o.created_at)}</div>
                                {o.created_at && (() => {
                                  try { return <div className="text-slate-400 mt-0.5">{format(parseISO(o.created_at), 'HH:mm')}</div>; }
                                  catch { return null; }
                                })()}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                                {o.order_reference || `ORD-${String(o.id).padStart(5, '0')}`}
                              </TableCell>
                              <TableCell className="whitespace-nowrap uppercase text-sm font-medium text-slate-800">
                                {o.customer_name || '—'}
                              </TableCell>
                              {/* <TableCell className="whitespace-nowrap uppercase text-sm text-slate-600">
                                {o.company_name || '—'}
                              </TableCell> */}
                              <TableCell className="text-slate-600 whitespace-nowrap">
                                {o.location || '—'}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-slate-800 whitespace-nowrap">
                                {o.product || '—'}
                              </TableCell>
                              <TableCell className="text-sm font-semibold text-slate-700 whitespace-nowrap text-right">
                                {o.quantity ? `${fmtQty(toNum(o.quantity))} Litres` : '—'}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-800 whitespace-nowrap">
                                {o.amount ? fmtMoney(toNum(o.amount)) : '—'}
                              </TableCell>
                              <TableCell className="text-slate-600 text-xs whitespace-nowrap">
                                {o.account_details || '—'}
                              </TableCell>
                              <TableCell>
                                <StagePill
                                  name={resolveActor(o.payment_actor_obj, o.payment_actor_full_name, o.payment_actor_email, o.payment_user_name, o.payment_user_email)}
                                  time={o.payment_confirmed_at}
                                  pending={!o.payment_confirmed_at}
                                />
                              </TableCell>
                              {/* <TableCell>
                                <StagePill
                                  name={resolveActor(o.release_actor_obj, o.release_actor_full_name, o.release_actor_email, o.release_user_name, o.release_user_email)}
                                  time={o.released_at}
                                  pending={!o.released_at}
                                />
                              </TableCell> */}
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
                              <TableCell onClick={e => e.stopPropagation()}>
                                <Button
                                  type="button"
                                  size="sm" variant="ghost"
                                  className={`h-8 w-8 p-0 ${isExpanded ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                                >
                                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                </Button>
                              </TableCell>
                            </TableRow>

                            {/* ── Inline timeline expansion ── */}
                            {isExpanded && (
                              <TableRow className="bg-slate-50/80 border-b border-slate-200">
                                <TableCell colSpan={15} className="px-6 py-5">
                                  <div className="flex gap-10">
                                    {/* Order summary */}
                                    <div className="shrink-0 w-52 space-y-3">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Summary</p>
                                      <div className="space-y-2 text-sm">
                                        {[
                                          ['Ref', o.order_reference || `ORD-${String(o.id).padStart(5, '0')}`],
                                          ['Customer', o.customer_name || '—'],
                                          // ['Company', o.company_name || '—'],
                                          ['Product', o.product || '—'],
                                          ['Quantity', o.quantity ? `${fmtQty(toNum(o.quantity))} L` : '—'],
                                          ['Amount', o.amount ? fmtMoney(toNum(o.amount)) : '—'],
                                          ['Location', o.location || '—'],
                                          ['Account', o.account_details || '—'],
                                        ].map(([label, value]) => (
                                          <div key={label}>
                                            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
                                            <div className="font-medium text-slate-800 text-sm">{value}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="w-px bg-slate-200 shrink-0" />

                                    {/* Timeline */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Audit Timeline</p>
                                      {eventsQuery.isLoading ? (
                                        <div className="space-y-3 mt-3">
                                          {Array.from({ length: 4 }).map((_, i) => (
                                            <Skeleton key={i} className="h-12 w-full rounded-lg" />
                                          ))}
                                        </div>
                                      ) : eventsQuery.isError ? (
                                        <p className="text-sm text-red-600 mt-3">
                                          {(eventsQuery.error as Error)?.message || 'Failed to load timeline.'}
                                        </p>
                                      ) : (
                                        <TimelineView
                                          events={eventsQuery.data?.results ?? []}
                                          order={expandedOrder}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
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

    </div>
  );
}
