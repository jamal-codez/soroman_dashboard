import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { apiClient } from '@/api/client';
import {
  ShoppingCart,
  TrendingUp,
  Users,
  CreditCard,
  BarChart3,
  Activity,
  CheckCircle,
  XCircle
} from 'lucide-react';

// ---------- Types ----------
interface AnalyticsData {
  orders?: number;
  orders_change?: number;
  sales_revenue?: number;
  sales_revenue_change?: number;
  active_customers_change?: number;
  unpaid_orders?: number;
  // Best-effort product performance structure (optional, may vary)
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

// ---------- Dashboard ----------
const Dashboard: React.FC = () => {
  // Analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics()
  });

  // Customers
  const { data: customerData } = useQuery<CustomerResponse>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers()
  });

  // Derived metrics
  const totalOrders = Number(analytics?.orders || 0);
  const salesRevenue = Number(analytics?.sales_revenue || 0);
  const customersCount = Number(customerData?.count || 0);
  const unpaidOrders = Number(analytics?.unpaid_orders || 0);

  const topProducts = useMemo(() => {
    const list = (analytics?.quantity_sold || [])
      .filter((p) => typeof p?.current_quantity === 'number')
      .sort((a, b) => (b.current_quantity || 0) - (a.current_quantity || 0))
      .slice(0, 5);
    return list;
  }, [analytics?.quantity_sold]);

  const completedOrReleased = useMemo(() => {
    // Not all APIs provide this in analytics; best-effort fallback to 0.
    // If/when backend adds it, wire it into AnalyticsData.
    return 0;
  }, []);

  const canceledOrders = useMemo(() => {
    // Not all APIs provide this in analytics; best-effort fallback to 0.
    return 0;
  }, []);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Dashboard Overview"
              // description="A quick snapshot of your business performance."
            />

            <SummaryCards
              cards={[
                {
                  title: 'Total Orders',
                  value: totalOrders.toLocaleString(),
                  description: analyticsLoading ? 'Loading…' : (safePercent(analytics?.orders_change) ? `Change: ${safePercent(analytics?.orders_change)}` : 'All time'),
                  icon: <ShoppingCart className="h-5 w-5" />,
                  tone: 'neutral'
                },
                {
                  title: 'Sales Revenue',
                  value: currency(salesRevenue),
                  description: analyticsLoading ? 'Loading…' : (safePercent(analytics?.sales_revenue_change) ? `Change: ${safePercent(analytics?.sales_revenue_change)}` : 'All time'),
                  icon: <TrendingUp className="h-5 w-5" />,
                  tone: 'green'
                },
                {
                  title: 'Unpaid Orders',
                  value: unpaidOrders.toLocaleString(),
                  description: 'Awaiting payment',
                  icon: <CreditCard className="h-5 w-5" />,
                  tone: 'amber'
                },
                {
                  title: 'Released/Completed',
                  value: completedOrReleased.toLocaleString(),
                  description: 'Fulfilled orders',
                  icon: <CheckCircle className="h-5 w-5" />,
                  tone: 'neutral'
                },
                {
                  title: 'Canceled Orders',
                  value: canceledOrders.toLocaleString(),
                  description: 'Auto + manual',
                  icon: <XCircle className="h-5 w-5" />,
                  tone: 'red'
                },
                {
                  title: 'Total Customers',
                  value: customersCount.toLocaleString(),
                  description: 'In system',
                  icon: <Users className="h-5 w-5" />,
                  tone: 'neutral'
                }
              ]}
            />

            {/* Top Products (by volume) */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                  Top Products by Volume
                </h2>
                <span className="text-xs text-slate-500">
                  {topProducts.length ? `Top ${topProducts.length}` : 'No data'}
                </span>
              </div>
              <div className="p-4">
                {topProducts.length === 0 ? (
                  <p className="text-sm text-slate-500">No product performance data available.</p>
                ) : (
                  <ul className="space-y-3">
                    {topProducts.map((p, idx) => (
                      <li key={`${getProdName(p)}-${idx}`} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {getProdName(p)}
                          </p>
                          {Number.isFinite(p.change) && (
                            <p className={`text-xs ${Number(p.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {Number(p.change) >= 0 ? '+' : ''}{(p.change || 0).toFixed(1)}%
                            </p>
                          )}
                        </div>
                        <div className="ml-4 text-sm font-semibold text-slate-800">
                          {(p.current_quantity || 0).toLocaleString()} L
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="h-10" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
