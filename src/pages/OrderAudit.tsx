import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { apiClient } from "@/api/client";
import { format } from "date-fns";

const actions = [
  { key: "payment_confirmation", label: "Payment Confirmation" },
  { key: "release", label: "Release" },
  { key: "truck_exit", label: "Truck Exit" },
];

export default function OrderAudit() {
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Fetch orders with audit info
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["order-audit"],
    queryFn: async () => {
      // Replace with backend endpoint that returns audit info for orders
      return await apiClient.admin.getOrderAudit();
    },
    refetchOnWindowFocus: true,
  });

  const filteredOrders = useMemo(() => {
    let orders = data?.results || [];
    if (userFilter.trim()) {
      orders = orders.filter(o =>
        [o.payment_user_email, o.release_user_email, o.truck_exit_user_email].some(email =>
          email?.toLowerCase().includes(userFilter.trim().toLowerCase())
        )
      );
    }
    if (actionFilter) {
      orders = orders.filter(o => {
        if (actionFilter === "payment_confirmation") return !!o.payment_user_email;
        if (actionFilter === "release") return !!o.release_user_email;
        if (actionFilter === "truck_exit") return !!o.truck_exit_user_email;
        return true;
      });
    }
    if (dateFilter) {
      orders = orders.filter(o => {
        const d = new Date(o.created_at);
        return format(d, "yyyy-MM-dd") === dateFilter;
      });
    }
    return orders;
  }, [data?.results, userFilter, actionFilter, dateFilter]);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader title="Order Audit Trail" description="Track which user performed each action for accountability." />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 flex-wrap">
                  <Input
                    placeholder="Filter by user email"
                    value={userFilter}
                    onChange={e => setUserFilter(e.target.value)}
                    className="max-w-xs"
                  />
                  <select
                    title="Filter by action"
                    value={actionFilter}
                    onChange={e => setActionFilter(e.target.value)}
                    className="border rounded px-3 py-2 h-11"
                  >
                    <option value="">All Actions</option>
                    {actions.map(a => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Actions Table</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm border">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2 border">Order ID</th>
                        <th className="p-2 border">Customer Name</th>
                        <th className="p-2 border">Product</th>
                        <th className="p-2 border">Quantity</th>
                        <th className="p-2 border">Amount</th>
                        <th className="p-2 border">Account Details</th>
                        <th className="p-2 border">Payment Confirmation</th>
                        <th className="p-2 border">Release</th>
                        <th className="p-2 border">Security (Truck Exit)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={9} className="p-4 text-center">Loading…</td></tr>
                      ) : isError ? (
                        <tr><td colSpan={9} className="p-4 text-center text-red-600">Error: {String(error)}</td></tr>
                      ) : filteredOrders.length === 0 ? (
                        <tr><td colSpan={9} className="p-4 text-center">No orders found.</td></tr>
                      ) : (
                        filteredOrders.map(order => (
                          <tr key={order.id} className="border-b">
                            <td className="p-2 border">{order.id}</td>
                            <td className="p-2 border">{order.customer_name}</td>
                            <td className="p-2 border">{order.product}</td>
                            <td className="p-2 border">{order.quantity}</td>
                            <td className="p-2 border">₦{Number(order.amount).toLocaleString()}</td>
                            <td className="p-2 border">{order.account_details}</td>
                            <td className="p-2 border">{order.payment_user_email || <span className="text-slate-400">—</span>}</td>
                            <td className="p-2 border">{order.release_user_email || <span className="text-slate-400">—</span>}</td>
                            <td className="p-2 border">{order.truck_exit_user_email || <span className="text-slate-400">—</span>}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
