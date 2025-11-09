import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import {
  Download,
  Filter,
  Search,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
    companyName?: string; // <-- Use this field for company initials
  };
  pickup: {
    pickup_date: string;
    pickup_time: string;
    state: string;
  };
  trucks: string[];
  total_price: string;
  status: 'pending' | 'paid' | 'canceled' | 'released';
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

// Helper for company 2-letter initials (matches receipt)
const getCompanyInitials = (name: string, max: number = 2): string => {
  const cleaned = String(name ?? "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= max) {
    return words.slice(0, max).map(w => w[0].toUpperCase()).join("");
  }
  if (words.length === 1) {
    return words[0].slice(0, max).toUpperCase();
  }
  return "SO".slice(0, max).toUpperCase();
};

// Receipt-matching reference: initials/yyyyMMdd/order id
const formatReference = (
  companyName: string,
  createdAt: string,
  orderId: number
): string => {
  const initials = getCompanyInitials(companyName || "SOROMAN");
  const refDate = createdAt && !isNaN(Date.parse(createdAt))
    ? format(new Date(createdAt), "yyyyMMdd")
    : "--";
  return `${initials}/${refDate}/${orderId}`;
};

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

  const exportToCSV = (orders: Order[]) => {
    const headers = [
      "Order ID", "Reference", "Customer Name", "Email", "Pickup Date", "Pickup Time", 
      "State", "Trucks", "Total Price", "Status", "Created At", "Products", "Quantity", "Release Type"
    ];

    const rows = orders.map(order => [
      order.id,
      formatReference(order.user.companyName || "SOROMAN", order.created_at, order.id),
      `${order.user.first_name} ${order.user.last_name}`,
      order.user.email,
      order.pickup.pickup_date,
      order.pickup.pickup_time,
      order.pickup.state,
      order.trucks.join(", "),
      order.total_price,
      order.status,
      order.created_at,
      order.products.map(p => p.name).join(", "),
      order.quantity,
      order.release_type
    ]);

    const csvContent =
      [headers, ...rows]
        .map(row => row.map(item => `"${String(item).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'release_orders.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      setIsDialogOpen(false); // Close the dialog immediately
      await apiClient.admin.releaseOrder(orderId);
      queryClient.invalidateQueries(['all-orders']);
      toast({
        title: "Success!",
        description: "ORDER RELEASED",
      });
    } catch (error) {
      alert(`Failed to release order: ${(error as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className='animate-spin' color='green' size={54} />
            </div>
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
              <p>Error: {(error as Error)?.message || 'Failed to load pickups'}</p>
              <Button onClick={() => refetch()} className="mt-4">
                Retry
              </Button>
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
              <h1 className="text-2xl font-bold text-slate-800">Release Orders</h1>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search pickups..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex items-center">
                    <Filter className="mr-1" size={16} />
                    Filter
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={async () => {
                      try {
                        const response = await apiClient.admin.getPickupOrders({
                          page: 1,
                          page_size: 10000
                        });
                        if (response.results && response.results.length > 0) {
                          exportToCSV(response.results);
                        } else {
                          toast({
                            title: "No data to export",
                            description: "There are no orders available for export.",
                          });
                        }
                      } catch (err) {
                        toast({
                          title: "Export Failed",
                          description: "Unable to export data. Please try again.",
                        });
                      }
                    }}
                  >
                    <Download className="mr-1" size={16} />
                    Export
                  </Button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product(s)</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Order Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      {/* Reference generated using companyName && created_at, matches the receipt! */}
                      <TableCell>
                        {formatReference(order.user.companyName || "SOROMAN", order.created_at, order.id)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {order.user.first_name} {order.user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {order.user.companyName || order.companyName || "-"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell> {order.products.map(p => p.name).join(', ')}</TableCell>
                      <TableCell>{order.quantity.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog
                            open={isDialogOpen && selectedOrderId === order.id}
                            onOpenChange={(isOpen) => {
                              if (!isOpen) {
                                setIsDialogOpen(false);
                                setSelectedOrderId(null);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                className="h-8 gap-1"
                                onClick={() => {
                                  setSelectedOrderId(order.id);
                                  setIsDialogOpen(true);
                                }}
                                disabled={order.status !== 'paid'}
                              >
                                <Truck className="h-4 w-4" />
                                <span>Release</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Confirm Release</DialogTitle>
                              </DialogHeader>
                              <p>Are you sure you want to release Order with ID: <strong>{order.id}</strong>?</p>
                              <p>Quantity: <strong>{order.quantity.toLocaleString()}</strong> Litres</p>
                              <p>Fuel Type: <strong>{order.products.map(p => p.name).join(', ')}</strong></p>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  className="bg-[#169061] hover:bg-[#169061]/90"
                                  onClick={() => handleReleaseOrder(order.id)}
                                >
                                  Confirm
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500">
                    {searchQuery.trim() ? 'No pickups found matching your search criteria.' : 'No pickups available.'}
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
                  <div className="text-sm text-slate-600">
                    Showing {(currentPage - 1) * pageSize + 1} -{' '}
                    {Math.min(currentPage * pageSize, apiResponse?.count || 0)} of{' '}
                    {apiResponse?.count || 0} results
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
