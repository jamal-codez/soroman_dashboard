import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Edit, Check, Loader2, Download, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const PickupProcessing = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pickups', currentPage],
    queryFn: async () => {
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return {
        count: 1,
        results: [
          {
            id: "ORD-71204",
            reference: "REF-002",
            customerName: "Nigeria Airways",
            depot: "Lagos Terminal",
            fuelType: "Jet Fuel",
            quantity: "8,000 L",
            scheduledPickup: "2025-04-25T10:00:00",
            truckNumber: "TRK-001",
            status: "Ready for Pickup"
          }
        ]
      };
    }
  });

  const totalPages = Math.ceil((apiResponse?.count || 0) / pageSize);

  const handlePreviousPage = () => currentPage > 1 && setCurrentPage(prev => prev - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(prev => prev + 1);

  const filteredOrders = (apiResponse?.results || []).filter(order => 
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.reference.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
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
              <h1 className="text-2xl font-bold text-slate-800">Fuel Pickup Management</h1>
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
                    <TableHead>DEPOT</TableHead>
                    <TableHead>FUEL TYPE</TableHead>
                    <TableHead>QUANTITY</TableHead>
                    <TableHead>SCHEDULED PICKUP</TableHead>
                    <TableHead>TRUCK NUMBER</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell>{order.reference}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.depot}</TableCell>
                      <TableCell>{order.fuelType}</TableCell>
                      <TableCell>{order.quantity}</TableCell>
                      <TableCell>
                        {format(new Date(order.scheduledPickup), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-blue-200 text-blue-800">
                          {order.truckNumber}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          order.status === 'Ready for Pickup' ? 'bg-green-100 text-green-800' :
                          order.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {/* Your existing dialog buttons kept exactly the same */}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              {/* ... your existing dialog content ... */}
                            </DialogContent>
                          </Dialog>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" className="h-8 gap-1">
                                <Truck className="h-4 w-4" />
                                <span>Release</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              {/* ... your existing dialog content ... */}
                            </DialogContent>
                          </Dialog>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
                                <Check className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              {/* ... your existing dialog content ... */}
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