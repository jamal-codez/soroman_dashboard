import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Download, Filter, Search, CheckCircle, Clock, AlertCircle, Loader2, X, ChevronDown } from 'lucide-react';

// --- Mock API Client & Data ---
// In a real application, this would be your actual API client.
const mockApiClient = {
    admin: {
        getAllAdminOrders: async () => {
            console.log("Fetching mock orders...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
                count: 25,
                results: Array.from({ length: 25 }, (_, i) => {
                    const statusOptions = ['paid', 'pending', 'canceled'];
                    const date = new Date(2024, Math.floor(i / 3), (i % 28) + 1);
                    return {
                        id: 1001 + i,
                        user: {
                            first_name: `Customer`,
                            last_name: `${i + 1}`,
                            email: `customer${i + 1}@example.com`,
                            phone_number: `555-010${i % 10}`,
                        },
                        quantity: 1500 * (i + 1),
                        status: statusOptions[i % 3],
                        created_at: date.toISOString(),
                    };
                }),
            };
        },
        cancelOrder: async (orderId) => {
            console.log(`Canceling order ${orderId}...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return { success: true, orderId };
        },
    },
};

// --- UI Components (Self-Contained for Portability) ---
const Button = ({ children, onClick, variant = 'default', disabled = false, className = '' }) => {
    const baseClasses = 'px-4 py-2 rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 ease-in-out inline-flex items-center justify-center';
    const variants = {
        default: 'bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-500',
        outline: 'bg-transparent border border-slate-300 text-slate-700 hover:bg-slate-100 focus:ring-slate-400',
        destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    };
    const disabledClasses = 'disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed';
    return <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${disabledClasses} ${className}`}>{children}</button>;
};

const Input = ({ ...props }) => <input {...props} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500" />;

const Table = ({ children }) => <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200">{children}</table></div>;
const TableHeader = ({ children }) => <thead className="bg-slate-50">{children}</thead>;
const TableRow = ({ children, className = '' }) => <tr className={className}>{children}</tr>;
const TableHead = ({ children }) => <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{children}</th>;
const TableBody = ({ children }) => <tbody className="bg-white divide-y divide-slate-200">{children}</tbody>;
const TableCell = ({ children, className = '' }) => <td className={`px-6 py-4 whitespace-nowrap text-sm ${className}`}>{children}</td>;

// --- Status Components ---
const statusDisplayMap = {
    pending: 'Pending',
    paid: 'Paid',
    canceled: 'Canceled',
};

const getStatusConfig = (status) => {
    switch (status) {
        case 'paid': return { icon: CheckCircle, className: 'bg-green-100 text-green-800', iconClass: 'text-green-500' };
        case 'pending': return { icon: Clock, className: 'bg-orange-100 text-orange-800', iconClass: 'text-orange-500' };
        case 'canceled': return { icon: AlertCircle, className: 'bg-red-100 text-red-800', iconClass: 'text-red-500' };
        default: return { icon: Clock, className: 'bg-gray-100 text-gray-800', iconClass: 'text-gray-500' };
    }
};

const StatusBadge = ({ status }) => {
    const { icon: Icon, className, iconClass } = getStatusConfig(status);
    return (
        <div className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${className}`}>
            <Icon className={`mr-1.5 ${iconClass}`} size={14} />
            {statusDisplayMap[status] || 'Unknown'}
        </div>
    );
};

// --- Main Orders Component ---
const OrdersDashboard = () => {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState(null);

    const { data: orders = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ['all-orders'],
        queryFn: async () => (await mockApiClient.admin.getAllAdminOrders()).results || [],
        refetchOnWindowFocus: false,
    });

    const cancelOrderMutation = useMutation({
        mutationFn: mockApiClient.admin.cancelOrder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-orders'] });
        },
        onError: (err) => console.error('Cancel failed:', err),
        onSettled: () => {
            setShowCancelModal(false);
            setSelectedOrderId(null);
        },
    });

    const filteredOrders = useMemo(() => {
        const now = new Date();
        return orders
            .filter(order => {
                const orderDate = new Date(order.created_at);
                if (filter === 'week') return orderDate >= startOfWeek(now) && orderDate <= endOfWeek(now);
                if (filter === 'month') return orderDate >= startOfMonth(now) && orderDate <= endOfMonth(now);
                if (filter === 'year') return orderDate >= startOfYear(now) && orderDate <= endOfYear(now);
                return true;
            })
            .filter(order => {
                const searchLower = searchQuery.toLowerCase();
                const customerName = `${order.user.first_name} ${order.user.last_name}`.toLowerCase();
                return (
                    order.id.toString().includes(searchLower) ||
                    customerName.includes(searchLower) ||
                    order.user.email.toLowerCase().includes(searchLower) ||
                    order.user.phone_number.toLowerCase().includes(searchLower)
                );
            });
    }, [orders, searchQuery, filter]);

    const handleCancelClick = (orderId) => {
        setSelectedOrderId(orderId);
        setShowCancelModal(true);
    };

    const confirmCancelOrder = () => {
        if (selectedOrderId) {
            cancelOrderMutation.mutate(selectedOrderId);
        }
    };

    const handleExportCSV = () => {
        const headers = ["Date", "Order ID", "Customer's Name", "Contact Phone", "Contact Email", "Quantity (Litres)", "Status"];
        const csvRows = [
            "SALES RECORD EXPORT",
            `Export Date: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
            `Filters Applied: Search='${searchQuery}', Period='${filter}'`,
            "",
            headers.join(','),
        ];

        filteredOrders.forEach(order => {
            const row = [
                format(new Date(order.created_at), 'yyyy-MM-dd HH:mm'),
                `#${order.id}`,
                `"${order.user.first_name} ${order.user.last_name}"`,
                order.user.phone_number,
                order.user.email,
                order.quantity.toLocaleString('en-US'),
                statusDisplayMap[order.status],
            ];
            csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `sales_export_${format(new Date(), 'yyyyMMdd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) {
        return <div className="flex-1 p-6 flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-500" size={48} /></div>;
    }

    if (isError) {
        return (
            <div className="flex-1 p-6 flex flex-col items-center justify-center bg-red-50 text-red-700">
                <AlertCircle size={48} className="mb-4" />
                <h2 className="text-xl font-semibold">Error Loading Orders</h2>
                <p className="mb-4">{error?.message || 'An unknown error occurred.'}</p>
                <Button onClick={() => refetch()} variant="destructive">Retry</Button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                        <h1 className="text-2xl font-bold text-slate-800">Sales Records</h1>
                        <Button onClick={handleExportCSV} disabled={filteredOrders.length === 0}><Download className="mr-2" size={16} />Export as CSV</Button>
                    </header>

                    <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="relative md:col-span-2">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                <Input type="text" placeholder="Search by Order ID, Name, Email, or Phone..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 appearance-none bg-white">
                                    <option value="all">All Time</option>
                                    <option value="week">This Week</option>
                                    <option value="month">This Month</option>
                                    <option value="year">This Year</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
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
                                {filteredOrders.length > 0 ? (
                                    filteredOrders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-slate-50">
                                            <TableCell className="text-slate-600">{format(new Date(order.created_at), 'MMM dd, yyyy')}</TableCell>
                                            <TableCell className="font-medium text-slate-800">#{order.id}</TableCell>
                                            <TableCell className="font-medium text-slate-900">{order.user.first_name} {order.user.last_name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-slate-800">{order.user.phone_number}</span>
                                                    <span className="text-xs text-slate-500">{order.user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-right text-slate-700">{order.quantity.toLocaleString('en-US')} L</TableCell>
                                            <TableCell><StatusBadge status={order.status} /></TableCell>
                                            <TableCell>
                                                <Button variant="outline" onClick={() => handleCancelClick(order.id)} disabled={order.status !== 'pending'} className="text-xs py-1 px-2 border-red-300 text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent">Cancel</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={7} className="text-center py-12"><p className="text-slate-500">No orders match your criteria.</p></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </main>

            {showCancelModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full m-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-slate-800">Confirm Cancellation</h3>
                            <button onClick={() => setShowCancelModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <p className="text-slate-600 mb-6">Are you sure you want to cancel order <span className="font-bold">#{selectedOrderId}</span>? This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowCancelModal(false)} disabled={cancelOrderMutation.isPending}>No, Keep It</Button>
                            <Button variant="destructive" onClick={confirmCancelOrder} disabled={cancelOrderMutation.isPending}>
                                {cancelOrderMutation.isPending && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                                Yes, Cancel Order
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- App Entry Point ---
// Create a single, stable QueryClient instance outside the component.
const queryClient = new QueryClient();

const App = () => {
    return (
        // Provide the client to your App.
        <QueryClientProvider client={queryClient}>
            <div className="flex h-screen bg-slate-100 font-sans">
                <div className="w-64 bg-white border-r border-slate-200 p-4 hidden md:block">
                    <h2 className="font-bold text-xl text-slate-800">Dashboard</h2>
                    <nav className="mt-8">
                        <a href="#" className="block py-2 px-3 bg-slate-200 text-slate-900 rounded-md font-semibold">Orders</a>
                        <a href="#" className="block py-2 px-3 text-slate-600 hover:bg-slate-100 rounded-md">Customers</a>
                        <a href="#" className="block py-2 px-3 text-slate-600 hover:bg-slate-100 rounded-md">Reports</a>
                    </nav>
                </div>
                <div className="flex-1 flex flex-col">
                    <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
                        <div className="font-semibold">Sales Overview</div>
                        <div className="text-sm">Welcome, Admin!</div>
                    </div>
                    <OrdersDashboard />
                </div>
            </div>
        </QueryClientProvider>
    );
};

export default App;
