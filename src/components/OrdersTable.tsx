import { useQuery } from '@tanstack/react-query';
import { 
  CheckCircle, 
  Clock, 
  Truck, 
  AlertCircle, 
  MoreHorizontal, 
  Download
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  products: Array<{
    name: string;
    abbreviation: string;
  }>;
  quantity: number;
  created_at: string;
  total_price: string;
  status: 'pending' | 'completed' | 'shipping' | 'cancelled';
  release_type: 'delivery' | 'pickup';
}

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'shipping': return <Truck className="text-orange-500" size={16} />;
    case 'cancelled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const getStatusClass = (status: Order['status']) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'shipping': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusDisplayMap = {
  pending: 'pending',
  paid: 'paid',
  shipping: 'Shipping',
  cancelled: 'Cancelled',
};

export const OrdersTable = () => {
  const { data: orders, isLoading, isError } = useQuery<Order[]>({
    queryKey: ['recent-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getRecentOrders();
      return response.results.slice(0, 5); // Show last 5 orders
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-red-500">
        Failed to load recent orders
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-slate-200">
        <h3 className="font-semibold text-lg text-slate-800">Recent Orders</h3>
        <button className="text-[#169061] hover:text-[#169061]/80 transition-colors flex items-center text-sm font-medium">
          <Download size={16} className="mr-1" /> Export
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left text-xs font-semibold text-slate-500 p-4">ORDER ID</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">CUSTOMER</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">PRODUCT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">QUANTITY</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">DATE</th>
              <th className="text-right text-xs font-semibold text-slate-500 p-4">AMOUNT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">STATUS</th>
              <th className="text-center text-xs font-semibold text-slate-500 p-4">Delivery Method</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => (
              <tr key={order.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-4 text-sm font-medium text-slate-900">#{order.id}</td>
                <td className="p-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {order.user.first_name} {order.user.last_name}
                    </div>
                    <div className="text-xs text-slate-500">{order.user.email}</div>
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-700">
                  {order.products.map(p => p.abbreviation).join(', ')}
                </td>
                <td className="p-4 text-sm text-slate-700">{order.quantity.toLocaleString()} L</td>
                <td className="p-4 text-sm text-slate-700">
                  {new Date(order.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </td>
                <td className="p-4 text-sm font-medium text-slate-900 text-right">
                  ₦{parseFloat(order.total_price).toLocaleString()}
                </td>
                <td className="p-4">
                  <div className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                    {getStatusIcon(order.status)}
                    <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.release_type)}`}>
                    {order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <Button variant="outline" className="bg-blue-500 text-white" onClick={() => handleEdit(order.id)}>Edit</Button>
                    <Button variant="outline" className="bg-green-500 text-white" onClick={() => handleAssignTruck(order.id)}>Assign Truck</Button>
                    <Button variant="outline" className="bg-red-500 text-white" onClick={() => handleCancelOrder(order.id)}>Cancel Order</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="p-4 border-t border-slate-200 text-center">
        <Link to="/orders" className="text-[#169061] hover:text-[#169061]/80 transition-colors text-sm font-medium">
          View All Orders
        </Link>
      </div>
    </div>
  );
};