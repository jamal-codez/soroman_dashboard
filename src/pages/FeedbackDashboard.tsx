//
// FEEDBACK DASHBOARD — staff view. Shows all feedback submissions with
// sort/filter, star ratings, status management, and staff responses.
//
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCards, type SummaryCard } from '@/components/SummaryCards';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search, X, Star, RefreshCw, MessageSquare, CheckCircle2,
  Clock, Archive, Trash2, ChevronDown, Send, Copy,
  Users, ThumbsUp, BarChart2, AlertCircle, Link2, Eye,
  Loader2, MoreHorizontal, Filter,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiClient, type FeedbackEntry } from '@/api/client';
import { useToast } from '@/hooks/use-toast';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy, HH:mm'); }
  catch { return iso; }
};

const AVG = (entries: FeedbackEntry[]) => {
  if (!entries.length) return 0;
  return entries.reduce((s, e) => s + e.rating, 0) / entries.length;
};

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  new:        { label: 'New',       cls: 'bg-blue-50 text-blue-700 border border-blue-200',       icon: <Clock size={11} /> },
  in_review:  { label: 'In Review', cls: 'bg-amber-50 text-amber-700 border border-amber-200',    icon: <Eye size={11} /> },
  resolved:   { label: 'Resolved',  cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle2 size={11} /> },
  dismissed:  { label: 'Dismissed', cls: 'bg-slate-100 text-slate-500 border border-slate-200',   icon: <Archive size={11} /> },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500 border border-slate-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

// ── Star display ───────────────────────────────────────────────────────────

