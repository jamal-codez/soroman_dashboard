import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Download,
  Filter,
  Search,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
  };
  total_price: string;
  status: 'pending' | 'paid' | 'canceled';
  created_at: string;
  products: Array<{ name: string }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string;
  state: string;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'week' | 'month' | 'year' | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const pageSize = 100; 
  
  const {
    data: apiResponse,
    isLoading,
    isError,
    refetch
  } = useQuery<OrderResponse>({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders({ page: 1, page_size: pageSize });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
    },
    refetchOnWindowFocus: false
  });

  
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(),
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
    }
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value.toLowerCase());
  };

  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = () => {
    if (selectedOrderId) cancelOrderMutation.mutate(selectedOrderId);
  };

 
  const filteredOrders = (apiResponse?.results || [])
    .filter(order => {
      const query = searchQuery.toLowerCase();
      return (
        order.id.toString().includes(query) ||
        `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(query) ||
        order.products.some(p => p.name.toLowerCase().includes(query))
      );
    })
    .filter(order => {
      const date = new Date(order.created_at);
      if (!filterType) return true;
      return (
        (filterType === 'week' && isThisWeek(date)) ||
        (filterType === 'month' && isThisMonth(date)) ||
        (filterType === 'year' && isThisYear(date))
      );
    });

 
  const exportToCSV = () => {
    if (!filteredOrders.length) return;

    const headers = [
      'Date',
      'Order ID',
      'Customer',
      'Product(s)',
      'Contact',
      'Quantity (Litres)',
      'Amount Paid (₦)',
      'Status',
      'State'
    ];

    const rows = filteredOrders.map(order => [
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      `#${order.id}`,
      `${order.user.first_name} ${order.user.last_name}`,
      order.products.map(p => p.name).join(', '),
      `${order.user.phone_number} / ${order.user.email}`,
      order.quantity.toLocaleString(),
      parseFloat(order.total_price).toLocaleString(),
      order.status.charAt(0).toUpperCase() + order.status.slice(1),
      order.state
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders_export_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">All Orders</h1>
              <Button variant="outline" onClick={exportToCSV}>
                <Download size={16} className="mr-2" /> Export
              </Button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pl-10"
                    placeholder="Search orders..."
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
                <select
                  className="border border-gray-300 rounded px-3 py-2"
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="">All Time</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product(s)</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Quantity (L)</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>{format(new Date(order.created_at), 'dd-MM-yyyy')}</TableCell>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                      <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                      <TableCell>{order.user.phone_number} / {order.user.email}</TableCell>
                      <TableCell>{order.quantity.toLocaleString()}</TableCell>
                      <TableCell>₦{parseFloat(order.total_price).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-sm border rounded inline-flex items-center ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)} <span className="ml-1">{order.status}</span>
                        </span>
                      </TableCell>
                      <TableCell>{order.state}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={order.status === 'canceled'}
                          onClick={() => handleCancelOrderClick(order.id)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to cancel this order?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelModal(false)}>No, go back</Button>
            <Button variant="destructive" onClick={confirmCancelOrder}>Yes, cancel it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
