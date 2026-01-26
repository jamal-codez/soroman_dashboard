import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/api/client";
import { Search, CheckCircle, CheckIcon, TruckIcon, AlertCircle } from "lucide-react";
import { format } from "date-fns";

type OrderLike = {
  id: number | string;
  status?: string | null;

  // Shape used elsewhere in app
  user?: Record<string, any> | null;
  customer_details?: Record<string, any> | null;
  products?: Array<{ name?: string | null }> | null;
  quantity?: number | string | null;

  truck_number?: string | null;
  driver_name?: string | null;

  // Release details (seen in released order payload)
  company_name?: string | null;
  dpr_number?: string | null;
  nmdrpa_number?: string | null;
  loading_datetime?: string | null;

  assigned_agent?: unknown;
  agent?: unknown;
  assignedAgent?: unknown;

  // Fallbacks (in case backend sends flat fields)
  customer_name?: string | null;
  customerName?: string | null;
  companyName?: string | null;
  phone_number?: string | null;
  customerPhone?: string | null;
  assigned_agent_name?: string | null;
  agentName?: string | null;
  nmdrpaNumber?: string | null;
  dprNumber?: string | null;
  product?: unknown;
  product_name?: string | null;
  qty?: number | string | null;
  truckNumber?: string | null;
  driverName?: string | null;

  truck_exited?: boolean;
};

type PagedResponse<T> = { count?: number; results?: T[] };

const norm = (s: unknown) => String(s ?? "").trim();
const normLower = (s: unknown) => norm(s).toLowerCase();

function getCustomerName(o: OrderLike) {
  const user = o.user || {};
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || o.customerName || o.customer_name || "";
}

function getCompanyName(o: OrderLike) {
  const cd = o.customer_details || {};
  const user = o.user || {};
  return (
    // Most reliable from sample payload
    (typeof user.company_name === "string" && user.company_name) ||
    (typeof o.company_name === "string" && o.company_name) ||

    // Other common places
    (typeof cd.company_name === "string" && cd.company_name) ||
    (typeof cd.companyName === "string" && cd.companyName) ||
    (typeof cd.company === "string" && cd.company) ||
    (typeof user.companyName === "string" && user.companyName) ||
    o.companyName ||
    ""
  );
}

function getPhone(o: OrderLike) {
  const user = o.user || {};
  return (
    (typeof user.phone_number === "string" && user.phone_number) ||
    (typeof user.phone === "string" && user.phone) ||
    o.customerPhone ||
    o.phone_number ||
    ""
  );
}

function getDprOrNmdpra(o: OrderLike) {
  const cd = o.customer_details || {};
  return (
    // Top-level (sample payload)
    (typeof o.dpr_number === "string" && o.dpr_number) ||
    (typeof o.nmdrpa_number === "string" && o.nmdrpa_number) ||

    // Nested fallbacks
    (typeof cd.dpr_number === "string" && cd.dpr_number) ||
    (typeof cd.dprNumber === "string" && cd.dprNumber) ||
    (typeof cd.nmdrpa_number === "string" && cd.nmdrpa_number) ||
    (typeof cd.nmdrpaNumber === "string" && cd.nmdrpaNumber) ||

    // Legacy fallbacks
    o.dprNumber ||
    o.nmdrpaNumber ||
    ""
  );
}

function getProductName(o: OrderLike) {
  const fromProducts = (o.products || [])
    .map((p) => p?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .join(", ");
  if (fromProducts) return fromProducts;

  const p = o.product as any;
  return (
    o.product_name ||
    (typeof p === "string" ? p : null) ||
    (p && typeof p === "object" ? (p.name || p.product_name || p.product || p.type) : null) ||
    ""
  );
}

function getQuantity(o: OrderLike) {
  const raw = o.quantity ?? o.qty;
  if (raw == null || raw === '') return '';

  const n =
    typeof raw === 'number'
      ? raw
      : Number(String(raw).replace(/,/g, '').trim());

  if (!Number.isFinite(n)) return String(raw);
  return `${n.toLocaleString()} litres`;
}

function getTruckNumber(o: OrderLike) {
  const cd = o.customer_details || {};
  return (
    o.truck_number ||
    (typeof cd.truckNumber === "string" ? cd.truckNumber : "") ||
    (typeof cd.truck_number === "string" ? cd.truck_number : "") ||
    o.truckNumber ||
    ""
  );
}

function getDriverName(o: OrderLike) {
  const cd = o.customer_details || {};
  return (
    o.driver_name ||
    (typeof cd.driverName === "string" ? cd.driverName : "") ||
    (typeof cd.driver_name === "string" ? cd.driver_name : "") ||
    o.driverName ||
    ""
  );
}

function formatLoadingDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd/MM/yyyy - HH:mm");
}

