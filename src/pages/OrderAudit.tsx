import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarNav } from "@/components/SidebarNav";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { apiClient } from "@/api/client";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SummaryCards } from "@/components/SummaryCards";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Truck, ShieldCheck, Search, Eye } from "lucide-react";

type AuditOrder = {
  id: number;
  created_at: string;
  order_reference?: string;
  customer_name?: string;
  product?: string;
  quantity?: string | number;
  amount?: string | number;
  account_details?: string;

  payment_confirmed_at?: string | null;
  payment_user_email?: string | null;
  payment_user_name?: string | null;

  released_at?: string | null;
  release_user_email?: string | null;
  release_user_name?: string | null;

  truck_exit_at?: string | null;
  truck_exit_user_email?: string | null;
  truck_exit_user_name?: string | null;
};

type Paginated<T> = {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
};

type AuditEvent = {
  id: number;
  action: string;
  timestamp: string;
  actor?: { id: number | null; name?: string; email?: string; role?: string } | null;
  metadata?: Record<string, unknown> | null;
};

const actionOptions = [
  { key: "", label: "All Actions" },
  { key: "PAYMENT_CONFIRMED", label: "Payment Confirmed" },
  { key: "PAYMENT_WEBHOOK_CONFIRMED", label: "Payment Confirmed (Webhook)" },
  { key: "ORDER_RELEASED", label: "Order Released" },
  { key: "TRUCK_EXIT_RECORDED", label: "Truck Exit" },
  { key: "SECURITY_EXIT", label: "Security Exit" },
  { key: "ORDER_CANCELED", label: "Order Canceled" },
  { key: "AUTO_CANCELED", label: "Auto Canceled" },
  { key: "ORDER_STATUS_CHANGED", label: "Status Changed" },
  { key: "ORDER_UPDATED", label: "Order Updated" },
] as const;

const formatTs = (raw?: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? String(raw) : format(d, "dd/MM/yyyy HH:mm");
};

const toStartOfDayUTC = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
  return dt.toISOString().replace(".000Z", "Z");
};

const toEndOfDayUTC = (d: Date) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59));
  return dt.toISOString().replace(".000Z", "Z");
};

function ActorPill({ name, email, time, tone }: { name?: string | null; email?: string | null; time?: string | null; tone: "green" | "blue" | "slate" }) {
  if (!name && !email && !time) return <span className="text-slate-400">—</span>;
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "blue"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <div className="min-w-0">
      <Badge variant="outline" className={cls}>
        {name || email || "—"}
      </Badge>
      {email && name ? <div className="text-[11px] text-slate-500 truncate">{email}</div> : null}
      {time ? <div className="text-[11px] text-slate-500">{formatTs(time)}</div> : null}
    </div>
  );
}

function EventBadge({ action }: { action: string }) {
  const a = (action || "").toUpperCase();
  const cls =
    a.includes("CANCEL")
      ? "bg-red-50 text-red-700 border-red-200"
      : a.includes("PAYMENT")
        ? "bg-green-50 text-green-700 border-green-200"
        : a.includes("RELEASE")
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : a.includes("EXIT")
            ? "bg-slate-50 text-slate-700 border-slate-200"
            : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <Badge variant="outline" className={cls}>
      {a.replace(/_/g, " ")}
    </Badge>
  );
}

