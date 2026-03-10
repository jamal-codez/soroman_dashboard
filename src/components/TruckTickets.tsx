import { useState, useMemo, useRef } from 'react';
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
  ChevronRight,
  Globe,
  PhoneCall,
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
  plate_number: string | null;
  ticket_status: string;
  location: string;
  total_trucks: number;
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
  pending: 'bg-slate-100 text-slate-700 border-slate-300',
  generated: 'bg-blue-50 text-blue-700 border-blue-300',
  printed: 'bg-amber-50 text-amber-700 border-amber-300',
  loaded: 'bg-green-50 text-green-700 border-green-300',
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
};

const NEXT_STATUS: Record<string, { label: string; next: string } | null> = {
  pending: { label: 'Generate Ticket', next: 'generated' },
  generated: { label: 'Mark Printed', next: 'printed' },
  printed: { label: 'Mark Loaded', next: 'loaded' },
  loaded: { label: 'Complete', next: 'completed' },
  completed: null,
};

const PREV_STATUS: Record<string, string | null> = {
  pending: null,
  generated: 'pending',
  printed: 'generated',
  loaded: 'printed',
  completed: 'loaded',
};

// ── Main component ───────────────────────────────────────────────────────

export function TruckTickets({ orderId }: { orderId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editTicket, setEditTicket] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ driver_name: '', driver_phone: '', plate_number: '' });
  const [editBusy, setEditBusy] = useState(false);

  const [statusBusy, setStatusBusy] = useState<number | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  const [printData, setPrintData] = useState<PrintData[] | null>(null);

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

  // ── Status transitions ─────────────────────────────────────────────────

  const changeStatus = async (ticketId: number, newStatus: string) => {
    setStatusBusy(ticketId);
    try {
      await apiClient.admin.updateTicket(ticketId, { ticket_status: newStatus });
      await queryClient.invalidateQueries({ queryKey: ['order-tickets', orderId] });
      toast({ title: 'Updated', description: `Ticket status → ${STATUS_LABELS[newStatus] || newStatus}` });
    } catch (e) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStatusBusy(null);
    }
  };

  // ── Print ──────────────────────────────────────────────────────────────

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `tickets-order-${orderId}`,
  });

  const printSingleTicket = async (ticketId: number) => {
    try {
      const data = await apiClient.admin.getTicketPrintData(ticketId);
      setPrintData([data]);
      // Wait for next render then trigger print
      setTimeout(() => handlePrint(), 200);
    } catch (e) {
      toast({ title: 'Print error', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const printAllTickets = async () => {
    if (!tickets?.length) return;
    try {
      const all = await Promise.all(
        tickets.map((t) => apiClient.admin.getTicketPrintData(t.id))
      );
      setPrintData(all);
      setTimeout(() => handlePrint(), 200);
    } catch (e) {
      toast({ title: 'Print error', description: (e as Error).message, variant: 'destructive' });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !tickets) {
    return (
      <div className="p-4 text-sm text-red-600">Failed to load truck tickets.</div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">No truck allocations for this order.</div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Truck className="h-4 w-4" />
            Truck Tickets ({tickets.length})
          </div>
          {tickets.length > 1 && (
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={printAllTickets}>
              <Printer className="h-3.5 w-3.5" />
              Print All
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Truck #</TableHead>
              <TableHead>Quantity (L)</TableHead>
              <TableHead>Plate Number</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => {
              const next = NEXT_STATUS[t.ticket_status];
              const prev = PREV_STATUS[t.ticket_status];
              const busy = statusBusy === t.id;

              return (
                <TableRow key={t.id}>
                  <TableCell className="font-semibold">{t.truck_number}</TableCell>
                  <TableCell>{Number(t.quantity_litres).toLocaleString()}</TableCell>
                  <TableCell>{t.plate_number || <span className="text-slate-400">—</span>}</TableCell>
                  <TableCell>
                    {t.driver_name || t.driver_phone ? (
                      <div className="leading-tight">
                        <div>{t.driver_name || <span className="text-slate-400">—</span>}</div>
                        {t.driver_phone && (
                          <div className="text-xs text-slate-500">{t.driver_phone}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLORS[t.ticket_status] || ''}`}
                    >
                      {STATUS_LABELS[t.ticket_status] || t.ticket_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* Status advance button */}
                      {next && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={busy}
                          onClick={() => changeStatus(t.id, next.next)}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                          {next.label}
                        </Button>
                      )}

                      {/* Rollback */}
                      {prev && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-500"
                          disabled={busy}
                          onClick={() => changeStatus(t.id, prev)}
                        >
                          ↩ Undo
                        </Button>
                      )}

                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>

                      {/* Print */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => printSingleTicket(t.id)}
                      >
                        <Printer className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────── */}
      <Dialog open={!!editTicket} onOpenChange={(open) => { if (!open) setEditTicket(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ticket — Truck #{editTicket?.truck_number}</DialogTitle>
            <DialogDescription>
              Update driver details or plate number for this truck allocation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-plate">Plate Number</Label>
              <Input
                id="edit-plate"
                value={editForm.plate_number}
                onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value })}
                placeholder="e.g. ABC-123-XY"
              />
            </div>
            <div>
              <Label htmlFor="edit-driver">Driver Name</Label>
              <Input
                id="edit-driver"
                value={editForm.driver_name}
                onChange={(e) => setEditForm({ ...editForm, driver_name: e.target.value })}
                placeholder="Enter driver name"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Driver Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.driver_phone}
                onChange={(e) => setEditForm({ ...editForm, driver_phone: e.target.value })}
                placeholder="e.g. 08012345678"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTicket(null)}>Cancel</Button>
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

// ── Print template ─────────────────────────────────────────────────────────

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
          <div className="text-xs text-slate-500 mt-1">
            Truck {d.truck_number} of {d.total_trucks}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="mt-6 border border-slate-300 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <PrintRow label="Customer Name" value={d.customer_name} />
          <PrintRow label="Company Name" value={d.company_name} />
          <PrintRow label="Phone" value={d.customer_phone} />
          <PrintRow label="Product" value={d.product_name} />
          <PrintRow label="Quantity" value={`${Number(d.quantity_litres).toLocaleString()} Litres`} />
          <PrintRow label="Plate Number" value={d.plate_number || ''} />
          <PrintRow label="Driver Name" value={d.driver_name || ''} />
          <PrintRow label="Status" value={STATUS_LABELS[d.ticket_status] || d.ticket_status} />
        </div>
      </div>

      {/* Signature lines */}
      <div className="mt-6 space-y-5 text-sm">
        <SigLine label="Loader's Name & Phone No." />
        <SigLine label="Finance Clearance" show />
        <SigLine label="Commercial Manager" show />
        <SigLine label="Depot Manager" show />
        <SigLine label="Dispatch Officer" show />
        <SigLine label="Security" show />
      </div>

      {/* Footer */}
      <div className="mt-10 bg-green-900 px-4 py-3 text-white">
        <div className="flex items-center justify-center gap-2 text-xs">
          <Globe className="h-3 w-3" />
          <span>
            Visit <span className="underline underline-offset-2 font-bold">ordersoroman.com</span> to order fuel online without stress!
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <PhoneCall className="h-3 w-3" />
          <span className="font-bold">07060659524, 08035370741, 08021215027, 08023982277, 08036360577, 08036711324</span>
        </div>
      </div>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 border-t border-slate-300 first:border-t-0 sm:border-t-0 sm:[&:nth-child(n+3)]:border-t sm:border-r sm:[&:nth-child(2n)]:border-r-0">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value || '\u00A0'}</div>
    </div>
  );
}

function SigLine({ label, show }: { label: string; show?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="font-semibold">{label}:</div>
      <div className="flex-1 relative h-5">
        <div className="absolute inset-x-0 bottom-0 border-b border-slate-500" />
        {show && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-200">
            <span className="px-1">Full Name &amp; Signature</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TruckTickets;
