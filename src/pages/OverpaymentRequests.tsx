import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeftRight, CheckCircle2, Ban, Clock, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

type OvpRequest = {
  id: number;
  source_order_id: number;
  source_order_reference?: string;
  target_order_id: number;
  target_order_reference?: string;
  amount: string;
  narration?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by_name?: string;
  created_at: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export default function OverpaymentRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userRole = parseInt(localStorage.getItem('role') || '-1');
  const canAct = userRole === 0 || userRole === 1 || userRole === 8;

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [search, setSearch] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['overpayment-requests', 'all'],
    queryFn: () => apiClient.admin.listOverpaymentRequests(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const allRequests: OvpRequest[] = (requestsQuery.data?.results ?? []) as OvpRequest[];

  const filtered = allRequests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const src = (r.source_order_reference ?? String(r.source_order_id)).toLowerCase();
      const tgt = (r.target_order_reference ?? String(r.target_order_id)).toLowerCase();
      const by = (r.requested_by_name ?? '').toLowerCase();
      if (!src.includes(q) && !tgt.includes(q) && !by.includes(q)) return false;
    }
    return true;
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.approveOverpaymentRequest(id),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['overpayment-requests'] });
      toast({ title: 'Transfer approved', description: 'The overpayment has been transferred successfully.' });
    },
    onError: (err: Error) => toast({ title: 'Approval failed', description: err.message, variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiClient.admin.rejectOverpaymentRequest(id, reason),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['overpayment-requests'] });
      toast({ title: 'Request rejected' });
      setRejectingId(null);
      setRejectReason('');
    },
    onError: (err: Error) => toast({ title: 'Rejection failed', description: err.message, variant: 'destructive' }),
  });

  const pending = allRequests.filter(r => r.status === 'pending').length;
  const approved = allRequests.filter(r => r.status === 'approved').length;
  const rejected = allRequests.filter(r => r.status === 'rejected').length;

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">

            <PageHeader
              title="Overpayment Transfer Requests"
              description="Review, approve or reject requests to transfer overpayments between orders."
            />

            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Pending', count: pending, color: 'bg-amber-50 border-amber-200 text-amber-800' },
                { label: 'Approved', count: approved, color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                { label: 'Rejected', count: rejected, color: 'bg-red-50 border-red-200 text-red-700' },
              ].map(({ label, count, color }) => (
                <div key={label} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold ${color}`}>
                  {label}: <span className="text-lg font-bold">{count}</span>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <Input
                  placeholder="Search by order ref or requester…"
                  className="pl-9 h-9 text-sm bg-slate-50 border-slate-200"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-all ${
                      statusFilter === s
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">#</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">From Order</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">To Order</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap text-right">Amount (₦)</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Narration</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Requested By</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Date Requested</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700 whitespace-nowrap">Reviewed By</TableHead>
                      {canAct && <TableHead className="w-40" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsQuery.isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={canAct ? 10 : 9}><Skeleton className="h-9 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : requestsQuery.isError ? (
                      <TableRow>
                        <TableCell colSpan={canAct ? 10 : 9} className="py-10 text-center text-red-600 text-sm">
                          Failed to load requests.
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canAct ? 10 : 9} className="py-12 text-center text-slate-400 text-sm">
                          No transfer requests found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((req, idx) => (
                        <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="text-slate-400 text-xs">{idx + 1}</TableCell>
                          <TableCell className="whitespace-nowrap font-semibold font-mono text-slate-800 text-sm">
                            {req.source_order_reference ?? `#${req.source_order_id}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-semibold font-mono text-slate-800 text-sm">
                            {req.target_order_reference ?? `#${req.target_order_id}`}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-800 whitespace-nowrap">
                            {parseFloat(req.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm max-w-[200px]">
                            {req.narration || <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-slate-700">
                            {req.requested_by_name || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-slate-500">
                            {format(new Date(req.created_at), 'dd MMM yyyy, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLE[req.status]}`}>
                              {req.status}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-slate-500">
                            {req.reviewed_by_name
                              ? <>{req.reviewed_by_name}{req.reviewed_at && <div className="text-slate-400">{format(new Date(req.reviewed_at), 'dd MMM yyyy')}</div>}</>
                              : <span className="text-slate-300">—</span>}
                          </TableCell>
                          {canAct && (
                            <TableCell>
                              {req.status === 'pending' && (
                                <div className="flex gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate(req.id)}
                                  >
                                    <CheckCircle2 size={12} /> Approve
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-3 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                                    onClick={() => { setRejectingId(req.id); setRejectReason(''); }}
                                  >
                                    <Ban size={12} /> Reject
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Reject confirmation dialog */}
      <Dialog open={rejectingId !== null} onOpenChange={(v) => { if (!v) { setRejectingId(null); setRejectReason(''); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-950">
              <Ban size={16} className="text-red-500" /> Reject Transfer Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Reason <span className="font-normal text-slate-400">(optional)</span></label>
            <Input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection"
              className="h-10 border-slate-300"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2 bg-red-600 hover:bg-red-700"
              disabled={rejectMutation.isPending}
              onClick={() => rejectingId !== null && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
            >
              {rejectMutation.isPending ? 'Rejecting…' : <><Ban size={13} /> Confirm Reject</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
