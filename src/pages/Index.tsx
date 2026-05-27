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
  PieChartIcon
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
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

const abbreviateCurrency = (num?: number): string => {
  return `₦${abbreviateNumber(num)}`;
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
    const litres = todayOrders.reduce((acc, o) => acc + safeParseNumber(o.quantity), 0);
    const amount = todayOrders.reduce((acc, o) => acc + safeParseNumber(o.total_price), 0);
    const releasedOrLoaded = todayOrders.filter((o) => {
      const st = norm(o.status);
      return st === 'paid' || st === 'released' || st === 'loaded' || st === 'sold';
    });
    return {
      orders: todayOrders.length,
      releasedOrLoaded: releasedOrLoaded.length,
      litres,
      amount,
    };
  }, [todayOrders]);

  // ----- Audit Trend Settings & State -----
  const [depotTrendRange, setDepotTrendRange] = useState<'30d' | 'month' | '90d'>('30d');

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

  const topOrderDepot = useMemo(() => {
    if (depotMetrics.length === 0) return { depot: 'N/A', ordersCount: 0 };
    const sorted = [...depotMetrics].sort((a, b) => b.ordersCount - a.ordersCount);
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

  // ----- Pie/Donut Chart Data -----
  const statusDistributionData = useMemo(() => {
    const counts = periodSummary.statusCounts;
    return [
      { name: 'Pending', value: counts.pending, color: '#f59e0b' },
      { name: 'Paid', value: counts.paid, color: '#6366f1' },
      { name: 'Released', value: counts.released, color: '#3b82f6' },
      { name: 'Loaded', value: counts.loaded, color: '#10b981' },
      { name: 'Sold', value: counts.sold, color: '#047857' },
      { name: 'Canceled', value: counts.canceled, color: '#ef4444' },
    ].filter(item => item.value > 0);
  }, [periodSummary.statusCounts]);

  const logisticsSplitData = useMemo(() => {
    return [
      { name: 'Pickup', value: periodSummary.pickupCount, color: '#8b5cf6' },
      { name: 'Delivery', value: periodSummary.deliveryCount, color: '#06b6d4' }
    ].filter(item => item.value > 0);
  }, [periodSummary.pickupCount, periodSummary.deliveryCount]);

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

            {/* Today's Operational Pulse */}
            {/* <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-5 space-y-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Today's Operations</h2>
              </div>
              <SummaryCards
                cards={[
                  {
                    title: "Today's Order Value",
                    value: `₦${todayTotals.amount.toLocaleString()}`,
                    icon: <BadgeDollarSign className="h-5 w-5" />,
                    tone: 'neutral',
                  },
                  {
                    title: "Today's Litres Ordered",
                    value: `${todayTotals.litres.toLocaleString()} Litres`,
                    icon: <FuelIcon className="h-5 w-5" />,
                    tone: 'amber',
                  },
                  {
                    title: "Trucks Actioned Today",
                    value: `${todayTotals.releasedOrLoaded.toLocaleString()} Loaded/Paid`,
                    icon: <TruckIcon className="h-5 w-5" />,
                    tone: 'green',
                  },
                ]}
              />
            </div> */}

            {/* Period Summary Cards */}
            <div className="space-y-3">
              {/* <div className="flex items-center gap-2 text-slate-800">
                <Building2 className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Period Audit Metrics ({depotTrendRange === '30d' ? '30 Days' : depotTrendRange === 'month' ? 'This Month' : '90 Days'})</h2>
              </div> */}
              <SummaryCards
                gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                cards={[
                  {
                    title: "Today's Revenue",
                    value: abbreviateCurrency(todayTotals.amount),
                    icon: <BadgeDollarSign className="h-5 w-5" />,
                    tone: 'neutral',
                  },
                  {
                    title: "Today's Litres Ordered",
                    value: `${abbreviateNumber(todayTotals.litres)} L`,
                    icon: <FuelIcon className="h-5 w-5" />,
                    tone: 'amber',
                  },
                  {
                    title: "Total Revenue",
                    value: abbreviateCurrency(periodSummary.revenue || 0),
                    icon: <BadgeDollarSign className="h-5 w-5" />,
                    tone: 'green',
                  },
                  {
                    title: "Top Depot Revenue",
                    value: abbreviateCurrency(topRevenueDepot.revenue || 0),
                    description: topRevenueDepot.depot,
                    icon: <TrendingUp className="h-5 w-5" />,
                    tone: 'green',
                  },
                  {
                    title: "Top Depot Volume",
                    value: `${abbreviateNumber(topVolumeDepot.volume || 0)} L`,
                    description: topVolumeDepot.depot,
                    icon: <TruckIcon className="h-5 w-5" />,
                    tone: 'amber',
                  },
                  {
                    title: "Depot with Most Orders",
                    value: `${abbreviateNumber(topOrderDepot.ordersCount || 0)} Orders`,
                    description: topOrderDepot.depot,
                    icon: <ShoppingBag className="h-5 w-5" />,
                    tone: 'blue',
                  },
                ]}
              />
            </div>

            {/* Charts: Sales Trend & Revenue Ranking */}
            <div className="grid gap-6 lg:grid-cols-1">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Depot Sales Volume Trend</h3>
                  <p className="text-xs pt-2 text-slate-500">Daily customer order quantity in litres for the depots</p>
                </div>
                <div className="h-72">
                  {isOrdersLoading ? (
                    <div className="flex h-full items-center justify-center text-slate-400">Fetching....</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={depotTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => abbreviateNumber(v)} />
                        <Tooltip formatter={(value: number) => [`${value.toLocaleString()} L`, 'Volume']} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {topDepotNames.map((depot, idx) => {
                          const strokes = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6'];
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
                  <p className="text-xs pt-2 text-slate-500">Total customer order revenue in Naira generated per depot</p>
                </div>
                <div className="h-72">
                  {isOrdersLoading ? (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">Fetching...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={depotRankingData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => abbreviateNumber(v)} />
                        <YAxis dataKey="depot" type="category" width={155} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
                        <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Donut Charts: Order Status & Fulfillment Split */}
            {/* <div className="grid gap-6 md:grid-cols-2">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-800 mb-1">
                    <PieChartIcon className="h-4 w-4 text-emerald-500" />
                    <h3 className="font-semibold">Order Status Distribution</h3>
                  </div>
                  <p className="text-xs text-slate-500">Ratio of order execution states across the selected period.</p>
                </div>
                <div className="h-64 flex items-center justify-center relative">
                  {isOrdersLoading ? (
                    <div className="text-slate-400">Loading statuses...</div>
                  ) : statusDistributionData.length === 0 ? (
                    <div className="text-slate-400 text-sm">No orders recorded in this period.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} Orders`, 'Volume']} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-800 mb-1">
                    <PieChartIcon className="h-4 w-4 text-violet-500" />
                    <h3 className="font-semibold">Logistics Fulfillment Split</h3>
                  </div>
                  <p className="text-xs text-slate-500">Split between customer self-pickup and custom logistics delivery orders.</p>
                </div>
                <div className="h-64 flex items-center justify-center relative">
                  {isOrdersLoading ? (
                    <div className="text-slate-400">Loading logistics...</div>
                  ) : logisticsSplitData.length === 0 ? (
                    <div className="text-slate-400 text-sm">No orders recorded in this period.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={logisticsSplitData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {logisticsSplitData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} Orders`, 'Volume']} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div> */}

            {/* Audit Table: Detailed Depot Metrics Snapshot */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <h3 className="font-semibold">Depot Snapshot</h3>
                </div>
                <p className="text-xs text-slate-500">Overview metrics per depot, sorted by total order revenue.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-medium">
                      <th className="p-4 pl-6">Depot</th>
                      <th className="p-4 text-center">Orders</th>
                      <th className="p-4 text-right">Volume</th>
                      <th className="p-4 text-right">Total Revenue</th>
                      {/* <th className="p-4 text-right">Avg Order Size</th> */}
                      {/* <th className="p-4 text-center">Pickup / Delivery</th> */}
                      {/* <th className="p-4 pr-6">Status Breakdown (Count)</th> */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {isOrdersLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">Loading audit ledger data...</td>
                      </tr>
                    ) : depotMetrics.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">No depot records found.</td>
                      </tr>
                    ) : (
                      depotMetrics.map((row) => {
                        const totalOps = row.pickupCount + row.deliveryCount;
                        const pickupPct = totalOps > 0 ? Math.round((row.pickupCount / totalOps) * 100) : 0;
                        const deliveryPct = totalOps > 0 ? Math.round((row.deliveryCount / totalOps) * 100) : 0;

                        return (
                          <tr key={row.depot} className="hover:bg-slate-50/40 transition-colors">
                            <td className="p-4 pl-6 font-semibold text-slate-800">{row.depot}</td>
                            <td className="p-4 text-center font-medium">{row.ordersCount}</td>
                            <td className="p-4 text-right font-medium">{row.volume.toLocaleString()} Litres</td>
                            <td className="p-4 text-right text-emerald-600 font-semibold">₦{row.revenue.toLocaleString()}</td>
                            {/* <td className="p-4 text-right text-slate-500">{row.averageSize.toLocaleString()} L</td> */}
                            {/* <td className="p-4">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="text-xs font-semibold text-slate-600">
                                  {row.pickupCount}P / {row.deliveryCount}D
                                </div>
                                <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
                                  <div className="bg-violet-400 h-full" style={{ width: `${pickupPct}%` }} title={`Pickup: ${pickupPct}%`} />
                                  <div className="bg-cyan-400 h-full" style={{ width: `${deliveryPct}%` }} title={`Delivery: ${deliveryPct}%`} />
                                </div>
                              </div>
                            </td> */}
                            {/* <td className="p-4 pr-6">
                              <div className="flex flex-wrap gap-1.5">
                                {row.statusCounts.pending > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                    Pend: {row.statusCounts.pending}
                                  </span>
                                )}
                                {row.statusCounts.paid > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    Paid: {row.statusCounts.paid}
                                  </span>
                                )}
                                {row.statusCounts.released > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                    Rel: {row.statusCounts.released}
                                  </span>
                                )}
                                {row.statusCounts.loaded > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    Load: {row.statusCounts.loaded}
                                  </span>
                                )}
                                {row.statusCounts.sold > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                    Sold: {row.statusCounts.sold}
                                  </span>
                                )}
                                {row.statusCounts.canceled > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                    Can: {row.statusCounts.canceled}
                                  </span>
                                )}
                              </div>
                            </td> */}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
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
