import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  Search,
  Users,
  Mail,
  Phone,
  Building2,
  Loader2,
  PhoneOutgoingIcon,
  MapPin,
  ShoppingCart,
  Truck,
  Package,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Regular order (from online pickup/delivery) */
interface Order {
  id: number;
  user: Record<string, unknown>;
  status: string;
  created_at: string;
  state?: string;
  release_type?: 'pickup' | 'delivery';
  customer_details?: Record<string, unknown>;
  products: Array<{ name?: string }>;
  quantity?: number | string;
  total_price?: string | number;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

/** In-house order (consignment / delivery order) */
interface InHouseOrder {
  id: number;
  status: string;
  created_at: string;
  sold_to_name?: string;
  sold_to_phone?: string;
  delivery_address?: string;
  destination_state?: string;
  destination_town?: string;
  customer_name?: string;
  customer_phone?: string;
  products?: Array<{ name?: string }>;
  quantity?: number | string;
  total_price?: string | number;
  sold_at?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    company_name?: string;
    companyName?: string;
  };
}

interface InHouseOrderResponse {
  count: number;
  results: InHouseOrder[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Derived contact type
// ═══════════════════════════════════════════════════════════════════════════

interface Contact {
  /** Dedup key — phone or name (lowered/trimmed) */
  key: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  totalOrders: number;
  lastOrderDate: string;
  /** Where this contact came from */
  source: 'in-house' | 'delivery' | 'both';
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — extract from regular delivery orders
// ═══════════════════════════════════════════════════════════════════════════

const extractName = (o: Order): string => {
  const cd = o.customer_details as Record<string, unknown> | undefined;
  const user = o.user as Record<string, unknown> | undefined;
  const cdName = cd && typeof cd.name === 'string' ? cd.name : '';
  if (cdName) return cdName;
  const first = user && typeof user.first_name === 'string' ? user.first_name : '';
  const last = user && typeof user.last_name === 'string' ? user.last_name : '';
  return [first, last].filter(Boolean).join(' ').trim();
};

const extractCompany = (o: Order): string => {
  const cd = o.customer_details as Record<string, unknown> | undefined;
  const user = o.user as Record<string, unknown> | undefined;
  return (
    (cd && typeof cd.companyName === 'string' ? cd.companyName : '') ||
    (user && typeof user.companyName === 'string' ? user.companyName : '') ||
    (user && typeof user.company_name === 'string' ? user.company_name : '') ||
    ''
  );
};

const extractPhone = (o: Order): string => {
  const cd = o.customer_details as Record<string, unknown> | undefined;
  const user = o.user as Record<string, unknown> | undefined;
  return (
    (cd && typeof cd.phone === 'string' ? cd.phone : '') ||
    (user && typeof user.phone_number === 'string' ? user.phone_number : '') ||
    (user && typeof user.phone === 'string' ? user.phone : '') ||
    ''
  ).trim();
};

const extractEmail = (o: Order): string => {
  const cd = o.customer_details as Record<string, unknown> | undefined;
  const user = o.user as Record<string, unknown> | undefined;
  return (
    (cd && typeof cd.email === 'string' ? cd.email : '') ||
    (user && typeof user.email === 'string' ? user.email : '') ||
    ''
  ).trim();
};

const extractLocation = (o: Order): string => (o.state ?? '').trim();

// ═══════════════════════════════════════════════════════════════════════════
// Build deduplicated contacts from both data sources
// ═══════════════════════════════════════════════════════════════════════════

function upsert(
  map: Map<string, Contact>,
  key: string,
  name: string,
  company: string,
  email: string,
  phone: string,
  location: string,
  date: string,
  source: 'in-house' | 'delivery',
) {
  const existing = map.get(key);
  if (existing) {
    existing.totalOrders += 1;
    if (date > existing.lastOrderDate) existing.lastOrderDate = date;
    if (!existing.name) existing.name = name;
    if (!existing.company) existing.company = company;
    if (!existing.phone) existing.phone = phone;
    if (!existing.email) existing.email = email;
    if (!existing.location) existing.location = location;
    if (existing.source !== source) existing.source = 'both';
  } else {
    map.set(key, {
      key,
      name,
      company,
      email,
      phone,
      location,
      totalOrders: 1,
      lastOrderDate: date || '',
      source,
    });
  }
}

function buildContacts(
  deliveryOrders: Order[],
  inHouseOrders: InHouseOrder[],
): Contact[] {
  const map = new Map<string, Contact>();

  // ── 1. In-house orders — buyers (sold_to_name / sold_to_phone) ────────
  for (const o of inHouseOrders) {
    const name = (o.sold_to_name || o.customer_name || '').trim();
    const phone = (o.sold_to_phone || o.customer_phone || '').trim();
    const address = (o.delivery_address || '').trim();
    const destState = (o.destination_state || '').trim();
    const destTown = (o.destination_town || '').trim();
    const location = address || [destState, destTown].filter(Boolean).join(', ');

    // Skip if no identifiable info at all
    if (!name && !phone) continue;

    const key = (phone || name).toLowerCase().replace(/\s+/g, ' ');
    const date = o.sold_at || o.created_at || '';

    upsert(map, key, name, '', '', phone, location, date, 'in-house');
  }

  // ── 2. Regular delivery orders (release_type === 'delivery') ──────────
  for (const o of deliveryOrders) {
    const name = extractName(o);
    const phone = extractPhone(o);
    const email = extractEmail(o);
    const company = extractCompany(o);
    const location = extractLocation(o);

    if (!email && !phone && !name) continue;

    const key = (phone || email || name).toLowerCase().replace(/\s+/g, ' ');
    const date = o.created_at || '';

    upsert(map, key, name, company, email, phone, location, date, 'delivery');
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.name || a.phone || a.email).localeCompare(b.name || b.phone || b.email, undefined, {
      sensitivity: 'base',
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

const BuyersList = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'in-house' | 'delivery'>('all');
  const [exporting, setExporting] = useState(false);

  // ── Fetch in-house orders ──────────────────────────────────────────────
  const inHouseQuery = useQuery<InHouseOrder[]>({
    queryKey: ['buyers-list', 'in-house'],
    queryFn: async () => {
      const PAGE_SIZE = 200;
      const MAX_PAGES = 50;
      let page = 1;
      const all: InHouseOrder[] = [];

      while (page <= MAX_PAGES) {
        const res: InHouseOrderResponse = await apiClient.admin.getInHouseOrders({
          page,
          page_size: PAGE_SIZE,
        });
        const results = Array.isArray(res?.results) ? res.results : [];
        all.push(...results);
        if (results.length < PAGE_SIZE) break;
        if (res.count && all.length >= res.count) break;
        page++;
      }

      return all;
    },
    staleTime: 60_000,
  });

  // ── Fetch delivery orders (regular orders with release_type = delivery) ─
  const deliveryQuery = useQuery<Order[]>({
    queryKey: ['buyers-list', 'delivery-orders'],
    queryFn: async () => {
      const PAGE_SIZE = 200;
      const MAX_PAGES = 50;
      let page = 1;
      const all: Order[] = [];

      while (page <= MAX_PAGES) {
        const res: OrderResponse = await apiClient.admin.getAllAdminOrders({
          page,
          page_size: PAGE_SIZE,
        });
        const results = Array.isArray(res?.results) ? res.results : [];
        all.push(...results);
        if (results.length < PAGE_SIZE) break;
        if (res.count && all.length >= res.count) break;
        page++;
      }

      // Only keep orders that are delivery type
      return all.filter(o => o.release_type === 'delivery');
    },
    staleTime: 60_000,
  });

  const isLoading = inHouseQuery.isLoading || deliveryQuery.isLoading;
  const isError = inHouseQuery.isError || deliveryQuery.isError;
  const error = inHouseQuery.error || deliveryQuery.error;

  const refetch = () => {
    inHouseQuery.refetch();
    deliveryQuery.refetch();
  };

  // ── Build contacts ────────────────────────────────────────────────────
  const allContacts = useMemo(() => {
    const deliveryOrders = deliveryQuery.data || [];
    const inHouseOrders = inHouseQuery.data || [];
    return buildContacts(deliveryOrders, inHouseOrders);
  }, [deliveryQuery.data, inHouseQuery.data]);

  // ── Search + Source filter ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allContacts;

    if (sourceFilter !== 'all') {
      list = list.filter(c => c.source === sourceFilter || c.source === 'both');
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q),
      );
    }

    return list;
  }, [allContacts, searchQuery, sourceFilter]);

  // ── Stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filtered.length;
    const withPhone = filtered.filter(c => c.phone).length;
    const fromInHouse = filtered.filter(c => c.source === 'in-house' || c.source === 'both').length;
    const fromDelivery = filtered.filter(c => c.source === 'delivery' || c.source === 'both').length;
    return { total, withPhone, fromInHouse, fromDelivery };
  }, [filtered]);

  // ── Excel Export ──────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!filtered.length) return;
    setExporting(true);
    try {
      const rows = filtered.map((c, idx) => ({
        'S/N': idx + 1,
        'Name': c.name || '—',
        'Company': c.company || '—',
        'Email': c.email || '—',
        'Phone Number': c.phone || '—',
        'Location': c.location || '—',
        'Total Orders': c.totalOrders,
        'Source': c.source === 'both' ? 'In-House & Delivery' : c.source === 'in-house' ? 'In-House' : 'Delivery',
        'Last Order': c.lastOrderDate ? format(new Date(c.lastOrderDate), 'dd/MM/yyyy') : '—',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Buyers List');
      XLSX.writeFile(wb, `BUYERS-LIST-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  // ── Source label helper ───────────────────────────────────────────────
  const sourceLabel = (s: Contact['source']) => {
    switch (s) {
      case 'in-house': return { text: 'In-House', cls: 'text-purple-700 bg-purple-50' };
      case 'delivery': return { text: 'Delivery', cls: 'text-blue-700 bg-blue-50' };
      case 'both': return { text: 'Both', cls: 'text-emerald-700 bg-emerald-50' };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Delivery Customers"
              description="All buyers from delivery orders for record keeping"
              actions={
                <Button onClick={exportExcel} disabled={exporting || filtered.length === 0}>
                  {exporting ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1" size={16} />
                  )}
                  Download Contacts
                </Button>
              }
            />

            {/* ── Stat cards ──────────────────────────────────────────── */}
            {/* <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
              <StatMini icon={Users} label="Total Buyers" value={stats.total} color="blue" loading={isLoading} />
              <StatMini icon={Phone} label="Active Phone" value={stats.withPhone} color="amber" loading={isLoading} />
              <StatMini icon={Package} label="From In-House" value={stats.fromInHouse} color="violet" loading={isLoading} />
              <StatMini icon={Truck} label="From Delivery" value={stats.fromDelivery} color="green" loading={isLoading} />
            </div> */}

            {/* ── Search + Filter ─────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search by name, email, phone, company, or location..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                {/* <select
                  aria-label="Filter by source"
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value as 'all' | 'in-house' | 'delivery')}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-[180px]"
                >
                  <option value="all">All Sources</option>
                  <option value="in-house">In-House Only</option>
                  <option value="delivery">Delivery Only</option>
                </select>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '...' : `${filtered.length} buyer${filtered.length !== 1 ? 's' : ''}`}
                </div> */}
              </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="[&>th]:py-2.5 [&>th]:px-3">
                    <TableHead className="w-[48px]">S/N</TableHead>
                    <TableHead className="w-[190px]">Name</TableHead>
                    {/* <TableHead className="w-[150px]">Company</TableHead> */}
                    {/* <TableHead className="w-[230px]">Email</TableHead> */}
                    <TableHead className="w-[150px]">Phone</TableHead>
                    <TableHead className="w-[130px]">Location</TableHead>
                    <TableHead className="w-[72px] text-center">Orders</TableHead>
                    {/* <TableHead className="w-[90px]">Source</TableHead> */}
                    <TableHead className="w-[100px]">Last Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr>td]:py-2.5 [&>tr>td]:px-3">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        {/* <TableCell><Skeleton className="h-4 w-24" /></TableCell> */}
                        {/* <TableCell><Skeleton className="h-4 w-44" /></TableCell> */}
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                        {/* <TableCell><Skeleton className="h-4 w-16" /></TableCell> */}
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12">
                        <div className="text-red-500 space-y-2">
                          <p>{(error as Error)?.message || 'Failed to load data'}</p>
                          <Button onClick={refetch} size="sm" variant="outline">
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                        {searchQuery.trim()
                          ? 'No buyers match your search'
                          : 'No buyers found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c, idx) => {
                      const src = sourceLabel(c.source);
                      return (
                        <TableRow key={c.key}>
                          <TableCell className="text-slate-500">{idx + 1}</TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                {(c.name.split(' ')[0]?.[0] || '').toUpperCase()}
                                {(c.name.split(' ')[1]?.[0] || '').toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 capitalize">
                                {c.name || '—'}
                              </span>
                            </div>
                          </TableCell>

                          {/* <TableCell className="text-slate-700">
                            {c.company ? (
                              <div className="inline-flex items-center gap-1.5">
                                <Building2 size={12} className="text-slate-400" />
                                <span className="truncate max-w-[130px]">{c.company}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell> */}

                          {/* <TableCell>
                            {c.email ? (
                              <a
                                href={`mailto:${c.email}`}
                                className="inline-flex items-center gap-1.5 text-blue-700 hover:underline underline-offset-2 text-sm truncate max-w-[220px]"
                                title={c.email}
                              >
                                <Mail size={12} className="text-blue-500 shrink-0" />
                                {c.email}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell> */}

                          <TableCell>
                            {c.phone ? (
                              <a
                                href={`tel:${c.phone}`}
                                className="inline-flex items-center gap-1.5 font-medium text-slate-900 hover:underline"
                                title="Call"
                              >
                                <PhoneOutgoingIcon size={12} className="text-green-600 shrink-0" />
                                {c.phone}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-slate-600">
                            {c.location ? (
                              <div className="inline-flex items-center gap-1.5">
                                <MapPin size={12} className="text-slate-400 shrink-0" />
                                <span className="max-w-[110px] capitalize">{c.location}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                              <ShoppingCart size={12} className="text-slate-400" />
                              {c.totalOrders}
                            </span>
                          </TableCell>

                          {/* <TableCell>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${src.cls}`}>
                              {src.text}
                            </span>
                          </TableCell> */}

                          <TableCell className="text-slate-600 whitespace-nowrap text-xs">
                            {c.lastOrderDate
                              ? format(new Date(c.lastOrderDate), 'dd/MM/yyyy')
                              : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Footer count */}
              {/* {!isLoading && filtered.length > 0 && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Showing <span className="font-medium text-slate-900">{filtered.length}</span> of{' '}
                  <span className="font-medium text-slate-900">{allContacts.length}</span> buyers
                </div>
              )} */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Small stat card (same as Customers.tsx)
// ═══════════════════════════════════════════════════════════════════════════

function StatMini({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'violet';
  loading?: boolean;
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  const iconColorMap = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    violet: 'bg-violet-100 text-violet-600',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium opacity-80">{label}</div>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${iconColorMap[color]}`}>
          <Icon size={14} />
        </span>
      </div>
      <div className="mt-1 text-xl font-bold">
        {loading ? <Skeleton className="h-6 w-12" /> : value.toLocaleString()}
      </div>
    </div>
  );
}

export default BuyersList;
