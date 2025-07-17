import { useState } from 'react';
import { useQuery, useMutation, useQueryClient  } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  Filter,
  Search,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
  MoreHorizontal,
  Loader2,
  Edit, Check,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { format } from 'date-fns';
import { apiClient } from '@/api/client';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pickup: {
    pickup_date: string;
    pickup_time: string;
    state: string;
  };
  trucks: string[];
  total_price: string;
  status: 'pending' | 'paid' | 'canceled'|'released';
  created_at: string;
  products: Array<{
    name: string;
  }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

const pageSize = 10;

const getStatusClass = (status: string) => {
  switch (status) {
    case 'paid': return 'bg-green-50 text-green-700 border-green-200';
    case 'pending': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
    case 'released': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const statusDisplayMap = {
  pending: 'Pending',
  paid: 'Paid',
  canceled: 'Canceled',
  released: 'Released',
};

const getStatusIcon = (status: Order['status']) => {
  switch (status) {
    case 'paid': return <CheckCircle className="text-green-500" size={16} />;
    case 'pending': return <Clock className="text-orange-500" size={16} />;
    case 'canceled': return <AlertCircle className="text-red-500" size={16} />;
    case 'released': return <Truck className="text-blue-500" size={16} />;
    default: return <Clock className="text-orange-500" size={16} />;
  }
};

export const PickupProcessing = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['all-orders', currentPage],
    queryFn: async () => {
      try {
        const response = await apiClient.admin.getPickupOrders({
          page: currentPage,
          page_size: pageSize
        });
        if (!response.results) throw new Error('Invalid response format');
        return {
          count: response.count || 0,
          results: response.results || []
        };
      } catch (error) {
        throw new Error('Failed to fetch orders');
      }
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const filteredOrders = (apiResponse?.results || []).filter(order => 
    order.id.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.reference.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const handleReleaseOrder = async (orderId: number) => {
    try {
      setIsDialogOpen(false);
      await apiClient.admin.releaseOrder(orderId);
      queryClient.invalidateQueries(['all-orders']);
      toast({ title: "Success!", description: "ORDER RELEASED" });
    } catch (error) {
      alert(`Failed to release order: ${(error as Error).message}`);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Order ID', 'Customer Name', 'Email', 'Pickup Date', 'Pickup Time', 'State', 'Trucks', 'Total Price', 'Status', 'Created At', 'Products', 'Quantity', 'Release Type', 'Reference'
    ];
    const rows = filteredOrders.map(order => [
      order.id,
      `${order.user.first_name} ${order.user.last_name}`,
      order.user.email,
      order.pickup.pickup_date,
      order.pickup.pickup_time,
      order.pickup.state,
      order.trucks.join('; '),
      order.total_price,
      order.status,
      order.created_at,
      order.products.map(p => p.name).join('; '),
      order.quantity,
      order.release_type,
      order.reference,
    ]);

    let csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "pickup_orders.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Error: {(error as Error)?.message || 'Failed to load pickups'}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Release Orders Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center">
            <Filter className="mr-1" size={16} />
            Filter
          </Button>
          <Button variant="outline" className="flex items-center" onClick={exportToCSV}>
            <Download className="mr-1" size={16} />
            Export
          </Button>
        </div>
      </div>

      {/* ... rest of your table and UI ... */}
    </div>
  );
};
