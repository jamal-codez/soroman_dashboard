import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { useReactToPrint } from 'react-to-print';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Printer,
  Pencil,
  Loader2,
  Truck,
  Globe,
  PhoneCall,
  RotateCw,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

type Ticket = {
  id: number;
  order: number;
  truck_number: number;
  quantity_litres: string;
  driver_name: string | null;
  driver_phone: string | null;
  plate_number: string | null;
  ticket_status: string;
  created_at: string;
  updated_at: string;
};

type PrintData = {
  ticket_id: number;
  order_reference: string;
  company_name: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  truck_number: number;
  quantity_litres: string;
  driver_name: string | null;
  driver_phone: string | null;
  plate_number: string | null;
  ticket_status: string;
  location: string;
  total_trucks: number;
  loading_datetime: string | null;
};

// ── Status helpers ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  generated: 'Generated',
  printed: 'Printed',
  loaded: 'Loaded',
  completed: 'Completed',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-50 text-slate-600 border-slate-200',
  generated: 'bg-amber-50 text-amber-700 border-amber-200',
  printed: 'bg-blue-50 text-blue-700 border-blue-200',
  loaded: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Merge driver name + phone into a compact single-line string */
const formatDriver = (name: string | null, phone: string | null): string => {
  const n = (name || '').trim();
  const p = (phone || '').trim();
  if (n && p) return `${n} (${p})`;
  if (n) return n;
  if (p) return p;
  return '';
};

const isPrinted = (status: string) =>
  status === 'printed' || status === 'loaded' || status === 'completed';

/** Format an ISO datetime string for display on the printed ticket */
const formatLoadingDateTime = (raw: string | null): string => {
  const v = (raw || '').trim();
  if (!v) return '';
  try {
    const d = new Date(v);
    return d.toLocaleString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return v;
  }
};

// ── Main component ───────────────────────────────────────────────────────

