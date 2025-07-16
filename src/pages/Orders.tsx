import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Download,
  Filter,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import { apiClient } from '@/api/client';
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
  TableRow,
} from '@/components/ui/table';

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
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const PAGE_SIZE = 10;

const STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
};

const STATUS_ICONS = {
  paid: <CheckCircle className="text-green-500" size={16} />,
  pending: <Clock className="text-orange-500" size={16} />,
  canceled: <AlertCircle className="text-red-500" size={16} />,
};

const STATUS_CLASSES = {
  paid: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-orange-50 text-orange-700 border-orange-200',
  canceled: 'bg-red-50 text-red-700 border-red-200',
  delivery: 'bg-purple-50 text-purple-700 border-purple-200',
  default: 'bg-blue-50 text-blue-700 border-blue-200',
};

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['orders', currentPage],
    queryFn: async () => {
      const res = await apiClient.admin.getAllAdminOrders({
        page: currentPage,
        page_size: PAGE_SIZE,
      });
      return {
        count: res.count || 0,
        results: res.results || [],
      };
    },
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(),
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
    },
  });

  const filteredOrders = (data?.results || []).filter((order) => {
    const q = searchQuery.toLowerCase();
    return (
      order.id.toString().includes(q) ||
      `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(q) ||
      order.products.some((p) => p.name.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  const exportToCSV = () => {
    const headers = [
      'Order ID',
      'Customer Name',
      'Email',
      'Phone Number',
      'Products',
      'Quantity (L)',
      'Date',
      'Amount (₦)',
      'Status',
      'Delivery Method',
      'Reference',
    ];

    const rows = filteredOrders.map((order) => [
      order.id,
      `${order.user.first_name} ${order.user.last_name}`,
      order.user.email,
      order.user.phone_number,
      order.products.map((p) => p.name).join(', '),
      order.quantity,
      format(new Date(order.created_at), 'yyyy-MM-dd HH:mm'),
      parseFloat(order.total_price).toFixed(2),
      STATUS_LABELS[order.status],
      order.release_type === 'delivery' ? 'Delivery' : 'Pickup',
      order.reference,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'orders.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) =>
    setSearchQuery(e.target.value);

  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = () => {
    if (selectedOrderId) {
      cancelOrderMutation.mutate(selectedOrderId);
    }
  };

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="animate-spin" size={54} color="green" />
        </div>
      </PageLayout>
    );
  }

  if (isError) {
    return (
      <PageLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-red-500">
            <p>Error: {(error as Error)?.message || 'Something went wrong'}</p>
            <Button onClick={refetch} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Orders Dashboard</h1>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input
                type="text"
                placeholder="Search orders..."
                className="pl-10"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex items-center">
                <Filter className="mr-1" size={16} /> Filter
              </Button>
              <Button variant="outline" className="flex items-center" onClick={exportToCSV}>
                <Download className="mr-1" size={16} /> Export
              </Button>
            </div>
          </div>
        </div>

        {/* TABLE START */}
        <div className="overflow-x-auto bg-white rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Quantity (L)</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.id}</TableCell>
                  <TableCell>{`${order.user.first_name} ${order.user.last_name}`}</TableCell>
                  <TableCell>{order.products.map((p) => p.name).join(', ')}</TableCell>
                  <TableCell>{order.quantity}</TableCell>
                  <TableCell>{format(new Date(order.created_at), 'yyyy-MM-dd HH:mm')}</TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium px-2 py-1 rounded border ${STATUS_CLASSES[order.status] || STATUS_CLASSES.default}`}>
                      {STATUS_ICONS[order.status]} {STATUS_LABELS[order.status]}
                    </span>
                  </TableCell>
                  <TableCell>{order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
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
        {/* Pagination (optional) */}
        <div className="mt-6 flex justify-between">
          <Button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
            Previous
          </Button>
          <Button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </PageLayout>
  );
};

// Reusable Layout Component
const PageLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-screen bg-slate-100">
    <SidebarNav />
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  </div>
);

export default Orders;
