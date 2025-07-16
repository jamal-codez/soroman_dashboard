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
  AlertCircle,
  Loader2
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { format } from 'date-fns';

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

const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'delivery': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const pageSize = 10;

const Orders = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', currentPage],
    queryFn: async () => {
      const response = await apiClient.admin.getAllAdminOrders({
        page: currentPage,
        page_size: pageSize
      });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);
  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const filteredOrders = (apiResponse?.results || []).filter(order => {
    const searchLower = searchQuery.toLowerCase();
    return (
      order.id.toString().includes(searchLower) ||
      `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchLower) ||
      order.products.some(product => product.name.toLowerCase().includes(searchLower))
    );
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiClient.admin.cancleOrder(orderId),
    onSuccess: () => refetch(),
    onSettled: () => {
      setShowCancelModal(false);
      setSelectedOrderId(null);
    },
  });

  const handleCancelOrderClick = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = () => {
    if (selectedOrderId) {
      cancelOrderMutation.mutate(selectedOrderId);
    }
  };

  const closeModal = () => {
    setShowCancelModal(false);
    setSelectedOrderId(null);
  };

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

    const rows = filteredOrders.map(order => [
      order.id,
      `${order.user.first_name} ${order.user.last_name}`,
      order.user.email,
      order.user.phone_number,
      order.products.map(p => p.name).join(', '),
      order.quantity,
      format(new Date(order.created_at), 'yyyy-MM-dd HH:mm'),
      parseFloat(order.total_price).toFixed(2),
      statusDisplayMap[order.status],
      order.release_type === 'delivery' ? 'Delivery' : 'Pickup',
      order.reference,
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'orders_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <Loader2 className="animate-spin" color="green" size={54} />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center text-red-500">
              <p>Error: {(error as Error)?.message || 'Failed to load orders'}</p>
              <Button onClick={() => refetch()} className="mt-4">Retry</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">Orders Dashboard</h1>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
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

            {/* TABLE STARTS HERE - same as your current implementation */}
            {/* Keep your existing Table here */}
            {/* ... */}

          </div>
        </div>
      </div>
    </div>
  );
};

export default Orders;
