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
import { OrdersTable } from '@/components/OrdersTable';
import { AnalyticsData, Product, Order, Customer } from '@/type';

const Dashboard = () => {
  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.admin.getAnalytics(),
  });

  // Fetch and transform sales overview data
  const { data: salesOverview } = useQuery({
    queryKey: ['sales-overview'],
    queryFn: () => apiClient.admin.getSalesOverview(),
    select: (data) => {
      const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
      return months.map(month => ({
        month: `Month ${month}`,
        ...Object.entries(data).reduce((acc, [product, sales]) => ({
          ...acc,
          [product]: sales[month] || 0
        }), {})
      }));
    }
  });

  // Fetch product inventory
  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => apiClient.admin.getProductInventory(),
  });

  // Fetch all orders
  const { data: orders } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: () => apiClient.admin.getAllAdminOrders(),
  });

  // Fetch customers
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => apiClient.admin.adminGetAllCustomers(),
  });

  // Calculate fuel metrics from analytics
  const fuelMetrics = analytics?.quantity_sold?.reduce((acc, product) => ({
    volume: acc.volume + product.current_quantity,
    change: acc.change + product.change
  }), { volume: 0, change: 0 }) || { volume: 0, change: 0 };

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
                value={`${fuelMetrics.volume.toLocaleString()}L`}
                change={`+${(fuelMetrics.change / (analytics?.quantity_sold?.length || 1)).toFixed(1)}%`}
                changeDirection="up"
                icon={Fuel}
                iconColor="text-orange-500"
                iconBgColor="bg-orange-100"
                isLoading={analyticsLoading}
              />
              <StatCard
                title="Active Customers"
                value={analytics?.active_customers?.toString() || '0'}
                change={`+${analytics?.active_customers_change}%`}
                changeDirection="up"
                icon={Users}
                iconColor="text-purple-500"
                iconBgColor="bg-purple-100"
                isLoading={analyticsLoading}
              />
            </div>
            
            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2">
                <SalesChart 
                  data={salesOverview || []} 
                  products={products?.map(p => p.name) || []}
                />
              </div>
              <div>
                <ProductsOverview 
                  products={products || []} 
                  stockChanges={analytics?.quantity_sold || []}
                />
              </div>
            </div>
            
            {/* Orders Table */}
            <div className="mb-6">
              <OrdersTable 
                orders={orders || []} 
                onRefresh={() => queryClient.invalidateQueries(['orders'])}
              />
            </div>
            
            {/* Quick Actions */}
            <div className="mb-6">
              <QuickActions 
                onNotify={(data) => apiClient.admin.sendNotification(data)}
                onStockUpdate={(productId, data) => apiClient.admin.adminUpdateProduct(productId, data)}
              />
            </div>
            
            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustomerList 
                customers={customers || []} 
                onCustomerSelect={(id) => {/* Implement customer detail view */}}
              />
              <NotificationList 
                onSendNotification={(data) => apiClient.admin.sendNotification(data)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;