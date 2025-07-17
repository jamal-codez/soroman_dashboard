import { useState } from 'react';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  ClipboardList,
  Truck,
  CheckCircle2
} from 'lucide-react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';

const orderData = [
  // Sample order data; you can populate this fully
  {
    id: 1,
    product: 'Automotive Gas Oil (AGO)',
    quantity: 10000,
    destination: 'Kano',
    status: 'Pending',
    scheduledDate: 'Jul 20, 2025'
  },
  {
    id: 2,
    product: 'Premium Motor Spirit (PMS)',
    quantity: 15000,
    destination: 'Abuja',
    status: 'In Transit',
    scheduledDate: 'Jul 22, 2025'
  },
  // ... Add as many orders as you want
];

export default function Orders() {
  const [orders, setOrders] = useState(orderData);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(orders.length / itemsPerPage);

  const paginatedOrders = orders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">Orders Dashboard</h1>
              <Button>
                <ClipboardList className="mr-1" size={16} />
                New Order
              </Button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity (Liters)</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Scheduled Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product}</TableCell>
                      <TableCell>{item.quantity.toLocaleString()}</TableCell>
                      <TableCell>{item.destination}</TableCell>
                      <TableCell>{item.scheduledDate}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === 'Released'
                              ? 'success'
                              : item.status === 'In Transit'
                              ? 'warning'
                              : 'default'
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between p-4 border-t">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => prev - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
