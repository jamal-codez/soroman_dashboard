import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Download, Filter, Search } from 'lucide-react';
import { apiClient } from '@/api/client';
import { format } from 'date-fns';

const statusDisplayMap = {
  completed: 'Completed',
  pending: 'Pending',
  failed: 'Failed',
};

export const OrdersPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: apiResponse, isLoading, isError } = useQuery({
    queryKey: ['all-orders', searchQuery, filterType, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        ...(searchQuery && { search: searchQuery }),
        ...(filterType && { period: filterType }),
      });
      const response = await apiClient.admin.getAllAdminOrders(params.toString());
      return {
        count: response.count || 0,
        results: response.results || [],
        next: response.next,
        previous: response.previous,
      };
    },
    keepPreviousData: true,
  });

  const exportToCSV = async () => {
    const params = new URLSearchParams({
      ...(searchQuery && { search: searchQuery }),
      ...(filterType && { period: filterType }),
      all: 'true',
    });

    const response = await apiClient.admin.getAllAdminOrders(params.toString());
    const orders = response.results || [];

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

    const rows = orders.map((order: any) => [
      format(new Date(order.created_at), 'dd-MM-yyyy'),
      `#${order.id}`,
      `${order.user.first_name} ${order.user.last_name}`,
      order.products.map((p: any) => p.name).join(', '),
      `${order.user.phone_number} / ${order.user.email}`,
      order.quantity.toLocaleString(),
      parseFloat(order.total_price).toLocaleString(),
      statusDisplayMap[order.status],
      order.state,
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `orders_export_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-center gap-4">
        <Input
          placeholder="Search orders..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full md:w-1/3"
        />
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setCurrentPage(1);
          }}
          className="border px-4 py-2 rounded"
        >
          <option value="">All Time</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <Button onClick={exportToCSV} className="ml-auto">
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Amount Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiResponse?.results.map((order: any) => (
              <TableRow key={order.id}>
                <TableCell>{format(new Date(order.created_at), 'dd-MM-yyyy')}</TableCell>
                <TableCell>#{order.id}</TableCell>
                <TableCell>{order.user.first_name} {order.user.last_name}</TableCell>
                <TableCell>{order.products.map((p: any) => p.name).join(', ')}</TableCell>
                <TableCell>{order.user.phone_number} / {order.user.email}</TableCell>
                <TableCell>{order.quantity.toLocaleString()}</TableCell>
                <TableCell>₦{parseFloat(order.total_price).toLocaleString()}</TableCell>
                <TableCell>{statusDisplayMap[order.status]}</TableCell>
                <TableCell>{order.state}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center pt-4">
        <Button
          variant="outline"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={!apiResponse?.previous}
        >
          Previous
        </Button>
        <span>Page {currentPage}</span>
        <Button
          variant="outline"
          onClick={() => setCurrentPage((prev) => prev + 1)}
          disabled={!apiResponse?.next}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
