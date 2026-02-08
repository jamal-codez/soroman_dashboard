import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { apiClient } from '@/api/client';
import { format, isToday, parseISO } from 'date-fns';
import {
  ShoppingCart,
  TrendingUp,
  CreditCard,
  CheckCircle,
  BarChart3,
  Activity,
  BadgeDollarSign,
  TruckIcon,
  FuelIcon,
} from 'lucide-react';

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
const formatMillion = (num?: number): string => {
  const value = Number(num || 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  return value.toLocaleString();
};

const safePercent = (n?: number) =>
  Number.isFinite(n) ? `${n!.toFixed(0)}%` : undefined;

const currency = (n?: number) =>
  `₦${Number(n || 0).toLocaleString()}`;

const getProdName = (p: unknown) => {
  const rec = (p ?? null) as Record<string, unknown> | null;
  return (
    (typeof rec?.name === 'string' && rec.name) ||
    (typeof rec?.product_name === 'string' && rec.product_name) ||
    (typeof rec?.product === 'string' && rec.product) ||
    (typeof rec?.type === 'string' && rec.type) ||
    'Unknown'
  );
};

const safeParseNumber = (v: unknown) => {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const str = String(v).trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

// ---------- Dashboard ----------
const Dashboard: React.FC = () => {
  // Analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics()
  });

  const { data: allOrdersResp } = useQuery<{ count: number; results: OrderLite[] }>({
    queryKey: ['all-orders', 'counts'],
    queryFn: async () => {
      const res = await apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 });
      return { count: res.count || 0, results: (res.results || []) as OrderLite[] };
    },
    refetchOnWindowFocus: true,
  });

  const { data: pfisResp } = useQuery<{ results?: PfiLite[] } & Record<string, unknown>>({
    queryKey: ['pfis', 'active'],
    queryFn: async () => apiClient.admin.getPfis({ status: 'active', page: 1, page_size: 500 }),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: customerData } = useQuery<CustomerResponse>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers()
  });

  const ordersAll = allOrdersResp?.results || [];

  const norm = (s: unknown) => String(s || '').toLowerCase();

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
      return st === 'paid' || st === 'released';
    });
    return {
      orders: todayOrders.length,
      releasedOrLoaded: releasedOrLoaded.length,
      litres,
      amount,
    };
  }, [todayOrders]);

  const activePfis = useMemo(() => {
    const list = ((pfisResp as any)?.results ?? []) as PfiLite[];
    return (Array.isArray(list) ? list : []).filter((p) => String(p.status || 'active').toLowerCase() === 'active');
  }, [pfisResp]);

  const pfiTodayCards = useMemo(() => {
    const byPfiId: Record<number, { litres: number; amount: number; orders: number }> = {};

    for (const o of todayOrders) {
      const id = Number(o.pfi_id ?? 0);
      if (!id) continue;
      if (!byPfiId[id]) byPfiId[id] = { litres: 0, amount: 0, orders: 0 };
      byPfiId[id].litres += safeParseNumber(o.quantity);
      byPfiId[id].amount += safeParseNumber(o.total_price);
      byPfiId[id].orders += 1;
    }

    return activePfis.map((p) => {
      const agg = byPfiId[p.id] || { litres: 0, amount: 0, orders: 0 };
      return {
        id: p.id,
        pfi_number: p.pfi_number,
        litres: agg.litres,
        amount: agg.amount,
        orders: agg.orders,
      };
    });
  }, [activePfis, todayOrders]);

  const locationTodayCards = useMemo(() => {
    const byLoc: Record<
      string,
      { orders: number; releasedLitres: number; amount: number }
    > = {};

    for (const o of todayOrders) {
      const loc = String(o.state || '').trim();
      if (!loc) continue;
      if (!byLoc[loc]) byLoc[loc] = { orders: 0, releasedLitres: 0, amount: 0 };

      byLoc[loc].orders += 1;
      byLoc[loc].amount += safeParseNumber(o.total_price);

      const st = norm(o.status);
      if (st === 'paid' || st === 'released') {
        byLoc[loc].releasedLitres += safeParseNumber(o.quantity);
      }
    }

    return Object.entries(byLoc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([location, agg]) => ({
        title: location,
        value: `${agg.orders.toLocaleString()} orders`,
        description: `Released: ${agg.releasedLitres.toLocaleString()} L • Amount: ₦${agg.amount.toLocaleString()}`,
        icon: <Activity className="h-5 w-5" />,
        tone: 'neutral' as const,
      }));
  }, [todayOrders]);

  // Derived metrics (existing)
  const totalOrders = Number(allOrdersResp?.count || 0);
  const salesRevenue = Number(analytics?.sales_revenue || 0);
  const customersCount = Number(customerData?.count || 0);
  const unpaidOrders = Number((ordersAll || []).filter((o) => norm(o.status) === 'canceled').length);

  const topProducts = useMemo(() => {
    const list = (analytics?.quantity_sold || [])
      .filter((p) => typeof p?.current_quantity === 'number')
      .sort((a, b) => (b.current_quantity || 0) - (a.current_quantity || 0))
      .slice(0, 5);
    return list;
  }, [analytics?.quantity_sold]);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader title="Dashboard Overview" />

            <SummaryCards
              cards={[
                // {
                //   title: 'Total Orders',
                //   value: totalOrders.toLocaleString(),
                //   // description: analyticsLoading ? 'Loading…' : (safePercent(analytics?.orders_change) ? 'All time' : 'No change data'),
                //   icon: <ShoppingCart className="h-5 w-5" />,
                //   tone: 'neutral',
                // },
                // {
                //   title: 'Total Revenue',
                //   value: currency(salesRevenue),
                //   description: analyticsLoading ? 'Loading…' : (safePercent(analytics?.sales_revenue_change) ? `Change: ${safePercent(analytics?.sales_revenue_change)}` : 'All time'),
                //   icon: <TrendingUp className="h-5 w-5" />,
                //   tone: 'green',
                // },
                {
                  title: "Today's Revenue",
                  value: `₦${todayTotals.amount.toLocaleString()}`,
                  // description: `₦${todayTotals.amount.toLocaleString()}`,
                  icon: <BadgeDollarSign className="h-5 w-5" />,
                  tone: 'neutral',
                },
                {
                  title: "Quantity Sold Today",
                  value: `${todayTotals.litres.toLocaleString()} Litres`,
                  // description: `${todayTotals.litres.toLocaleString()} Litres`,
                  icon: <FuelIcon className="h-5 w-5" />,
                  tone: 'amber',
                },
                {
                  title: "Trucks Loaded Today",
                  value: todayTotals.releasedOrLoaded.toLocaleString(),
                  // description: 'paid + released statuses',
                  icon: <TruckIcon className="h-5 w-5" />,
                  tone: 'green',
                },
                // {
                //   title: 'Unpaid Orders',
                //   value: unpaidOrders.toLocaleString(),
                //   description: 'Awaiting payment',
                //   icon: <CreditCard className="h-5 w-5" />,
                //   tone: 'amber',
                // },
                
              ]}
            />

            {/* Active PFIs: today's sales per PFI */}
            {/* <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800">Active PFIs — Today's Sales</h2>
                <span className="text-xs text-slate-500">
                  {pfiTodayCards.length ? `${pfiTodayCards.length} active` : 'No active PFIs'}
                </span>
              </div>
              <div className="p-4">
                {pfiTodayCards.length === 0 ? (
                  <p className="text-sm text-slate-500">No active PFIs found.</p>
                ) : (
                  <SummaryCards
                    cards={pfiTodayCards.map((p) => ({
                      title: p.pfi_number,
                      value: `${p.litres.toLocaleString()} L`,
                      description: `₦${p.amount.toLocaleString()} • ${p.orders.toLocaleString()} order(s)`,
                      icon: <BarChart3 className="h-5 w-5" />,
                      tone: p.litres > 0 ? 'green' : 'neutral',
                    }))}
                  />
                )}
              </div>
            </div> */}

            {/* Today's summary by location */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800">Today's Sales by Location</h2>
                {/* <span className="text-xs text-slate-500">
                  {locationTodayCards.length ? `${locationTodayCards.length} location(s)` : 'No sales today'}
                </span> */}
              </div>
              <div className="p-4">
                {locationTodayCards.length === 0 ? (
                  <p className="text-sm text-slate-500">No orders recorded today.</p>
                ) : (
                  <SummaryCards cards={locationTodayCards} />
                )}
              </div>
            </div>

            {/* Top Products (by volume) */}
            {/* <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800">Top Products by Volume</h2>
                <span className="text-xs text-slate-500">{topProducts.length ? `Top ${topProducts.length}` : 'No data'}</span>
              </div>
              <div className="p-4">
                {topProducts.length === 0 ? (
                  <p className="text-sm text-slate-500">No product performance data available.</p>
                ) : (
                  <ul className="space-y-3">
                    {topProducts.map((p, idx) => (
                      <li key={`${getProdName(p)}-${idx}`} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{getProdName(p)}</p>
                          {Number.isFinite(p.change) ? (
                            <p className={`text-xs ${Number(p.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {Number(p.change) >= 0 ? '+' : ''}{Number(p.change || 0).toFixed(1)}%
                            </p>
                          ) : null}
                        </div>
                        <div className="ml-4 text-sm font-semibold text-slate-800">
                          {(p.current_quantity || 0).toLocaleString()} L
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div> */}

            <div className="h-10" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
