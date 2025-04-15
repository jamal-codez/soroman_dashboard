import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { StatCard } from '@/components/StatCard';
import { ProductsOverview } from '@/components/ProductsOverview';
import { SalesChart } from '@/components/SalesChart';
import { CustomerList } from '@/components/CustomerList';
import { NotificationList } from '@/components/NotificationList';
import { QuickActions } from '@/components/QuickActions';
import { 
  ShoppingCart, 
  Fuel, 
  TrendingUp, 
  Users,
  CreditCard
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { AnalyticsData, Customer, Order, Product, SalesData } from '@/type';
import OrdersTable from '@/components/OrdersTable';
const Dashboard = () => {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics(),
  });

  const { data: salesOverview } = useQuery<SalesData[]>({
    queryKey: ['sales-overview'],
    queryFn: () => apiClient.admin.getSalesOverview(),
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.admin.getProductInventory(),
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: () => apiClient.admin.getAllAdminOrders(),
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers(),
  });

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
              <p className="text-slate-500">Welcome back, monitor your business at a glance.</p>
            </div>
            
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <StatCard
                title="Total Orders"
                value={analytics?.orders?.toString() || '0'}
                change={`+${analytics?.orders_change}%`}
                changeDirection="up"
                icon={ShoppingCart}
                iconColor="text-blue-500"
                iconBgColor="bg-blue-100"
                isLoading={analyticsLoading}
              />
              <StatCard
                title="Sales Revenue"
                value={`₦${(analytics?.sales_revenue || 0).toLocaleString()}`}
                change={`+${analytics?.sales_revenue_change}%`}
                changeDirection="up"
                icon={TrendingUp}
                iconColor="text-green-500"
                iconBgColor="bg-green-100"
                isLoading={analyticsLoading}
              />
              <StatCard
                title="Fuel Volume Sold"
                value={`${(analytics?.fuel_volume || 0).toLocaleString()}L`}
                change={`+${analytics?.fuel_volume_change}%`}
                changeDirection="up"
                icon={Fuel}
                iconColor="text-soroman-orange"
                iconBgColor="bg-soroman-orange/10"
                isLoading={analyticsLoading}
              />
              <StatCard
                title="Total Customers"
                value={analytics?.active_customers?.toString() || '0'}
                change={`+${analytics?.active_customers_change}%`}
                changeDirection="up"
                icon={Users}
                iconColor="text-purple-500"
                iconBgColor="bg-purple-100"
                isLoading={analyticsLoading}
              />
            </div>
            
            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <SalesChart data={salesOverview} />
              </div>
              <div>
                <ProductsOverview products={products} />
              </div>
            </div>
            
            {/* Orders Table */}
            <div className="mb-6">
              <OrdersTable orders={orders} />
            </div>
            
            {/* Quick Actions */}
            <div className="mb-6">
              <QuickActions />
            </div>
            
            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustomerList customers={customers} />
              <NotificationList />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;