const StarDisplay = ({ rating, size = 14 }: { rating: number; size?: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map(n => (
      <Star
        key={n} size={size}
        className={n <= rating ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-200'}
      />
    ))}
  </div>
);

// ── Category pill ──────────────────────────────────────────────────────────

const CategoryBadge = ({ category }: { category: string }) => (
  <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-md font-medium">
    {category}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────
// Detail / Response Dialog
// ─────────────────────────────────────────────────────────────────────────

const FeedbackDetailDialog = ({
  entry,
  open,
  onClose,
}: {
  entry: FeedbackEntry | null;
  open: boolean;
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [response, setResponse] = useState('');
  const [status, setStatus]     = useState<string>('');

  React.useEffect(() => {
    if (entry) {
      setResponse(entry.staff_response ?? '');
      setStatus(entry.status);
    }
  }, [entry]);

  const mutation = useMutation({
    mutationFn: (data: { status?: string; staff_response?: string }) =>
      apiClient.admin.updateFeedback(entry!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback'] });
      toast({ title: 'Feedback updated', description: 'Changes saved successfully.' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50">
              <MessageSquare className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-base font-semibold">Feedback from {entry.name}</p>
              <p className="text-xs font-normal text-slate-500 mt-0.5">{fmtDate(entry.created_at)}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Full feedback details and response</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Submitter info */}
          <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Name</p><p className="font-medium text-slate-800">{entry.name}</p></div>
            <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Email</p><p className="text-slate-700 break-all">{entry.email}</p></div>
            {entry.phone && <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Phone</p><p className="text-slate-700">{entry.phone}</p></div>}
            {entry.company && <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Company</p><p className="text-slate-700">{entry.company}</p></div>}
            <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Category</p><CategoryBadge category={entry.category} /></div>
            <div><p className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">Rating</p><StarDisplay rating={entry.rating} /></div>
          </div>

          {/* Message */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[11px] uppercase text-slate-400 font-semibold mb-2">Message</p>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{entry.message}</p>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Update Status</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  title={cfg.label}
                  onClick={() => setStatus(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    status === key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cfg.icon}{cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Staff response */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Staff Response / Notes</label>
            <Textarea
              rows={4}
              placeholder="Write a response or internal note…"
              value={response}
              onChange={e => setResponse(e.target.value)}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({ status, staff_response: response })}
            disabled={mutation.isPending}
            className="gap-2 bg-slate-900 hover:bg-slate-800"
          >
            {mutation.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Send size={14} /> Save & Update</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────

export default function FeedbackDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab]               = useState('all');
  const [search, setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ratingFilter, setRatingFilter]     = useState('all');
  const [sortBy, setSortBy]         = useState<'newest' | 'oldest' | 'rating_high' | 'rating_low'>('newest');
  const [selected, setSelected]     = useState<FeedbackEntry | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['feedback'],
    queryFn: () => apiClient.admin.getFeedback({ page_size: 200 }),
    staleTime: 30_000,
  });

  const all: FeedbackEntry[] = data?.results ?? [];

  // ── Delete mutation ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.admin.deleteFeedback(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feedback'] });
      toast({ title: 'Deleted', description: 'Feedback entry removed.' });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // ── Quick status update ──────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiClient.admin.updateFeedback(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
    onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // ── Unique categories ────────────────────────────────────────────
  const uniqueCategories = useMemo(() => {
    const s = new Set(all.map(e => e.category));
    return Array.from(s).sort();
  }, [all]);

  // ── Filtered + sorted ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = all.filter(e => {
      if (tab !== 'all' && e.status !== tab) return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (ratingFilter !== 'all' && String(e.rating) !== ratingFilter) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${e.name} ${e.email} ${e.company ?? ''} ${e.message} ${e.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'newest')      return b.created_at.localeCompare(a.created_at);
      if (sortBy === 'oldest')      return a.created_at.localeCompare(b.created_at);
      if (sortBy === 'rating_high') return b.rating - a.rating;
      if (sortBy === 'rating_low')  return a.rating - b.rating;
      return 0;
    });

    return list;
  }, [all, tab, categoryFilter, ratingFilter, search, sortBy]);

  // ── Summary cards ────────────────────────────────────────────────
  const cards = useMemo((): SummaryCard[] => {
    const total     = all.length;
    const newCount  = all.filter(e => e.status === 'new').length;
    const resolved  = all.filter(e => e.status === 'resolved').length;
    const avg       = AVG(all);
    const positive  = all.filter(e => e.rating >= 4).length;
    const negative  = all.filter(e => e.rating <= 2).length;
    return [
      { title: 'Total Responses',  value: String(total),               icon: <MessageSquare size={20} />, tone: 'neutral' },
      { title: 'New / Unread',     value: String(newCount),            icon: <AlertCircle size={20} />,   tone: newCount > 0 ? 'amber' : 'neutral' },
      { title: 'Resolved',         value: String(resolved),            icon: <CheckCircle2 size={20} />,  tone: 'green' },
      { title: 'Avg. Rating',      value: avg > 0 ? avg.toFixed(1) + ' / 5' : '—', icon: <Star size={20} />, tone: avg >= 4 ? 'green' : avg >= 3 ? 'amber' : avg > 0 ? 'red' : 'neutral' },
      { title: 'Positive (4–5★)',  value: String(positive),            icon: <ThumbsUp size={20} />,      tone: 'green' },
      { title: 'Negative (1–2★)',  value: String(negative),            icon: <BarChart2 size={20} />,     tone: negative > 0 ? 'red' : 'neutral' },
    ];
  }, [all]);

  // ── Share link ───────────────────────────────────────────────────
  const feedbackUrl = `${window.location.origin}/feedback`;
  const copyLink = () => {
    navigator.clipboard.writeText(feedbackUrl);
    toast({ title: 'Link copied!', description: 'Share this link with customers to collect feedback.' });
  };

  const tabCounts: Record<string, number> = {
    all:       all.length,
    new:       all.filter(e => e.status === 'new').length,
    in_review: all.filter(e => e.status === 'in_review').length,
    resolved:  all.filter(e => e.status === 'resolved').length,
    dismissed: all.filter(e => e.status === 'dismissed').length,
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1400px] mx-auto space-y-5">

            {/* Header */}
            <PageHeader
              title="Feedback & Reviews"
              description="Customer feedback submissions — review, respond, and take action."
              actions={
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={copyLink}>
                    <Copy size={14} /> Copy Form Link
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open('/feedback', '_blank')}>
                    <Link2 size={14} /> Open Form
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
                  </Button>
                </div>
              }
            />

            {/* Share banner */}
            <div className="bg-slate-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-white text-sm font-semibold">Collect Feedback from Customers</p>
                <p className="text-slate-400 text-xs mt-0.5">Share this link via WhatsApp, email or SMS — no login needed.</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                <span className="text-slate-300 text-xs font-mono">{feedbackUrl}</span>
                <button title="Copy link" onClick={copyLink} className="text-slate-400 hover:text-white transition-colors ml-1">
                  <Copy size={14} />
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <SummaryCards cards={cards} />

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <Input
                  placeholder="Search by name, email, company, message…"
                  className="pl-9 h-10 bg-slate-50"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button title="Clear search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Tabs + dropdowns */}
              <div className="flex flex-wrap items-center gap-3">
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="h-9">
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'new', label: 'New' },
                      { key: 'in_review', label: 'In Review' },
                      { key: 'resolved', label: 'Resolved' },
                      { key: 'dismissed', label: 'Dismissed' },
                    ].map(({ key, label }) => (
                      <TabsTrigger key={key} value={key} className="text-xs gap-1.5">
                        {label}
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                          {tabCounts[key] ?? 0}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="flex flex-wrap gap-2 ml-auto items-center">
                  {/* Category */}
                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="all">All Categories</option>
                    {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Rating */}
                  <select
                    aria-label="Filter by rating"
                    value={ratingFilter}
                    onChange={e => setRatingFilter(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="all">All Ratings</option>
                    <option value="5">★★★★★ 5 Stars</option>
                    <option value="4">★★★★☆ 4 Stars</option>
                    <option value="3">★★★☆☆ 3 Stars</option>
                    <option value="2">★★☆☆☆ 2 Stars</option>
                    <option value="1">★☆☆☆☆ 1 Star</option>
                  </select>

                  {/* Sort */}
                  <select
                    aria-label="Sort by"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="rating_high">Highest Rating</option>
                    <option value="rating_low">Lowest Rating</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  <Filter size={12} className="inline mr-1" />
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} shown
                </p>
                {(search || categoryFilter !== 'all' || ratingFilter !== 'all') && (
                  <button
                    onClick={() => { setSearch(''); setCategoryFilter('all'); setRatingFilter('all'); }}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <X size={12} /> Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Feedback cards */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              </div>
            ) : isError ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <AlertCircle className="mx-auto text-red-300 mb-3" size={40} />
                <p className="text-slate-600 font-medium">Failed to load feedback</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try Again</Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <MessageSquare className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="text-slate-500 font-medium">No feedback found</p>
                <p className="text-sm text-slate-400 mt-1">
                  {all.length > 0 ? 'Try adjusting your filters.' : 'No submissions yet — share the feedback form link to get started.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(entry => {
                  const cfg = STATUS_CONFIG[entry.status];
                  return (
                    <div
                      key={entry.id}
                      className={`bg-white rounded-xl border shadow-sm p-5 transition-all hover:shadow-md ${
                        entry.status === 'new' ? 'border-blue-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap gap-4 items-start justify-between">

                        {/* Left: info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{entry.name}</p>
                            {entry.company && (
                              <span className="text-xs text-slate-500">· {entry.company}</span>
                            )}
                            <StatusBadge status={entry.status} />
                            <CategoryBadge category={entry.category} />
                          </div>

                          <div className="flex items-center gap-3">
                            <StarDisplay rating={entry.rating} />
                            <span className="text-xs text-slate-400">{fmtDate(entry.created_at)}</span>
                          </div>

                          <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                            {entry.message}
                          </p>

                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>{entry.email}</span>
                            {entry.phone && <span>· {entry.phone}</span>}
                          </div>

                          {entry.staff_response && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-1">
                              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Staff Response</p>
                              <p className="text-xs text-slate-700 line-clamp-2">{entry.staff_response}</p>
                            </div>
                          )}
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Quick status change */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                                {cfg?.icon} {cfg?.label ?? entry.status}
                                <ChevronDown size={12} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {Object.entries(STATUS_CONFIG).map(([key, c]) => (
                                <DropdownMenuItem
                                  key={key}
                                  onClick={() => statusMutation.mutate({ id: entry.id, status: key })}
                                  className={`text-xs gap-2 ${entry.status === key ? 'font-semibold' : ''}`}
                                >
                                  {c.icon} {c.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {/* Open full dialog */}
                          <Button
                            size="sm"
                            className="gap-1.5 text-xs h-8 bg-slate-900 hover:bg-slate-800"
                            onClick={() => setSelected(entry)}
                          >
                            <MessageSquare size={13} /> Respond
                          </Button>

                          {/* Delete */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete this entry"
                            onClick={() => {
                              if (confirm('Delete this feedback entry? This cannot be undone.')) {
                                deleteMutation.mutate(entry.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLoading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 text-right">
                Showing {filtered.length} of {all.length} total submissions
              </p>
            )}

          </div>
        </div>
      </div>

      <FeedbackDetailDialog
        entry={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
