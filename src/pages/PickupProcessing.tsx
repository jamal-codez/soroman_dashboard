import { useState } from 'react';
import { useQuery, useMutation, useQueryClient  } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// import { Truck, Edit, Check, Loader2, Download, Filter, Search } from "lucide-react";
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
    pickup_date: string;  // Date in string format (e.g., "2025-04-30")
    pickup_time: string;  // Time in string format (e.g., "14:00:00")
    state: string;        // State name (e.g., "Kaduna")
  };
  trucks: string[];      // Array of truck numbers (e.g., ["Truck A123", "Truck B456"])
  total_price: string;   // Total price as a string (e.g., "100.00")
  status: 'pending' | 'paid' | 'canceled'|'released';  // Order status
  created_at: string;    // Date-time string (e.g., "2025-04-28T12:34:56Z")
  products: Array<{
    name: string;        // Product name (e.g., "Product A")
  }>;
  quantity: number;      // Total quantity of items
  release_type: 'pickup' | 'delivery';  // Type of release
  reference: string;     // Reference code (e.g., "ABC123XYZ")
}

interface OrderResponse {
  count: number;
  results: Order[];
}
interface PickupOrder {
  id: string;
  reference: string;
  customerName: string;
  depot: string;
  fuelType: string;
  quantity: string;
  scheduledPickup: string;
  truckNumber: string;
  status: 'Ready for Pickup' | 'In Progress' | 'Completed';
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
          console.log(response)
          
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

  // const { data: apiResponse, isLoading, isError, error, refetch } = useQuery({
  //   queryKey: ['pickups', currentPage],
  //   queryFn: async () => {
  //     // Simulated API call
  //     await new Promise(resolve => setTimeout(resolve, 1000));
  //     return {
  //       count: 1,
  //       results: [
  //         {
  //           id: "ORD-71204",
  //           reference: "REF-002",
  //           customerName: "Nigeria Airways",
  //           depot: "Lagos Terminal",
  //           fuelType: "Jet Fuel",
  //           quantity: "8,000 L",
  //           scheduledPickup: "2025-04-25T10:00:00",
  //           truckNumber: "TRK-001",
  //           status: "Ready for Pickup"
  //         }
  //       ]
  //     };
  //   }
  // });

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
      // alert(`Order ${orderId} released successfully.`);
      // refetch(); // Refetch the orders to update the list
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
              <h1 className="text-2xl font-bold text-slate-800">Release Orders Dashboard</h1>
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
                  <Button variant="outline" className="flex items-center">
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
                    <TableHead>ORDER ID</TableHead>
                    <TableHead>REFERENCE</TableHead>
                    <TableHead>CUSTOMER</TableHead>
                    {/* <TableHead>STATE</TableHead> */}
                    <TableHead>FUEL TYPE</TableHead>
                    <TableHead>QUANTITY</TableHead>
                    <TableHead>SCHEDULED PICKUP</TableHead>
                    {/* <TableHead>TRUCK NUMBER</TableHead> */}
                    <TableHead>STATUS</TableHead>
                    <TableHead className="text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell>{order.reference}</TableCell>
                      <TableCell>
                      <div>
                          <div className="font-medium">
                            {order.user.first_name} {order.user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {order.user.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell> {order.products.map(p => p.name).join(', ')}</TableCell>
                      <TableCell>{order.quantity.toLocaleString()}</TableCell>
                      <TableCell>
                        {order.pickup ? order.pickup.pickup_date : '--'}
                      </TableCell>
                      {/* <TableCell>
                       
                        {order.trucks}
                      </TableCell> */}
                      <TableCell>
                         <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getStatusClass(order.status)}`}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1.5">{statusDisplayMap[order.status]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {/* Your existing dialog buttons kept exactly the same */}
                          {/* <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                            </DialogContent>
                          </Dialog> */}

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
                                disabled={order.status !== 'paid'} // Enable button only for 'paid' status
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
                              <p>Scheduled Pickup: <strong>{order.pickup ? order.pickup.pickup_date : '--'}</strong></p>
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

                          {/* <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
                                <Check className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                            </DialogContent>
                          </Dialog> */}
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