export function TruckTickets({
  orderId,
  orderQuantity,
  onClose,
}: {
  orderId: number;
  /** Total order quantity in litres */
  orderQuantity?: number;
  /** Called when the user clicks "Back" */
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Edit ticket state ──────────────────────────────────────────────────
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ driver_name: '', driver_phone: '', plate_number: '' });
  const [editBusy, setEditBusy] = useState(false);

  // ── Print state ────────────────────────────────────────────────────────
  const printRef = useRef<HTMLDivElement>(null);
  const [printData, setPrintData] = useState<PrintData[] | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  // ── Query ──────────────────────────────────────────────────────────────

  const {
    data: tickets,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['order-tickets', orderId],
    queryFn: () => apiClient.admin.getOrderTickets(orderId),
    staleTime: 30_000,
  });

  const orderQty = orderQuantity ?? 0;

  // ── Edit modal ─────────────────────────────────────────────────────────

  const openEdit = (t: Ticket) => {
    setEditTicket(t);
    setEditForm({
      driver_name: t.driver_name || '',
      driver_phone: t.driver_phone || '',
      plate_number: t.plate_number || '',
    });
  };

  const saveEdit = async () => {
    if (!editTicket) return;
    setEditBusy(true);
    try {
      await apiClient.admin.updateTicket(editTicket.id, {
        driver_name: editForm.driver_name.trim() || undefined,
        driver_phone: editForm.driver_phone.trim() || undefined,
        plate_number: editForm.plate_number.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['order-tickets', orderId] });
      toast({ title: 'Saved', description: 'Ticket details updated.' });
      setEditTicket(null);
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setEditBusy(false);
    }
  };

  // ── Print helpers ──────────────────────────────────────────────────────

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `tickets-order-${orderId}`,
  });

  /** Mark ticket(s) as "printed" silently. Failures are swallowed. */
  const markAsPrinted = async (ticketIds: number[]) => {
    const toPatch = ticketIds.filter((id) => {
      const t = tickets?.find((tk) => tk.id === id);
      return t && !isPrinted(t.ticket_status);
    });
    if (!toPatch.length) return;
    try {
      await Promise.all(
        toPatch.map((id) => apiClient.admin.updateTicket(id, { ticket_status: 'printed' }))
      );
      await queryClient.invalidateQueries({ queryKey: ['order-tickets', orderId] });
    } catch {
      // Silent — status update is best-effort
    }
  };

  const printSingleTicket = async (ticketId: number) => {
    setPrintBusy(true);
    try {
      const data = await apiClient.admin.getTicketPrintData(ticketId);
      setPrintData([data]);
      setTimeout(async () => {
        handlePrint();
        await markAsPrinted([ticketId]);
        setPrintBusy(false);
      }, 200);
    } catch (e) {
      toast({ title: 'Print error', description: (e as Error).message, variant: 'destructive' });
      setPrintBusy(false);
    }
  };

  const printAllTickets = async () => {
    if (!tickets?.length) return;
    setPrintBusy(true);
    try {
      const all = await Promise.all(
        tickets.map((t) => apiClient.admin.getTicketPrintData(t.id))
      );
      setPrintData(all);
      setTimeout(async () => {
        handlePrint();
        await markAsPrinted(tickets.map((t) => t.id));
        setPrintBusy(false);
      }, 200);
    } catch (e) {
      toast({ title: 'Print error', description: (e as Error).message, variant: 'destructive' });
      setPrintBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError || !tickets) {
    return (
      <div className="p-6 text-sm text-red-600">Failed to load truck tickets.</div>
    );
  }

  // No tickets yet
  if (tickets.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        <Truck className="mx-auto h-10 w-10 text-slate-300" />
        <div className="text-sm text-slate-500">
          No truck tickets yet.
          {orderQty > 0 && (
            <span className="block text-xs text-slate-400 mt-1">
              Order total: <span className="font-semibold">{orderQty.toLocaleString()} Litres</span>
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Use the &quot;Generate Ticket&quot; button to create loading tickets.
        </p>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="mt-2">
            Back
          </Button>
        )}
      </div>
    );
  }

  // Has tickets
  const ticketTotalQty = tickets.reduce(
    (sum, t) => sum + (Number(t.quantity_litres) || 0),
    0
  );

  return (
    <>
      <div className="flex flex-col h-full">
        {/* ─── Top section ──────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-4">
          {/* Left — title + subtitle */}
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight leading-tight">
              Loading Tickets
              {/* <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold h-5 min-w-[1.25rem] px-1.5">
                {tickets.length}
              </span> */}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Total Volume: <span className="font-semibold text-black">{ticketTotalQty.toLocaleString()} Litres</span>
            </p>
          </div>

          {/* Right — actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* {onClose && (
              <Button variant="ghost" className="text-slate-500 font-medium" onClick={onClose}>
                Back
              </Button>
            )} */}
            <Button
              className="gap-2 font-medium"
              onClick={printAllTickets}
              disabled={printBusy}
            >
              {printBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print All Tickets
            </Button>
          </div>
        </div>

        {/* ─── Table ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto border-t border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-[72px] font-semibold">Truck</TableHead>
                <TableHead className="font-semibold">Volume</TableHead>
                <TableHead className="font-semibold">Truck Number</TableHead>
                <TableHead className="font-semibold">Driver</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => {
                const printed = isPrinted(t.ticket_status);
                const driver = formatDriver(t.driver_name, t.driver_phone);

                return (
                  <TableRow key={t.id} className="group">
                    <TableCell className="font-bold text-slate-700">
                      #{t.truck_number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {Number(t.quantity_litres).toLocaleString()} L
                    </TableCell>
                    <TableCell>
                      {t.plate_number ? (
                        <span className="font-medium">{t.plate_number}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {driver ? (
                        <span className="text-sm">{driver}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-medium ${STATUS_COLORS[t.ticket_status] || ''}`}
                      >
                        {STATUS_LABELS[t.ticket_status] || t.ticket_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className={`h-8 text-xs gap-1.5 font-medium ${printed ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-none border border-slate-200' : ''}`}
                          variant={printed ? 'outline' : 'default'}
                          disabled={printBusy}
                          onClick={() => printSingleTicket(t.id)}
                        >
                          {printed ? (
                            <RotateCw className="h-3 w-3" />
                          ) : (
                            <Printer className="h-3 w-3" />
                          )}
                          {printed ? 'Reprint' : 'Print'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5 font-medium"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────── */}
      <Dialog
        open={!!editTicket}
        onOpenChange={(open) => {
          if (!open) setEditTicket(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ticket for Truck #{editTicket?.truck_number}</DialogTitle>
            <DialogDescription>
              Update driver details or truck number for this truck.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-plate" className="text-xs font-medium text-slate-600">Truck Number</Label>
              <Input
                id="edit-plate"
                value={editForm.plate_number}
                onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value })}
                placeholder="e.g. ABC-123-XY"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-driver" className="text-xs font-medium text-slate-600">Driver's Name</Label>
              <Input
                id="edit-driver"
                value={editForm.driver_name}
                onChange={(e) => setEditForm({ ...editForm, driver_name: e.target.value })}
                placeholder="Enter driver name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-xs font-medium text-slate-600">Driver's Phone Number</Label>
              <Input
                id="edit-phone"
                value={editForm.driver_phone}
                onChange={(e) => setEditForm({ ...editForm, driver_phone: e.target.value })}
                placeholder="e.g. 08012345678"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTicket(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={editBusy}>
              {editBusy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Hidden print area ─────────────────────────────────────────── */}
      <div className="hidden">
        <div ref={printRef}>
          {printData?.map((d, i) => (
            <TicketPrintPage key={d.ticket_id} data={d} isLast={i === printData.length - 1} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Print template (matches TicketPrint layout exactly) ────────────────────

const EMPTY_COMPARTMENTS = Array.from({ length: 5 }, (_, i) => ({
  n: String(i + 1),
  qty: '',
  ullage: '',
}));

function TicketPrintPage({ data: d, isLast }: { data: PrintData; isLast: boolean }) {
  return (
    <div
      className="bg-white text-slate-900 p-8"
      style={{ pageBreakAfter: isLast ? 'auto' : 'always' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Soroman" className="h-12 w-12" />
          <div>
            <div className="text-lg font-bold">Soroman Nigeria Limited</div>
            <div className="text-sm">
              Loading Ticket for{' '}
              <span className="font-semibold text-green-700">{d.location || ''}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Order Reference</div>
          <div className="text-sm font-semibold">{d.order_reference}</div>
          {/* <div className="text-xs text-slate-500 mt-1">
            Truck {d.truck_number} of {d.total_trucks}
          </div> */}
        </div>
      </div>

      {/* Details grid */}
      <div className="mt-6 border border-slate-300 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <TicketRow label="Company's Name" value={d.company_name} />
          <TicketRow label="NMDPRA Number" value=" " />
          <TicketRow label="Contact Person" value={d.customer_name} />
          <TicketRow label="Phone Number" value={d.customer_phone} />
          <TicketRow label="Product Bought" value={d.product_name} />
          <TicketRow label="Quantity" value={`${Number(d.quantity_litres).toLocaleString()} Litres`} />
          <TicketRow label="Truck Number" value={d.plate_number || ''} />
          <TicketRow
            label="Driver's Name & Phone Number"
            value={
              [d.driver_name, d.driver_phone].filter(Boolean).join(' - ') || ' '
            }
          />
          
          {/* Delivery Address — full width, left blank */}
          <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Delivery Address</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{' '}</div>
          </div>
          {/* Compartment Details — full width, 5 empty rows */}
          <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Compartment Details</div>
            <div className="mt-2 overflow-hidden border border-slate-300">
              <div className="grid grid-cols-3 bg-slate-50 text-[11px] uppercase font-semibold text-slate-600">
                <div className="px-2 py-1">S/N</div>
                <div className="px-2 py-1">Quantity</div>
                <div className="px-2 py-1">Ullage</div>
              </div>
              {EMPTY_COMPARTMENTS.map((c) => (
                <div key={c.n} className="grid grid-cols-3 text-sm">
                  <div className="px-2 py-1 border-t border-slate-300">{c.n}</div>
                  <div className="px-2 py-1 border-t border-slate-300">{c.qty}</div>
                  <div className="px-2 py-1 border-t border-slate-300">{c.ullage}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Loading Date & Time — full width */}
          <div className="p-3 border-t border-slate-200 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0 sm:col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Loading Date &amp; Time: <span className="text-xs font-semibold text-slate-900">{formatLoadingDateTime(d.loading_datetime)}</span></div>
          </div>
        </div>
      </div>

      {/* Signature lines */}
      <div className="mt-6 space-y-5 text-sm">
        <SignatureLine label="Loader's Name & Phone No." />
        <SignatureLine label="Finance Clearance" placeholders />
        <SignatureLine label="Commercial Manager" placeholders />
        <SignatureLine label="Depot Manager" placeholders />
        <SignatureLine label="Dispatch Officer" placeholders />
        <SignatureLine label="Security" placeholders />
      </div>

      {/* Footer */}
      <div className="mt-10 bg-green-900 px-4 py-3 text-white">
        <div className="flex items-center justify-center gap-2 text-xs">
          <Globe className="h-3 w-3" />
          <span>
            Visit{' '}
            <span className="underline underline-offset-2 font-bold">ordersoroman.com</span> to
            order fuel online without stress!
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <PhoneCall className="h-3 w-3" />
          <span className="font-bold">
            07060659524, 08035370741, 08021215027, 08023982277, 08036360577, 08036711324
          </span>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{value || ''}</div>
    </div>
  );
}

function SignatureLine({
  label,
  placeholders,
}: {
  label: string;
  placeholders?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="font-semibold">{label}:</div>
      <div className="flex-1 relative h-5">
        <div className="absolute inset-x-0 bottom-0 border-b border-slate-500" />
        {placeholders ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-200">
            <span className="px-1">Full Name &amp; Signature</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default TruckTickets;
