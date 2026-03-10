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
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

// ── Order type (mirrors Orders.tsx) ────────────────────────────────────────

interface Order {
  id: number;
  user: Record<string, unknown>;
  status: string;
  created_at: string;
  state?: string;
  customer_details?: Record<string, unknown>;
  products: Array<{ name?: string }>;
  quantity?: number | string;
  total_price?: string | number;
}

interface OrderResponse {
  count: number;
  results: Order[];
}

// ── Derived contact type ───────────────────────────────────────────────────

interface Contact {
  /** Dedup key – email or phone (lowered/trimmed) */
  key: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  totalOrders: number;
  lastOrderDate: string;
}

// ── Helpers (same logic as Orders.tsx) ─────────────────────────────────────

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

// ── Build deduplicated contacts from orders ────────────────────────────────

function buildContacts(orders: Order[]): Contact[] {
  const map = new Map<string, Contact>();

  for (const o of orders) {
    const email = extractEmail(o);
    const phone = extractPhone(o);

    // Skip orders with no identifiable contact info
    if (!email && !phone) continue;

    // Dedup key: prefer email, fallback to phone
    const key = (email || phone).toLowerCase();

    const existing = map.get(key);
    if (existing) {
      existing.totalOrders += 1;
      // Keep the most recent order date
      if (o.created_at > existing.lastOrderDate) {
        existing.lastOrderDate = o.created_at;
      }
      // Fill in blanks from later orders
      if (!existing.name) existing.name = extractName(o);
      if (!existing.company) existing.company = extractCompany(o);
      if (!existing.phone) existing.phone = phone;
      if (!existing.email) existing.email = email;
      if (!existing.location) existing.location = extractLocation(o);
    } else {
      map.set(key, {
        key,
        name: extractName(o),
        company: extractCompany(o),
        email,
        phone,
        location: extractLocation(o),
        totalOrders: 1,
        lastOrderDate: o.created_at || '',
      });
    }
  }

  // Sort alphabetically by name, then by email
  return Array.from(map.values()).sort((a, b) =>
    (a.name || a.email || a.phone).localeCompare(b.name || b.email || b.phone, undefined, { sensitivity: 'base' }),
  );
}

// ── Component ──────────────────────────────────────────────────────────────

const Customers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  // Fetch ALL orders via paginated loop (same pattern as Orders.tsx)
  const {
    data: contacts,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Contact[]>({
    queryKey: ['customers', 'from-orders'],
    queryFn: async () => {
      const PAGE_SIZE = 200;
      const MAX_PAGES = 5000;
      let page = 1;
      let totalCount = 0;
      const all: Order[] = [];

      while (page <= MAX_PAGES) {
        const res: OrderResponse = await apiClient.admin.getAllAdminOrders({
          page,
          page_size: PAGE_SIZE,
        });

        const results = Array.isArray(res?.results) ? res.results : [];
        totalCount = Number(res?.count ?? totalCount);
        all.push(...results);

        if (results.length < PAGE_SIZE) break;
        if (totalCount && all.length >= totalCount) break;
        page++;
      }

      return buildContacts(all);
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const allContacts = contacts || [];

  // ── Search ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allContacts;
    return allContacts.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q),
    );
  }, [allContacts, searchQuery]);

  // ── Stats ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = filtered.length;
    const withEmail = filtered.filter((c) => c.email).length;
    const withPhone = filtered.filter((c) => c.phone).length;
    const withCompany = filtered.filter((c) => c.company).length;
    return { total, withEmail, withPhone, withCompany };
  }, [filtered]);

  // ── CSV Export ──────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (!filtered.length) return;
    setExporting(true);

    try {
      const headers = [
        'S/N',
        'Name',
        'Company',
        'Email',
        'Phone Number',
        'Location',
        'Total Orders',
        'Last Order',
      ];

      const rows = filtered.map((c, idx) => [
        idx + 1,
        c.name || '-',
        c.company || '-',
        c.email || '-',
        c.phone || '-',
        c.location || '-',
        c.totalOrders,
        c.lastOrderDate ? format(new Date(c.lastOrderDate), 'dd/MM/yyyy') : '-',
      ]);

      const csvContent = [headers, ...rows]
        .map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Customer_Contacts_${format(new Date(), 'dd-MM-yyyy')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            <PageHeader
              title="Customer Contacts"
              description="Contacts extracted from all orders — deduplicated by email / phone. Search and download as CSV."
              actions={
                <Button onClick={exportCSV} disabled={exporting || filtered.length === 0}>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatMini icon={Users} label="Total Contacts" value={stats.total} color="blue" loading={isLoading} />
              <StatMini icon={Mail} label="With Email" value={stats.withEmail} color="green" loading={isLoading} />
              <StatMini icon={Phone} label="With Phone" value={stats.withPhone} color="amber" loading={isLoading} />
              <StatMini icon={Building2} label="With Company" value={stats.withCompany} color="violet" loading={isLoading} />
            </div>

            {/* ── Search ──────────────────────────────────────────────── */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                  <Input
                    type="text"
                    placeholder="Search by name, email, phone, company, or location..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="text-sm text-slate-500 self-center whitespace-nowrap">
                  {isLoading ? '...' : `${filtered.length} contact${filtered.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="[&>th]:py-2.5 [&>th]:px-3">
                    <TableHead className="w-[48px]">S/N</TableHead>
                    <TableHead className="w-[190px]">Name</TableHead>
                    <TableHead className="w-[150px]">Company</TableHead>
                    <TableHead className="w-[230px]">Email</TableHead>
                    <TableHead className="w-[150px]">Phone</TableHead>
                    <TableHead className="w-[110px]">Location</TableHead>
                    <TableHead className="w-[72px] text-center">Orders</TableHead>
                    <TableHead className="w-[100px]">Last Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr>td]:py-2.5 [&>tr>td]:px-3">
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        <div className="text-red-500 space-y-2">
                          <p>{(error as Error)?.message || 'Failed to load orders'}</p>
                          <Button onClick={() => refetch()} size="sm" variant="outline">
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                        {searchQuery.trim()
                          ? 'No contacts match your search'
                          : 'No contacts found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c, idx) => (
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

                        <TableCell className="text-slate-700">
                          {c.company ? (
                            <div className="inline-flex items-center gap-1.5">
                              <Building2 size={12} className="text-slate-400" />
                              <span className="truncate max-w-[130px]">{c.company}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>

                        <TableCell>
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
                        </TableCell>

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
                              <span className="truncate max-w-[90px] capitalize">{c.location}</span>
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

                        <TableCell className="text-slate-600 whitespace-nowrap text-xs">
                          {c.lastOrderDate
                            ? format(new Date(c.lastOrderDate), 'dd/MM/yyyy')
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Footer count */}
              {!isLoading && filtered.length > 0 && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Showing <span className="font-medium text-slate-900">{filtered.length}</span> of{' '}
                  <span className="font-medium text-slate-900">{allContacts.length}</span> contacts
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Small stat card ────────────────────────────────────────────────────────

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

export default Customers;