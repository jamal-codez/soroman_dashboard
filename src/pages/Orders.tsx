import React, { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { format, isThisMonth, isThisWeek, isThisYear } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface Product {
  name: string;
}

interface User {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
}

interface Order {
  id: number;
  created_at: string;
  status: string;
  reference: string;
  user: User;
  quantity: number;
  total_price: string;
  release_type: string;
  products: Product[];
}

const statusDisplayMap: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "completed":
      return "bg-green-100 text-green-800 border-green-300";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return "⏳";
    case "completed":
      return "✅";
    case "cancelled":
      return "❌";
    default:
      return "";
  }
};

const OrdersTable = () => {
  const [apiResponse, setApiResponse] = useState<{ results: Order[] }>({ results: [] });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTimeframe, setFilterTimeframe] = useState<'all' | 'week' | 'month' | 'year'>('all');

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`/api/orders`);
      setApiResponse(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  const isInTimeframe = (date: string) => {
    const d = new Date(date);
    switch (filterTimeframe) {
      case 'week': return isThisWeek(d);
      case 'month': return isThisMonth(d);
      case 'year': return isThisYear(d);
      default: return true;
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = (apiResponse?.results || []).filter(order => {
    const searchLower = searchQuery.toLowerCase();
    return (
      isInTimeframe(order.created_at) &&
      (
        order.id.toString().includes(searchLower) ||
        `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchLower) ||
        order.products.some(product => product.name.toLowerCase().includes(searchLower))
      )
    );
  });

  const handleCancelOrderClick = async (orderId: number) => {
    try {
      await axios.post(`/api/orders/${orderId}/cancel/`);
      toast.success("Order cancelled successfully.");
      fetchOrders();
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error("Failed to cancel order.");
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Date', 'Order ID', 'Customer Name', 'Contact (Phone & Email)', 'Quantity (Litres)',
      'Amount (₦)', 'Status', 'Delivery Method', 'Products', 'Reference'
    ];

    const rows = filteredOrders.map(order => [
      format(new Date(order.created_at), 'dd MMM yyyy HH:mm'),
      order.id,
      `${order.user.first_name} ${order.user.last_name}`,
      `${order.user.phone_number} (${order.user.email})`,
      Number(order.quantity).toLocaleString(),
      `₦${parseFloat(order.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      statusDisplayMap[order.status],
      order.release_type === 'delivery' ? 'Delivery' : 'Pickup',
      order.products.map(p => p.name).join(', '),
      order.reference,
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join('\t'))
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search by name, product, or order ID"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border rounded px-4 py-2 w-full md:w-1/3"
        />
        <select
          value={filterTimeframe}
          onChange={(e) => setFilterTimeframe(e.target.value as any)}
          className="border border-slate-300 rounded-md p-2 text-sm"
        >
          <option value="all">All Time</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <Button onClick={exportToCSV}>Export CSV</Button>
      </div>
      <Separator />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Customer's Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Quantity (Litres)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredOrders.map(order => (
            <TableRow key={order.id}>
              <TableCell>{format(new Date(order.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
              <TableCell>{order.id}</TableCell>
              <TableCell>{`${order.user.first_name} ${order.user.last_name}`}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span>{order.user.phone_number}</span>
                  <span className="text-sm text-muted-foreground">{order.user.email}</span>
                </div>
              </TableCell>
              <TableCell>{Number(order.quantity).toLocaleString()} L</TableCell>
              <TableCell>
                <div className={`inline-flex items-center gap-2 text-sm font-medium rounded-full px-4 py-1 border ${getStatusClass(order.status)}`}>
                  {getStatusIcon(order.status)}
                  <span className="whitespace-nowrap">{statusDisplayMap[order.status]}</span>
                </div>
              </TableCell>
              <TableCell>
                {order.status === 'pending' && (
                  <Button size="sm" variant="destructive" onClick={() => handleCancelOrderClick(order.id)}>
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {filteredOrders.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                No orders found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default OrdersTable;
