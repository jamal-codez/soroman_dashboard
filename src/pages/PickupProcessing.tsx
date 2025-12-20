import { useState, useMemo, useRef } from 'react';
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
  FileText,
  Printer,
  Pencil,
  DollarSign,
  Timer,
  CheckCircle2,
  XCircle
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
import { format, isThisMonth, isThisWeek, isThisYear, isToday } from 'date-fns';
import { apiClient } from '@/api/client';
import { useReactToPrint } from 'react-to-print';
import { TicketPrint, type ReleaseTicketData } from '@/components/TicketPrint';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards } from '@/components/SummaryCards';
import { getOrderReference } from '@/lib/orderReference';

interface Order {
  id: number;
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    phone?: string;
    companyName?: string; // might be missing in your API
    company_name?: string; // common alt
    company?: string;      // common alt
  };
  // Some backends also put company here:
  companyName?: string;
  company_name?: string;
  customer?: {
    companyName?: string;
    company_name?: string;
    company?: string;
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
  products: Array<{ name: string }>;
  quantity: number;
  release_type: 'pickup' | 'delivery';
  reference: string; // use this when present
  assigned_agent?: unknown;
  agent?: unknown;
  assignedAgent?: unknown;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

interface ReleaseDetails {
  truckNumber: string;
  driverName: string;
  driverPhone: string;
  dprNumber: string;
  loadingDateTime: string; // ISO string
}

// Helper for company 2-letter initials
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

// Try to find company name across likely fields
const extractCompanyName = (order: Order): string => {
  return (
    order.user?.companyName ||
    order.user?.company_name ||
    order.user?.company ||
    order.customer?.companyName ||
    order.customer?.company_name ||
    order.customer?.company ||
    order.companyName ||
    order.company_name ||
    ""
  );
};

// IMPORTANT: do not generate references client-side; use backend `order.reference` only.

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

const extractAssignedAgentName = (order: Order): string => {
  const rec = order as unknown as Record<string, unknown>;
  const a = (rec.assigned_agent ?? rec.assignedAgent ?? rec.agent) as unknown;
  if (!a) return '';
  if (typeof a === 'string') return a;
  const aRec = a as Record<string, unknown>;
  const fullName = [aRec.first_name, aRec.last_name]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .trim();
  return (
    fullName ||
    (typeof aRec.name === 'string' ? aRec.name : '') ||
    (typeof aRec.full_name === 'string' ? aRec.full_name : '') ||
    (typeof aRec.username === 'string' ? aRec.username : '') ||
    ''
  );
};

export const PickupProcessing = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'today'|'week'|'month'|'year'|null>(null);
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { toast } = useToast();

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [releaseDetailsByOrder, setReleaseDetailsByOrder] = useState<Record<number, ReleaseDetails>>({});

  const [releaseForm, setReleaseForm] = useState<ReleaseDetails>({
    truckNumber: '',
    driverName: '',
    driverPhone: '',
    dprNumber: '',
    loadingDateTime: ''
  });

  const { data: apiResponse, isLoading, isError, error, refetch } = useQuery<OrderResponse>({
    queryKey: ['pickup-orders', 'all'],
    queryFn: async () => {
      const response = await apiClient.admin.getPickupOrders({
        page: 1,
        page_size: 10000,
      });
      if (!response.results) throw new Error('Invalid response format');
      return {
        count: response.count || 0,
        results: response.results || []
      };
    },
    retry: 2,
    refetchOnWindowFocus: false
  });

  const summary = useMemo(() => {
    const list = apiResponse?.results || [];
    const total = apiResponse?.count || list.length;
    const paid = list.filter(o => o.status === 'paid').length;
    const pending = list.filter(o => o.status === 'pending').length;
    const released = list.filter(o => o.status === 'released').length;
    return { total, paid, pending, released };
  }, [apiResponse?.results, apiResponse?.count]);

  const ticketRef = useRef<HTMLDivElement>(null);
  const printTicket = useReactToPrint({
    contentRef: ticketRef,
    documentTitle: selectedOrder ? `ticket-${getOrderReference(selectedOrder) || selectedOrder.id}` : 'release-ticket'
  });

  const buildTicketData = useMemo(() => {
    if (!selectedOrder) return null;
    const details = releaseDetailsByOrder[selectedOrder.id];
    const companyName = extractCompanyName(selectedOrder) || '-';
    const userRec = selectedOrder.user as unknown as Record<string, unknown>;
    const phone =
      (typeof userRec.phone_number === 'string' ? userRec.phone_number : undefined) ||
      (typeof userRec.phone === 'string' ? userRec.phone : undefined) ||
      '-';

    return {
      orderReference: getOrderReference(selectedOrder),
      customerName: `${selectedOrder.user.first_name} ${selectedOrder.user.last_name}`,
      companyName,
      customerPhone: String(phone),
      product: selectedOrder.products.map(p => p.name).join(', '),
      qty: `${selectedOrder.quantity.toLocaleString()} Litres`,
      truckNumber: details?.truckNumber || '-',
      driverName: details?.driverName || '-',
      driverPhone: details?.driverPhone || '-',
      dprNumber: details?.dprNumber || '-',
      loadingDateTime: details?.loadingDateTime
        ? format(new Date(details.loadingDateTime), 'PPpp')
        : '-'
    } satisfies ReleaseTicketData;
  }, [selectedOrder, releaseDetailsByOrder]);

  const canPrintTicket = useMemo(() => {
    if (!selectedOrder) return false;
    const d = releaseDetailsByOrder[selectedOrder.id];
    return Boolean(
      d?.truckNumber?.trim() &&
      d?.driverName?.trim() &&
      d?.driverPhone?.trim() &&
      d?.dprNumber?.trim() &&
      d?.loadingDateTime?.trim()
    );
  }, [selectedOrder, releaseDetailsByOrder]);

  const openRelease = (order: Order) => {
    setSelectedOrder(order);
    const existing = releaseDetailsByOrder[order.id];
    setReleaseForm(existing || {
      truckNumber: order.trucks?.[0] || '',
      driverName: '',
      driverPhone: '',
      dprNumber: '',
      loadingDateTime: ''
    });
    setReleaseOpen(true);
  };

  const saveReleaseDetails = () => {
    if (!selectedOrder) return;
    setReleaseDetailsByOrder((prev) => ({
      ...prev,
      [selectedOrder.id]: releaseForm
    }));
  };

  const handleReleaseWithDetails = async () => {
    if (!selectedOrder) return;

    // Basic validation
    if (!releaseForm.truckNumber.trim() || !releaseForm.driverName.trim() || !releaseForm.driverPhone.trim() || !releaseForm.dprNumber.trim() || !releaseForm.loadingDateTime.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all release details before releasing.',
        variant: 'destructive'
      });
      return;
    }

    try {
      saveReleaseDetails();
      setReleaseOpen(false);

      // Backend release (details will be wired later)
      await apiClient.admin.releaseOrder(selectedOrder.id);
      queryClient.invalidateQueries({ queryKey: ['all-orders'] });

      toast({ title: 'Success!', description: 'ORDER RELEASED' });

      // Open ticket modal immediately after release
      setTicketOpen(true);
    } catch (error) {
      toast({
        title: 'Failed to release',
        description: (error as Error).message,
        variant: 'destructive'
      });
    }
  };

  const openTicket = (order: Order) => {
    setSelectedOrder(order);
    setTicketOpen(true);
  };

  const uniqueLocations = useMemo(() => {
    const list = apiResponse?.results || [];
    const locs = list
      .map((o) => {
        const pickup = (o.pickup as unknown as Record<string, unknown> | undefined) || undefined;
        return typeof pickup?.state === 'string' ? pickup.state : undefined;
      })
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(locs)).sort();
  }, [apiResponse?.results]);

  const filteredOrders = useMemo(() => {
    const base = apiResponse?.results || [];
    return base
      .filter(order => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        const inId = String(order.id).toLowerCase().includes(q);
        const inName = `${order.user.first_name} ${order.user.last_name}`.toLowerCase().includes(q);
        const inRef = getOrderReference(order).toLowerCase().includes(q);
        return inId || inName || inRef;
      })
      .filter(order => {
        if (!filterType) return true;
        const d = new Date(order.created_at);
        if (filterType === 'today') return isToday(d);
        if (filterType === 'week') return isThisWeek(d);
        if (filterType === 'month') return isThisMonth(d);
        if (filterType === 'year') return isThisYear(d);
        return true;
      })
      .filter(order => {
        if (!locationFilter) return true;
        return order.pickup?.state === locationFilter;
      })
      .filter(order => {
        if (!statusFilter) return true;
        return (order.status || '').toLowerCase() === statusFilter.toLowerCase();
      });
  }, [apiResponse?.results, searchQuery, filterType, locationFilter, statusFilter]);

  const exportToCSV = (orders: Order[]) => {
    const headers = [
      "Order ID",
      "Reference",
      "Customer Name",
      "Email",
      "Pickup Date",
      "Pickup Time",
      "State",
      "Trucks",
      "Total Price",
      "Status",
      "Created At",
      "Products",
      "Quantity",
      "Release Type"
    ];

    const rows = orders.map(order => [
      order.id,
      getOrderReference(order),
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
        .map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
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
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Release Orders"
              // description="Capture release details, release paid orders, and generate a printable ticket." 
              actions={
                <>
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => exportToCSV(filteredOrders)}
                  >
                    <Download className="mr-1" size={16} />
                    Export
                  </Button>
                </>
              }
            />

            <SummaryCards
              cards={[
                { title: 'Total Orders', value: String(summary.total), description: 'All orders', icon: <FileText />, tone: 'neutral' },
                { title: 'Paid', value: String(summary.paid), description: 'Ready to release', icon: <CheckCircle2 />, tone: 'green' },
                // { title: 'Pending', value: String(summary.pending), description: 'Awaiting payment', icon: <Timer />, tone: 'amber' },
                { title: 'Released', value: String(summary.released), description: 'Tickets available', icon: <Truck />, tone: 'neutral' },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      type="text"
                      placeholder="Search pickups by name, reference or ID..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={handleSearch}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-3 gap-3">
                    <select
                    aria-label="Timeframe filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={filterType ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as ''|'today'|'week'|'month'|'year';
                      setFilterType(v === '' ? null : v);
                    }}
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                  </select>
                  <select
                    aria-label="Location filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={locationFilter ?? ''}
                    onChange={(e) => setLocationFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Locations</option>
                    {uniqueLocations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <select
                    aria-label="Status filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11"
                    value={statusFilter ?? ''}
                    onChange={(e) => setStatusFilter(e.target.value === '' ? null : e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="canceled">Canceled</option>
                    <option value="released">Released</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Reference</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Assigned Agent</TableHead>
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
                      <TableCell>{getOrderReference(order) || '-'}</TableCell>
                      <TableCell>{order.pickup?.state || '-'}</TableCell>
                      <TableCell>{extractAssignedAgentName(order) || '-'}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {order.user.first_name} {order.user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {/* Optional: show company under name */}
                            {/* {extractCompanyName(order) || "-"} */}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{order.products.map(p => p.name).join(', ')}</TableCell>
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
                            open={releaseOpen && selectedOrder?.id === order.id}
                            onOpenChange={(isOpen) => {
                              if (!isOpen) {
                                setReleaseOpen(false);
                                setSelectedOrder(null);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                className="h-8 gap-1"
                                onClick={() => openRelease(order)}
                                disabled={order.status !== 'paid'}
                              >
                                <Truck className="h-4 w-4" />
                                <span>Release</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Release Order</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="truckNumber">Truck Number</Label>
                                  <Input
                                    id="truckNumber"
                                    value={releaseForm.truckNumber}
                                    onChange={(e) => setReleaseForm({ ...releaseForm, truckNumber: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="driverName">Driver Name</Label>
                                  <Input
                                    id="driverName"
                                    value={releaseForm.driverName}
                                    onChange={(e) => setReleaseForm({ ...releaseForm, driverName: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="driverPhone">Driver Phone</Label>
                                  <Input
                                    id="driverPhone"
                                    value={releaseForm.driverPhone}
                                    onChange={(e) => setReleaseForm({ ...releaseForm, driverPhone: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="dprNumber">DPR Number</Label>
                                  <Input
                                    id="dprNumber"
                                    value={releaseForm.dprNumber}
                                    onChange={(e) => setReleaseForm({ ...releaseForm, dprNumber: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="loadingDateTime">Loading Date & Time</Label>
                                  <Input
                                    id="loadingDateTime"
                                    type="datetime-local"
                                    value={releaseForm.loadingDateTime}
                                    onChange={(e) => setReleaseForm({ ...releaseForm, loadingDateTime: e.target.value })}
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setReleaseOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={handleReleaseWithDetails}>
                                  Confirm Release
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1"
                            onClick={() => openTicket(order)}
                          >
                            <Printer className="h-4 w-4" />
                            <span>Ticket</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-slate-500 py-10">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* pagination removed */}
            
            {/* Ticket modal + print area */}
            <Dialog
              open={ticketOpen}
              onOpenChange={(open) => {
                if (!open) setTicketOpen(false);
              }}
            >
              <DialogContent className="sm:max-w-[860px]">
                <DialogHeader>
                  <DialogTitle>Release Ticket</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  {!selectedOrder ? (
                    <div className="text-sm text-slate-600">Select an order to view the ticket.</div>
                  ) : (
                    <>
                      {!canPrintTicket && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                          Ticket cannot be printed yet. Please release the order and fill all release details (Truck Number, Driver Name/Phone, DPR Number, Loading Date &amp; Time).
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <TicketPrint
                          ref={ticketRef}
                          data={
                            buildTicketData || {
                              orderReference: getOrderReference(selectedOrder),
                              customerName: `${selectedOrder.user.first_name} ${selectedOrder.user.last_name}`,
                              companyName: extractCompanyName(selectedOrder) || '-',
                              customerPhone: (() => {
                                const userRec = selectedOrder.user as unknown as Record<string, unknown>;
                                const phone =
                                  (typeof userRec.phone_number === 'string' ? userRec.phone_number : undefined) ||
                                  (typeof userRec.phone === 'string' ? userRec.phone : undefined) ||
                                  '-';
                                return String(phone);
                              })(),
                              product: selectedOrder.products.map((p) => p.name).join(', '),
                              qty: `${selectedOrder.quantity.toLocaleString()} Litres`,
                              truckNumber: '-',
                              driverName: '-',
                              driverPhone: '-',
                              dprNumber: '-',
                              loadingDateTime: '-',
                            }
                          }
                        />
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setTicketOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      if (!canPrintTicket) {
                        toast({
                          title: 'Missing release details',
                          description: 'Fill all release details before printing the ticket.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      printTicket();
                    }}
                    disabled={!selectedOrder || !canPrintTicket}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Print Ticket
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>
        </div>
      </div>
    </div>
  );
};
