import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { MobileNav } from '@/components/MobileNav';
import { Button } from '@/components/ui/button';
import { apiClient, fetchAllPages } from '@/api/client';
import { usePrefetchAll } from '@/hooks/usePrefetchAll';
import { format, isToday, parseISO, subDays, addDays, startOfDay, startOfMonth, endOfDay, isAfter, isBefore } from 'date-fns';
import {
  TrendingUp,
  CheckCircle,
  BarChart3,
  Activity,
  BadgeDollarSign,
  TruckIcon,
  FuelIcon,
  ShoppingBag,
  FileText,
  UserCheck,
  Building2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// ---------- Types ----------
interface AnalyticsData {
  orders?: number;
  orders_change?: number;
  sales_revenue?: number;
  sales_revenue_change?: number;
  active_customers_change?: number;
  unpaid_orders?: number;
  quantity_sold?: Array<{
    name?: string;
    product_name?: string;
    product?: string;
    type?: string;
    current_quantity?: number;
    change?: number;
  }>;
}

interface CustomerResponse {
  count: number;
  customers: Array<unknown>;
}

type OrderLite = {
  id: number;
  status?: string;
  created_at?: string;
  quantity?: number | string;
  total_price?: number | string;
  state?: string;
  pfi_id?: number | null;
  pfi_number?: string | null;
  reference?: string;
  user?: Record<string, unknown>;
  customer_details?: Record<string, unknown>;
  release_type?: 'pickup' | 'delivery';
};

type PfiLite = {
  id: number;
  pfi_number: string;
  status?: string;
  location?: number | string;
  location_name?: string;
  product?: number | string;
  product_name?: string;
  orders_count?: number;
  total_quantity_litres?: number | string;
  total_amount?: number | string;
};

// ---------- Helpers ----------
const safeParseNumber = (v: unknown) => {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const str = String(v).trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const abbreviateNumber = (num?: number): string => {
  const value = Number(num || 0);
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}b`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return value.toLocaleString();
};

const normalizeDepot = (value?: string | null) => {
  let depot = String(value || '').trim();
  if (!depot) return 'Unknown Depot';

  const lower = depot.toLowerCase();
  if (lower.includes('dangote refinery') || lower.includes('dangote lagos') || lower === 'dangote') {
    return 'Dangote Lagos / Refinery';
  }
  return depot;
};

// ---------- Dashboard ----------
const Dashboard: React.FC = () => {
  // Prefetch ALL app data in parallel on dashboard load
  usePrefetchAll();

  // Analytics API
  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics()
  });

  // Customer Orders API
  const { data: allOrdersResp } = useQuery<{ count: number; results: OrderLite[] }>({
    queryKey: ['all-orders', 'counts'],
    queryFn: async () => {
      return fetchAllPages<OrderLite>(
        (p) => apiClient.admin.getAllAdminOrders({ page: p.page, page_size: p.page_size }),
      );
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Customers Count API
  const { data: customerData } = useQuery<CustomerResponse>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers()
  });

  const ordersAll = useMemo(() => allOrdersResp?.results || [], [allOrdersResp?.results]);

  const norm = (s: unknown) => String(s || '').toLowerCase();

  // ----- Today's Live Stats -----
  const todayOrders = useMemo(() => {
    return ordersAll.filter((o) => {
      const raw = String(o.created_at || '').trim();
      if (!raw) return false;
      const d = (() => {
        try {
          return parseISO(raw);
        } catch {
          return new Date(raw);
        }
      })();
      return isToday(d);
    });
  }, [ordersAll]);

  const todayTotals = useMemo(() => {
    let litres = 0;
    let amount = 0;
    let confirmed = 0;

    todayOrders.forEach((o) => {
      const status = norm(o.status);
      const qty = safeParseNumber(o.quantity);
      const price = safeParseNumber(o.total_price);

      // Exclude canceled orders from volume — mirrors the depot metrics logic below
      if (status !== 'canceled') litres += qty;

      // Revenue only counts orders that have actually progressed (paid/released/loaded/sold) —
      // matches periodSummary.revenue so "Today" and "Period" figures are directly comparable
      if (['paid', 'released', 'loaded', 'sold'].includes(status)) {
        amount += price;
        confirmed += 1;
      }
    });

    return {
      orders: todayOrders.length,
      releasedOrLoaded: confirmed,
      litres,
      amount,
    };
  }, [todayOrders]);

  // ----- Audit Trend Settings & State -----
  const [depotTrendRange, setDepotTrendRange] = useState<'30d' | 'month' | '90d'>('30d');

  const periodRangeLabel = depotTrendRange === '30d' ? 'Last 30 Days' : depotTrendRange === 'month' ? 'This Month' : 'Last 90 Days';

  const depotTrendStartDate = useMemo(() => {
    if (depotTrendRange === '30d') return subDays(new Date(), 29);
    if (depotTrendRange === 'month') return startOfMonth(new Date());
    return subDays(new Date(), 89);
  }, [depotTrendRange]);

  const filteredOrders = useMemo(() => {
    const start = startOfDay(depotTrendStartDate);
    const end = endOfDay(new Date());
    return ordersAll.filter((o) => {
      const raw = String(o.created_at || '').trim();
      if (!raw) return false;
      const created = parseISO(raw);
      if (Number.isNaN(created.getTime())) return false;
      return !isBefore(created, start) && !isAfter(created, end);
    });
  }, [ordersAll, depotTrendStartDate]);

  // ----- Compute Depot Metrics -----
  const depotMetrics = useMemo(() => {
    const map = new Map<string, {
      depot: string;
      volume: number;
      revenue: number;
      ordersCount: number;
      pickupCount: number;
      deliveryCount: number;
      statusCounts: {
        pending: number;
        paid: number;
        released: number;
        loaded: number;
        sold: number;
        canceled: number;
      };
    }>();

    filteredOrders.forEach((o) => {
      const depotName = normalizeDepot(o.state);
      let metric = map.get(depotName);
      if (!metric) {
        metric = {
          depot: depotName,
          volume: 0,
          revenue: 0,
          ordersCount: 0,
          pickupCount: 0,
          deliveryCount: 0,
          statusCounts: {
            pending: 0,
            paid: 0,
            released: 0,
            loaded: 0,
            sold: 0,
            canceled: 0,
          },
        };
        map.set(depotName, metric);
      }

      const qty = safeParseNumber(o.quantity);
      const price = safeParseNumber(o.total_price);
      const status = norm(o.status);

      metric.ordersCount += 1;

      // Status breakdown
      if (status === 'pending') metric.statusCounts.pending += 1;
      else if (status === 'paid') metric.statusCounts.paid += 1;
      else if (status === 'released') metric.statusCounts.released += 1;
      else if (status === 'loaded') metric.statusCounts.loaded += 1;
      else if (status === 'sold') metric.statusCounts.sold += 1;
      else if (status === 'canceled') metric.statusCounts.canceled += 1;

      // Exclude canceled from volume
      if (status !== 'canceled') {
        metric.volume += qty;
      }

      // Sum paid/released/loaded/sold for revenue
      if (['paid', 'released', 'loaded', 'sold'].includes(status)) {
        metric.revenue += price;
      }

      // Logistics split
      const relType = norm(o.release_type);
      if (relType === 'pickup') {
        metric.pickupCount += 1;
      } else {
        metric.deliveryCount += 1;
      }
    });

    return Array.from(map.values()).map((m) => ({
      ...m,
      averageSize: m.ordersCount > 0 ? Math.round(m.volume / m.ordersCount) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // ----- Metric Summary Cards -----
  const topRevenueDepot = useMemo(() => {
    if (depotMetrics.length === 0) return { depot: 'N/A', revenue: 0 };
    return depotMetrics[0];
  }, [depotMetrics]);

  const topVolumeDepot = useMemo(() => {
    if (depotMetrics.length === 0) return { depot: 'N/A', volume: 0 };
    const sorted = [...depotMetrics].sort((a, b) => b.volume - a.volume);
    return sorted[0];
  }, [depotMetrics]);

  const periodSummary = useMemo(() => {
    let totalVolume = 0;
    let totalRevenue = 0;
    let totalOrders = 0;
    let totalPickup = 0;
    let totalDelivery = 0;

    let totalPending = 0;
    let totalPaid = 0;
    let totalReleased = 0;
    let totalLoaded = 0;
    let totalSold = 0;
    let totalCanceled = 0;

    depotMetrics.forEach((m) => {
      totalVolume += m.volume;
      totalRevenue += m.revenue;
      totalOrders += m.ordersCount;
      totalPickup += m.pickupCount;
      totalDelivery += m.deliveryCount;

      totalPending += m.statusCounts.pending;
      totalPaid += m.statusCounts.paid;
      totalReleased += m.statusCounts.released;
      totalLoaded += m.statusCounts.loaded;
      totalSold += m.statusCounts.sold;
      totalCanceled += m.statusCounts.canceled;
    });

    return {
      volume: totalVolume,
      revenue: totalRevenue,
      ordersCount: totalOrders,
      averageSize: totalOrders > 0 ? Math.round(totalVolume / totalOrders) : 0,
      pickupCount: totalPickup,
      deliveryCount: totalDelivery,
      statusCounts: {
        pending: totalPending,
        paid: totalPaid,
        released: totalReleased,
        loaded: totalLoaded,
        sold: totalSold,
        canceled: totalCanceled,
      }
    };
  }, [depotMetrics]);

  // ----- Trend Line Charts -----
  const topDepotNames = useMemo(() => {
    const sorted = [...depotMetrics].sort((a, b) => b.volume - a.volume);
    return sorted.slice(0, 4).map((m) => m.depot);
  }, [depotMetrics]);

  const depotTrendDates = useMemo(() => {
    const dates: string[] = [];
    let current = startOfDay(depotTrendStartDate);
    const today = startOfDay(new Date());
    while (!isAfter(current, today)) {
      dates.push(format(current, 'dd MMM'));
      current = addDays(current, 1);
    }
    return dates;
  }, [depotTrendStartDate]);

  const depotTrendData = useMemo(() => {
    const dateMap = new Map<string, { date: string;[key: string]: any }>();
    depotTrendDates.forEach((dateLabel) => {
      const entry: { date: string;[key: string]: any } = { date: dateLabel };
      topDepotNames.forEach((name) => {
        entry[name] = 0;
      });
      dateMap.set(dateLabel, entry);
    });

    filteredOrders.forEach((o) => {
      const status = norm(o.status);
      if (status === 'canceled') return;

      const raw = String(o.created_at || '').trim();
      if (!raw) return;
      const created = parseISO(raw);
      if (Number.isNaN(created.getTime())) return;
      if (isBefore(created, startOfDay(depotTrendStartDate)) || isAfter(created, endOfDay(new Date()))) return;

      const label = format(created, 'dd MMM');
      const entry = dateMap.get(label);
      if (!entry) return;

      const depotName = normalizeDepot(o.state);
      if (topDepotNames.includes(depotName)) {
        entry[depotName] = (entry[depotName] || 0) + safeParseNumber(o.quantity);
      }
    });

    return Array.from(dateMap.values());
  }, [filteredOrders, depotTrendDates, depotTrendStartDate, topDepotNames]);

  const depotRankingData = useMemo(() => {
    return depotMetrics.map((m) => ({
      depot: m.depot,
      revenue: m.revenue,
      volume: m.volume,
    })).slice(0, 10);
  }, [depotMetrics]);

  const isOrdersLoading = !allOrdersResp;

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <PageHeader
                title="Sales Overview"
                description="Consolidated customer order audit metrics, sales volumes, revenues analytics."
              />
              <div className="flex items-center gap-3">
                <select
                  aria-label="Overview trend range"
                  value={depotTrendRange}
                  onChange={(e) => setDepotTrendRange(e.target.value as '30d' | 'month' | '90d')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
                >
                  <option value="30d">Last 30 Days</option>
                  <option value="month">This Month</option>
                  <option value="90d">Last 90 Days</option>
                </select>
                {/* <Button variant="outline" className="h-10 rounded-lg shadow-sm" onClick={() => window.location.reload()}>
                  Refresh
                </Button> */}
              </div>
            </div>

            {/* Today's Pulse — a compact, scannable strip so "today" doesn't compete visually with the period snapshot below */}
            <div className="bg-slate-900 text-white rounded-xl shadow-sm px-5 sm:px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    Today's Pulse · {format(new Date(), 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Revenue</span>
                    <span className="font-bold text-emerald-400">₦{todayTotals.amount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Volume</span>
                    <span className="font-bold">{todayTotals.litres.toLocaleString()} L</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px] uppercase tracking-wide mr-1.5">Orders</span>
                    <span className="font-bold">{todayTotals.releasedOrLoaded}</span>
                    <span className="text-slate-400 font-normal"> confirmed / {todayTotals.orders} placed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Period Snapshot — the main "what's happening" summary, all in one scannable row */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <Building2 className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{periodRangeLabel} Snapshot</h2>
              </div>
              <SummaryCards
                gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                cards={[
                  {
                    title: "Total Revenue",
                    value: `₦${periodSummary.revenue.toLocaleString()}`,
                    description: `${periodSummary.ordersCount} confirmed orders · avg ${periodSummary.averageSize.toLocaleString()} L/order`,
                    icon: <BadgeDollarSign className="h-5 w-5" />,
                    tone: 'green',
                  },
                  {
                    title: "Total Volume Sold",
                    value: `${periodSummary.volume.toLocaleString()} L`,
                    description: `${periodSummary.deliveryCount} delivery · ${periodSummary.pickupCount} pickup`,
                    icon: <FuelIcon className="h-5 w-5" />,
                    tone: 'amber',
                  },
                  {
                    title: "Top Depot by Revenue",
                    value: `₦${(topRevenueDepot.revenue || 0).toLocaleString()}`,
                    description: topRevenueDepot.depot,
                    icon: <TrendingUp className="h-5 w-5" />,
                    tone: 'green',
                  },
                  {
                    title: "Top Depot by Volume",
                    value: `${(topVolumeDepot.volume || 0).toLocaleString()} L`,
                    description: topVolumeDepot.depot,
                    icon: <TruckIcon className="h-5 w-5" />,
                    tone: 'neutral',
                  },
                ]}
              />
            </div>

            {/* Charts side by side — both visible at once instead of a long vertical stack */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Sales Volume Trend</h3>
                  <p className="text-xs pt-2 text-slate-500">Daily order quantity (litres) for the top depots — {periodRangeLabel.toLowerCase()}</p>
                </div>
                <div className="h-72">
                  {isOrdersLoading ? (
                    <div className="flex h-full items-center justify-center text-slate-400">Fetching….</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={depotTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => abbreviateNumber(v)} />
                        <Tooltip formatter={(value: number) => [`${value.toLocaleString()} L`, 'Volume']} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {topDepotNames.map((depot, idx) => {
                          const strokes = ['#059669', '#0f172a', '#f59e0b', '#10b981'];
                          return (
                            <Line
                              key={depot}
                              type="monotone"
                              dataKey={depot}
                              stroke={strokes[idx] || '#cbd5e1'}
                              strokeWidth={2.5}
                              dot={false}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Revenue Ranking by Depot</h3>
                  <p className="text-xs pt-2 text-slate-500">Total order revenue (₦) generated per depot — {periodRangeLabel.toLowerCase()}</p>
                </div>
                <div className="h-72">
                  {isOrdersLoading ? (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">Fetching…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={depotRankingData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => abbreviateNumber(v)} />
                        <YAxis dataKey="depot" type="category" width={150} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
                        <Bar dataKey="revenue" fill="#059669" radius={[0, 4, 4, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Depot Leaderboard — clean ranked list instead of a dense audit table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold">Depot Leaderboard</h3>
                </div>
                <p className="text-xs text-slate-500">Ranked by total revenue — {periodRangeLabel.toLowerCase()}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {isOrdersLoading ? (
                  <p className="p-8 text-center text-sm text-slate-400">Loading depot data…</p>
                ) : depotMetrics.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-400">No depot records found for this period.</p>
                ) : (
                  depotMetrics.slice(0, 8).map((row, idx) => {
                    const maxRevenue = depotMetrics[0]?.revenue || 1;
                    const pct = Math.max(4, Math.round((row.revenue / maxRevenue) * 100));
                    return (
                      <div key={row.depot} className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                        <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="font-semibold text-slate-800 truncate">{row.depot}</p>
                            <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">₦{row.revenue.toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">{row.ordersCount} orders · {row.volume.toLocaleString()} L</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
