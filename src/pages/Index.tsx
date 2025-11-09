import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { apiClient } from '@/api/client';
import {
  ShoppingCart,
  TrendingUp,
  Users,
  CreditCard,
  BarChart2,   // changed from BarChart3
  Activity
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

const getProdName = (p: any) =>
  p?.name || p?.product_name || p?.product || p?.type || 'Unknown';

// ---------- Simple Stat Card (icon on top, responsive) ----------
interface SimpleStatProps {
  title: string;
  value: string;
  change?: string;
  icon: React.ElementType;
  iconColor?: string;
  isLoading?: boolean;
}
const SimpleStatCard: React.FC<SimpleStatProps> = ({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-slate-600',
  isLoading
}) => {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col items-center text-center shadow-sm">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 bg-slate-100">
        <Icon size={20} className={iconColor} />
      </div>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{title}</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-800 leading-tight">
        {isLoading ? '...' : value}
      </h3>
      {change && !isLoading && (
        <p className="mt-1 text-xs font-medium text-green-600">{change}</p>
      )}
    </div>
  );
};

// ---------- Small Info Tile ----------
const InfoTile: React.FC<{ title: string; value: string; icon?: React.ElementType; iconColor?: string }> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'text-slate-600'
}) => (
  <div className="rounded-md border border-slate-200 bg-white p-3 flex items-center gap-3">
    {Icon && (
      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
        <Icon size={18} className={iconColor} />
      </div>
    )}
    <div className="min-w-0">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
    </div>
  </div>
);

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

  const avgOrderValue = useMemo(() => {
    if (!totalOrders) return 0;
    return salesRevenue / totalOrders;
  }, [salesRevenue, totalOrders]);

  const revenuePerCustomer = useMemo(() => {
    if (!customersCount) return 0;
    return salesRevenue / customersCount;
  }, [salesRevenue, customersCount]);

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
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Dashboard Overview</h1>
              <p className="text-slate-500 text-sm sm:text-base">
                A quick snapshot of your business performance.
              </p>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <SimpleStatCard
                title="Total Orders"
                value={totalOrders.toLocaleString()}
                change={safePercent(analytics?.orders_change)}
                icon={ShoppingCart}
                iconColor="text-blue-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Sales Revenue"
                value={currency(salesRevenue)}
                change={safePercent(analytics?.sales_revenue_change)}
                icon={TrendingUp}
                iconColor="text-green-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Total Customers"
                value={customersCount.toLocaleString()}
                change={safePercent(analytics?.active_customers_change)}
                icon={Users}
                iconColor="text-purple-600"
                isLoading={analyticsLoading}
              />
              <SimpleStatCard
                title="Unpaid Orders"
                value={unpaidOrders.toLocaleString()}
                icon={CreditCard}
                iconColor="text-amber-600"
                isLoading={analyticsLoading}
              />
            </div>

            {/* Quick Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
              <InfoTile
                title="Average Order Value"
                value={currency(avgOrderValue)}
                icon={BarChart2}   // changed here too
                iconColor="text-blue-600"
              />
              <InfoTile
                title="Revenue per Customer"
                value={currency(revenuePerCustomer)}
                icon={Activity}
                iconColor="text-green-600"
              />
              <InfoTile
                title="Customers in System"
                value={customersCount.toLocaleString()}
                icon={Users}
                iconColor="text-purple-600"
              />
            </div>

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
