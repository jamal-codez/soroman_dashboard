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
  status: 'pending' | 'paid' | 'released' | 'canceled';
  release_type: 'delivery' | 'pickup';
  reference?: string;
  assigned_agent_id?: number | null;
  assigned_agent?: unknown;
}

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'released': return <Truck className="text-blue-600" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const getStatusClass = (status: Order['status']) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusDisplayMap: Record<Order['status'], string> = {
  pending: 'Awaiting Payment',
  paid: 'Paid',
  released: 'Released',
  canceled: 'Unpaid',
};

// Helper to extract unit price from order
const extractUnitPrice = (order: Order): string => {
  const p = order.products?.[0] as Record<string, unknown> | undefined;
  const o = order as unknown as Record<string, unknown>;
  const raw =
    (p && (p.unit_price ?? p.unitPrice ?? p.price)) ||
    (o.unit_price as unknown) ||
    (o.unit_price_per_litre as unknown) ||
    (o.unit_price_per_liter as unknown) ||
    (o.price_per_litre as unknown) ||
    (o.price_per_liter as unknown);
  if (raw === undefined || raw === null || raw === '') return '';
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/*
// All code related to assigned_agent, getAssignedAgentSummary, and any UI for marketers/agents is commented out.
const getAssignedAgentSummary = (order: Order): string => {
  const a = order.assigned_agent as unknown;
  if (!a || typeof a !== 'object') return '';
  const rec = a as Record<string, unknown>;
  const name = (typeof rec.name === 'string' ? rec.name : '') ||
    [rec.first_name, rec.last_name].filter((v): v is string => typeof v === 'string' && v.length > 0).join(' ').trim();
  const phone = (typeof rec.phone === 'string' ? rec.phone : '') || (typeof rec.phone_number === 'string' ? rec.phone_number : '');
  return [name, phone ? `(${phone})` : ''].filter(Boolean).join(' ');
};
*/

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
              <th className="text-left text-xs font-semibold text-slate-500 p-4">REFERENCE</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">CUSTOMER</th>
              {/* <th className="text-left text-xs font-semibold text-slate-500 p-4">AGENT</th> */}
              <th className="text-left text-xs font-semibold text-slate-500 p-4">PRODUCT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">QUANTITY</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">DATE</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">UNIT PRICE</th>
              <th className="text-right text-xs font-semibold text-slate-500 p-4">AMOUNT</th>
              <th className="text-left text-xs font-semibold text-slate-500 p-4">STATUS</th>
              <th className="text-center text-xs font-semibold text-slate-500 p-4">Delivery Method</th>
              <th className="text-center text-xs font-semibold text-slate-500 p-4">Order ID</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => (
              <tr key={order.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-4 text-sm font-medium text-slate-900">{order.reference || `SO/.../${order.id}`}</td>
                <td className="p-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {order.user.first_name} {order.user.last_name}
                    </div>
                    <div className="text-xs text-slate-500">{order.user.email}</div>
                  </div>
                </td>
                {/* <td className="p-4 text-sm text-slate-700">
                  {getAssignedAgentSummary(order) || '-'}
                </td> */}
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
                <td className="p-4 text-sm text-slate-700">₦{extractUnitPrice(order)}</td>
                <td className="p-4 text-sm font-medium text-slate-900 text-right">
                  ₦{Number(String(order.total_price).replace(/[^0-9.-]+/g, '') || 0).toLocaleString()}
                </td>
                <td className="p-4">
                  <div className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                    {getStatusIcon(order.status)}
                    <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="inline-flex items-center px-2 py-1 text-xs font-medium border rounded-full bg-slate-50 text-slate-700 border-slate-200">
                    {order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm font-medium text-slate-900 text-center">#{order.id}</div>
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