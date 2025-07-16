import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { format, isThisMonth, isThisWeek, isThisYear } from "date-fns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
// Assuming a Skeleton component exists for loading states
// import { Skeleton } from "@/components/ui/skeleton";

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
  status: 'pending' | 'completed' | 'cancelled'; // Make status a union type for better type safety
  reference: string;
  user: User;
  quantity: number;
  total_price: string;
  release_type: 'delivery' | 'pickup'; // Make release_type a union type
  products: Product[];
}

// Define Timeframe type explicitly
type Timeframe = 'all' | 'week' | 'month' | 'year';

const statusDisplayMap: Record<Order['status'], string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

const getStatusClass = (status: Order['status']) => {
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

const getStatusIcon = (status: Order['status']) => {
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTimeframe, setFilterTimeframe] = useState<Timeframe>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // For detailed error messages

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null); // Clear previous errors
    try {
      const response = await axios.get<{ results: Order[] }>(`/api/orders`);
      setOrders(response.data.results);
    } catch (err: any) {
      console.error("Error fetching orders:", err);
      // More descriptive error based on API response if available
      setError(err.response?.data?.message || "Failed to load orders. Please try again later.");
      toast.error(error || "Failed to load orders."); // Display general error if specific one not available
    } finally {
      setIsLoading(false);
    }
  }, [error]); // Depend on error for toast message, though usually you wouldn't here

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]); // Ensure fetchOrders is stable by using useCallback

  const isInTimeframe = useCallback((date: string) => {
    const d = new Date(date);
    switch (filterTimeframe) {
      case 'week': return isThisWeek(d);
      case 'month': return isThisMonth(d);
      case 'year': return isThisYear(d);
      default: return true;
    }
  }, [filterTimeframe]);

  const filteredOrders = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return orders.filter(order => {
      return (
        isInTimeframe(order.created_at) &&
        (
          order.id.toString().includes(searchLower) ||
          `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(searchLower) ||
          order.products.some(product => product.name.toLowerCase().includes(searchLower))
        )
      );
    });
  }, [orders, searchQuery, isInTimeframe]);

  const handleCancelOrderClick = async (orderId: number) => {
    try {
      await axios.post(`/api/orders/${orderId}/cancel/`);
      toast.success("Order cancelled successfully! ✨"); // Add a touch of sweetness
      fetchOrders(); // Re-fetch orders to update the table
    } catch (err: any) {
      console.error("Error cancelling order:", err);
      const errorMessage = err.response?.data?.message || "Failed to cancel order. Please try again.";
      toast.error(errorMessage);
    }
  };

  const exportToCSV = useCallback(() => {
    if (!filteredOrders.length) {
        toast.info("No data to export!");
        return;
    }
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
    toast.success("Orders exported successfully! 🚀");
  }, [filteredOrders]);


  return (
    <div className="space-y-4 p-4"> {/* Added some padding for better aesthetics */}
      <h2 className="text-2xl font-bold text-gray-800">Order Dashboard 📊</h2> {/* Sweet and professional title */}
      <p className="text-gray-600">
        Manage and track all customer orders efficiently. Use the search and filter options to quickly find what you need.
      </p>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Search by name, product, or order ID..." {/* Ellipsis for a softer look */}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border rounded-md px-4 py-2 w-full md:w-1/3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200" // Added focus styles
        />
        <select
          value={filterTimeframe}
          onChange={(e) => setFilterTimeframe(e.target.value as Timeframe)} {/* Type-safe casting */}
          className="border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
        >
          <option value="all">All Time</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <Button onClick={exportToCSV} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-md transition duration-300">
          Export to CSV 📄
        </Button>
      </div>
      <Separator />

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
            {/* Replace with actual Skeleton component if available */}
            <p className="text-lg text-gray-500 animate-pulse">Loading orders... 🔄</p>
            {/* Example Skeleton structure: */}
            {/* <div className="space-y-3">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[220px]" />
            </div> */}
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="font-semibold text-lg">Oops! Something went wrong.</p>
            <p>{error}</p>
            <Button onClick={fetchOrders} className="mt-4 bg-red-500 hover:bg-red-600 text-white">Retry Loading</Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer's Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Quantity (Litres)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map(order => (
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
                  <TableCell>{order.release_type === 'delivery' ? 'Delivery' : 'Pickup'}</TableCell>
                  <TableCell>{`₦${parseFloat(order.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</TableCell>
                  <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
                  <TableCell>{order.reference}</TableCell>
                  <TableCell>
                    {order.status === 'pending' && (
                      <Button size="sm" variant="destructive" onClick={() => handleCancelOrderClick(order.id)}
                          className="bg-red-500 hover:bg-red-600 text-white font-medium">
                        Cancel Order
                      </Button>
                    )}
                    {/* Optionally, add a view/details button for other statuses */}
                    {order.status !== 'pending' && (
                        <Button size="sm" variant="outline" className="text-gray-600 hover:text-gray-800">
                            View Details
                        </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                  <p className="text-lg font-medium mb-2">No orders match your criteria. 😔</p>
                  <p>Try adjusting your search query or timeframe filter.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default OrdersTable;