function getLoadingDateTime(o: OrderLike) {
  const cd = o.customer_details || {};
  const raw =
    (typeof o.loading_datetime === "string" && o.loading_datetime) ||
    (typeof cd.loading_datetime === "string" && cd.loading_datetime) ||
    (typeof cd.loadingDateTime === "string" && cd.loadingDateTime) ||
    (typeof cd.loading_date_time === "string" && cd.loading_date_time) ||
    (typeof cd.loadingDate === "string" && cd.loadingDate) ||
    "";

  return raw ? formatLoadingDateTime(raw) : "";
}

const isReleased = (status: unknown) => normLower(status) === "released";

export default function SecurityPage() {
  const [query, setQuery] = useState("");
  const [exiting, setExiting] = useState(false);
  const [exitedOrderId, setExitedOrderId] = useState<string | number | null>(null);

  // We fetch all orders once (like other pages do) and filter client-side.
  const { data, isLoading, isError, error, refetch } = useQuery<PagedResponse<OrderLike>>({
    queryKey: ["all-orders", "security"],
    queryFn: async () => {
      const res = await apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 });
      return { count: res.count || 0, results: res.results || [] };
    },
    retry: 2,
    refetchOnWindowFocus: true,
  });

  const match = useMemo(() => {
    const q = query.trim();
    if (!q) return null;

    const list = data?.results || [];
    const found = list.find((o) => String(o.id) === q);
    if (!found) return null;
    if (!isReleased(found.status)) return "NOT_RELEASED" as const;
    return found;
  }, [data?.results, query]);

  // Replace localStorage logic with backend call for truck exit
  async function confirmTruckExit(orderId: string | number) {
    setExiting(true);
    try {
      await apiClient.admin.confirmTruckExit(orderId);
      setExitedOrderId(orderId);
      await refetch(); // Refresh orders to get updated truck_exited status
    } finally {
      setExiting(false);
    }
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-5">
            <PageHeader
              title="Security Clearance"
              description="Search by Order ID to verify released orders"
            //   actions={
            //     <button
            //       className="text-sm text-slate-600 underline"
            //       onClick={() => refetch()}
            //       type="button"
            //     >
            //       Refresh
            //     </button>
            //   }
            />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Lookup</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    className="pl-10 h-11"
                    placeholder="Enter Order ID to search..."
                    inputMode="numeric"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                <div className="mt-4 text-sm">
                  {isLoading ? (
                    <div className="text-slate-600">Loading orders…</div>
                  ) : isError ? (
                    <div className="text-red-600">
                      Failed to load orders: {(error as Error)?.message || "Unknown error"}
                    </div>
                  ) : !query.trim() ? (
                    <div className="text-slate-500">Enter an Order ID to view details</div>
                  ) : match === "NOT_RELEASED" ? (
                    <div className="text-slate-600">
                        <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span>
                          This order is not yet permitted to exit the facility. Please ensure the order has been released before proceeding.
                        </span>
                        </div>
                    </div>
                  ) : match == null ? (
                    <div className="text-slate-600">No released order found for that ID</div>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Detail label="Customer Name" value={getCustomerName(match)} />
                        <Detail label="Company Name" value={getCompanyName(match)} />
                        <Detail label="Phone Number" value={getPhone(match)} />
                        <Detail label="Product" value={getProductName(match)} />
                        <Detail label="Quantity" value={getQuantity(match)} />
                        {/* <Detail label="NMDPRA Number" value={getDprOrNmdpra(match)} /> */}
                        <Detail label="Driver's Name" value={getDriverName(match)} />
                        <Detail label="Truck Number" value={getTruckNumber(match)} />
                        <Detail label="Loading Date & Time" value={getLoadingDateTime(match)} />
                      </div>
                      <div className="mt-6 flex flex-col items-start">
                        {(match.truck_exited || exitedOrderId === match.id) ? (
                          <div className="p-4 rounded bg-green-800 text-white flex items-center gap-2">
                            <TruckIcon className="w-4 h-4" />
                            This truck has been exited!
                          </div>
                        ) : (
                          <button
                            className="px-6 py-4 rounded bg-red-700 text-white hover:bg-red-800 mt-2 flex items-center gap-2 disabled:opacity-60"
                            onClick={() => confirmTruckExit(match.id)}
                            disabled={exiting}
                          >
                            <TruckIcon className="w-4 h-4" />
                            {exiting ? "Exiting..." : "Confirm Truck Exit"}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
        {value || "—"}
      </div>
    </div>
  );
}