export default function OrderAudit() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [openOrderId, setOpenOrderId] = useState<number | null>(null);

  const fromIso = useMemo(() => (dateRange.from ? toStartOfDayUTC(dateRange.from) : undefined), [dateRange.from]);
  const toIso = useMemo(() => (dateRange.to ? toEndOfDayUTC(dateRange.to) : undefined), [dateRange.to]);

  const listQuery = useQuery<Paginated<AuditOrder>, Error>({
    queryKey: [
      "order-audit",
      {
        q: search.trim() || "",
        action: actionFilter || "",
        from: fromIso || "",
        to: toIso || "",
        page,
        pageSize,
      },
    ],
    queryFn: async (): Promise<Paginated<AuditOrder>> => {
      const data = await apiClient.admin.getOrderAudit({
        q: search.trim() || undefined,
        action: actionFilter || undefined,
        from: fromIso,
        to: toIso,
        page,
        page_size: pageSize,
      });

      return data as Paginated<AuditOrder>;
    },
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });

  const orders = useMemo(() => listQuery.data?.results ?? [], [listQuery.data?.results]);

  const summary = useMemo(() => {
    const total = listQuery.data?.count ?? orders.length;
    const payment = orders.filter((o) => Boolean(o.payment_user_email || o.payment_user_name)).length;
    const release = orders.filter((o) => Boolean(o.release_user_email || o.release_user_name)).length;
    const exit = orders.filter((o) => Boolean(o.truck_exit_user_email || o.truck_exit_user_name)).length;
    return { total, payment, release, exit };
  }, [listQuery.data?.count, orders]);

  const eventsQuery = useQuery<Paginated<AuditEvent>>({
    queryKey: ["order-audit-events", openOrderId],
    enabled: openOrderId !== null,
    queryFn: async () => {
      return (await apiClient.admin.getOrderAuditEvents(openOrderId as number, { page: 1, page_size: 200 })) as Paginated<AuditEvent>;
    },
  });

  const totalPages = useMemo(() => {
    const count = listQuery.data?.count ?? 0;
    return count ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  }, [listQuery.data?.count]);

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader title="Order Audit Trail" description="Track which user performed each action for accountability." />

            <SummaryCards
              cards={[
                { title: "Total Orders", value: String(summary.total), description: "In audit dataset", icon: <Search />, tone: "neutral" },
                { title: "Payment Confirmed", value: String(summary.payment), description: "Has payment actor", icon: <CheckCircle2 />, tone: "green" },
                { title: "Released", value: String(summary.release), description: "Has release actor", icon: <Truck />, tone: "neutral" },
                { title: "Truck Exit", value: String(summary.exit), description: "Has security actor", icon: <ShieldCheck />, tone: "neutral" },
              ]}
            />

            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      placeholder="Search by order ID, customer, product, reference, or user email…"
                      className="pl-10"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-11">
                        {dateRange.from && dateRange.to
                          ? `${format(dateRange.from, "dd MMM yyyy")} - ${format(dateRange.to, "dd MMM yyyy")}`
                          : "Select date range"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                          setDateRange({ from: range?.from ?? null, to: range?.to ?? null });
                          setPage(1);
                        }}
                        numberOfMonths={2}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <select
                    aria-label="Action filter"
                    className="border border-gray-300 rounded px-3 py-2 h-11 bg-white"
                    value={actionFilter}
                    onChange={(e) => {
                      setActionFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    {actionOptions.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => {
                      setSearch("");
                      setActionFilter("");
                      setDateRange({ from: null, to: null });
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="[&>th]:py-2 [&>th]:px-2">
                    <TableHead className="w-[64px]">ID</TableHead>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead className="w-[160px]">Order Ref</TableHead>
                    <TableHead className="w-[180px]">Customer</TableHead>
                    <TableHead className="w-[180px]">Product</TableHead>
                    <TableHead className="w-[120px]">Amount</TableHead>
                    <TableHead className="w-[200px]">Paid Into</TableHead>
                    <TableHead className="w-[230px]">Payment Confirmed</TableHead>
                    <TableHead className="w-[230px]">Released</TableHead>
                    <TableHead className="w-[230px]">Truck Exit</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="[&>tr>td]:py-2 [&>tr>td]:px-2">
                  {listQuery.isLoading ? (
                    [...Array(8)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={11}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : listQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-10 text-center text-red-600">
                        {String((listQuery.error as Error)?.message || "Failed to load audit data")}
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-10 text-center text-slate-500">
                        No orders found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-semibold text-slate-950">{o.id}</TableCell>
                        <TableCell className="text-slate-700 whitespace-nowrap">{formatTs(o.created_at)}</TableCell>
                        <TableCell className="font-semibold text-slate-950 whitespace-nowrap">
                          {o.order_reference || "—"}
                        </TableCell>
                        <TableCell className="text-slate-900 truncate max-w-[180px]">{o.customer_name || "—"}</TableCell>
                        <TableCell className="text-slate-700 truncate max-w-[180px]">
                          {(o.product || "—")}{o.quantity ? ` × ${String(o.quantity).toLocaleString?.() ?? o.quantity}L` : ""}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-950 whitespace-nowrap">
                          ₦{Number(String(o.amount ?? "0").replace(/,/g, "")).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-slate-700 truncate max-w-[200px]">{o.account_details || "—"}</TableCell>
                        <TableCell>
                          <ActorPill tone="green" name={o.payment_user_name} email={o.payment_user_email} time={o.payment_confirmed_at ?? null} />
                        </TableCell>
                        <TableCell>
                          <ActorPill tone="blue" name={o.release_user_name} email={o.release_user_email} time={o.released_at ?? null} />
                        </TableCell>
                        <TableCell>
                          <ActorPill tone="slate" name={o.truck_exit_user_name} email={o.truck_exit_user_email} time={o.truck_exit_at ?? null} />
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setOpenOrderId(o.id)}>
                            <Eye size={16} className="mr-1" /> Timeline
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-600">
                  Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
                  {listQuery.data?.count ? (
                    <> · <span className="font-medium">{listQuery.data.count.toLocaleString()}</span> total</>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || listQuery.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages || listQuery.isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              </div>
            </div>

            <Sheet open={openOrderId !== null} onOpenChange={(v) => (!v ? setOpenOrderId(null) : null)}>
              <SheetContent side="right" className="w-full sm:max-w-[560px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Order Timeline {openOrderId ? `#${openOrderId}` : ''}</SheetTitle>
                </SheetHeader>

                <div className="mt-4">
                  {eventsQuery.isLoading ? (
                    <div className="space-y-3">
                      {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : eventsQuery.isError ? (
                    <div className="text-sm text-red-600">{String((eventsQuery.error as Error)?.message || 'Failed to load timeline')}</div>
                  ) : (eventsQuery.data?.results || []).length === 0 ? (
                    <div className="text-sm text-slate-500">No audit events for this order yet.</div>
                  ) : (
                    <div className="space-y-4">
                      {(eventsQuery.data?.results || []).map((ev) => {
                        const actorName = ev.actor?.name || ev.actor?.email || 'System';
                        const actorEmail = ev.actor?.email || '';
                        const actorRole = ev.actor?.role || '';
                        return (
                          <div key={ev.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <EventBadge action={ev.action} />
                                <div className="mt-2 text-sm font-medium text-slate-900 truncate">{actorName}</div>
                                {actorEmail ? <div className="text-xs text-slate-500 truncate">{actorEmail}</div> : null}
                                {actorRole ? <div className="text-xs text-slate-500">Role: {actorRole}</div> : null}
                              </div>
                              <div className="text-xs text-slate-500 whitespace-nowrap">{formatTs(ev.timestamp)}</div>
                            </div>

                            {ev.metadata && Object.keys(ev.metadata).length ? (
                              <>
                                <Separator className="my-3" />
                                <div className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                                  {JSON.stringify(ev.metadata, null, 2)}
                                </div>
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  );
}
