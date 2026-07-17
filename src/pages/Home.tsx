/**
 * Home — the role-based landing dashboard. Instead of dropping every role
 * onto a raw order list, each role gets a small "what needs my attention
 * right now" snapshot here, then navigates into their operational pages
 * (Security Clearance, Verify Payments, etc.) to actually act.
 *
 * Rolled out one role at a time — see the switch in RoleHome below. Roles
 * without a dedicated snapshot yet fall through to their existing landing
 * page so nothing breaks mid-rollout.
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, CircleCheck, Truck, ArrowRight, ClipboardList, FileClock, Wallet, Users, ShoppingCart, UserPlus, Banknote, Package, Fuel, History } from 'lucide-react';
import { apiClient } from '@/api/client';
import { getCurrentUserRoles, ROLES, fallbackWorkspaceForRole } from '@/roles';
import { useEffect } from 'react';
import { DashboardOverviewContent } from '@/pages/Index';
import { formatDistanceToNow } from 'date-fns';

// Each task key maps to an icon + where clicking it should take the user to
// clear it. `informational: true` means a high count is a good thing (e.g.
// trucks already cleared today) — it should never render as "pending".
// `format` renders count as ₦-prefixed money or a litres-suffixed number
// instead of a plain integer.
const TASK_META: Record<string, { icon: typeof Truck; path: string; informational?: boolean; format?: 'currency' | 'litres' }> = {
  trucks_waiting_exit: { icon: Truck, path: '/security' },
  report_pending: { icon: FileClock, path: '/my-report' },
  trucks_cleared_today: { icon: ClipboardList, path: '/security-report', informational: true },
  pending_payments: { icon: FileClock, path: '/payment-verify' },
  today_revenue: { icon: Wallet, path: '/confirmed-payments', informational: true, format: 'currency' },
  customers_awaiting: { icon: Users, path: '/payment-verify' },
  todays_orders: { icon: ShoppingCart, path: '/sales-manager-view', informational: true },
  new_customers: { icon: UserPlus, path: '/customers', informational: true },
  customers_waiting: { icon: Users, path: '/sales-manager-view' },
  orders_awaiting_commission: { icon: FileClock, path: '/commissions' },
  commission_due: { icon: Banknote, path: '/commissions', format: 'currency' },
  paid_today: { icon: CircleCheck, path: '/commissions', informational: true, format: 'currency' },
  orders_waiting: { icon: FileClock, path: '/product-manager-view' },
  loading_queue: { icon: Package, path: '/product-manager-view' },
  pfi_balance: { icon: Fuel, path: '/product-manager-view', informational: true, format: 'litres' },
};

const fmtTaskValue = (count: number, format?: 'currency' | 'litres') => {
  if (format === 'currency') return `₦${count.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  if (format === 'litres') return `${count.toLocaleString('en-NG', { maximumFractionDigits: 0 })} L`;
  return String(count);
};

function TaskCards({ tasks, loading }: { tasks: Array<{ key: string; label: string; count: number }>; loading: boolean }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {tasks.map((t) => {
        const meta = TASK_META[t.key];
        const Icon = meta?.icon ?? ClipboardList;
        const pending = !meta?.informational && t.count > 0;
        const done = !meta?.informational && t.count === 0;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => meta && navigate(meta.path)}
            className="group text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ring-1 ${
                pending ? 'bg-amber-50 ring-amber-100' : done ? 'bg-emerald-50 ring-emerald-100' : 'bg-blue-50 ring-blue-100'
              }`}>
                {done ? <CircleCheck size={18} className="text-emerald-700" /> : <Icon size={18} className={pending ? 'text-amber-700' : 'text-blue-700'} />}
              </div>
              <ArrowRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
            </div>
            <div className="mt-4 text-xs uppercase tracking-[0.05em] text-slate-500 font-medium">
              {t.label}
            </div>
            <div className={`text-[28px] font-bold tracking-[-0.02em] leading-[1.05] break-all ${done ? 'text-emerald-600' : 'text-slate-950'}`}>
              {fmtTaskValue(t.count, meta?.format)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SecurityHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['security-home-summary'],
    queryFn: () => apiClient.admin.getSecurityHomeSummary(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Today's Tasks" description="What needs your attention right now." />

      <TaskCards tasks={data?.tasks ?? []} loading={isLoading} />

      <button
        type="button"
        onClick={() => navigate('/security')}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search size={16} />
        Search order, truck, or reference…
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Exits</h2>
          <button type="button" onClick={() => navigate('/security-report')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : (data?.recent_exits ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No trucks exited yet today.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.recent_exits ?? []).map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="p-1.5 rounded-lg bg-emerald-50 shrink-0"><Truck size={14} className="text-emerald-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.order_ref}</p>
                  <p className="text-xs text-slate-400 font-mono truncate">{r.truck_no}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">{Number(r.quantity_litres).toLocaleString()} L</p>
                  <p className="text-xs text-slate-400">{new Date(r.exit_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FinanceHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['finance-home-summary'],
    queryFn: () => apiClient.admin.getFinanceHomeSummary(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Today's Tasks" description="What needs your attention right now." />

      <TaskCards tasks={data?.tasks ?? []} loading={isLoading} />

      <button
        type="button"
        onClick={() => navigate('/payment-verify')}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search size={16} />
        Search order, customer, or reference…
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Latest Payments</h2>
          <button type="button" onClick={() => navigate('/confirmed-payments')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : (data?.latest_payments ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No payments recorded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.latest_payments ?? []).map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="p-1.5 rounded-lg bg-blue-50 shrink-0"><Wallet size={14} className="text-blue-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.order_ref}</p>
                  <p className="text-xs text-slate-400 truncate">{p.payer_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">₦{Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{p.payment_date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ORDER_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  released: 'bg-purple-50 text-purple-700 border-purple-200',
  loaded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sold: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function SalesManagerHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['sales-manager-home-summary'],
    queryFn: () => apiClient.admin.getSalesManagerHomeSummary(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Today's Tasks" description="What needs your attention right now." />

      <TaskCards tasks={data?.tasks ?? []} loading={isLoading} />

      <button
        type="button"
        onClick={() => navigate('/sales-manager-view')}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search size={16} />
        Search order, customer, or reference…
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Orders</h2>
          <button type="button" onClick={() => navigate('/sales-manager-view')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : (data?.recent_orders ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No orders yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.recent_orders ?? []).map((o, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="p-1.5 rounded-lg bg-slate-50 shrink-0"><ShoppingCart size={14} className="text-slate-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{o.order_ref}</p>
                  <p className="text-xs text-slate-400 truncate">{o.company_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">{o.quantity.toLocaleString()} L</p>
                  <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${ORDER_STATUS_STYLE[o.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommissionOfficerHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['commission-officer-home-summary'],
    queryFn: () => apiClient.admin.getCommissionOfficerHomeSummary(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Today's Tasks" description="What needs your attention right now." />

      <TaskCards tasks={data?.tasks ?? []} loading={isLoading} />

      <button
        type="button"
        onClick={() => navigate('/commissions')}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search size={16} />
        Search order, customer, or reference…
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Paid Today</h2>
          <button type="button" onClick={() => navigate('/commissions')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : (data?.recent_paid ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No commission paid out yet today.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.recent_paid ?? []).map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="p-1.5 rounded-lg bg-emerald-50 shrink-0"><Banknote size={14} className="text-emerald-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.order_ref}</p>
                  <p className="text-xs text-slate-400 truncate">{p.company_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">₦{Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{new Date(p.paid_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductManagerHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['product-manager-home-summary'],
    queryFn: () => apiClient.admin.getProductManagerHomeSummary(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Today's Tasks" description="What needs your attention right now." />

      <TaskCards tasks={data?.tasks ?? []} loading={isLoading} />

      <button
        type="button"
        onClick={() => navigate('/product-manager-view')}
        className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <Search size={16} />
        Search order, PFI, or reference…
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Low Stock PFIs</h2>
          <button type="button" onClick={() => navigate('/pfi')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : (data?.low_stock_pfis ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No PFIs running low right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data?.low_stock_pfis ?? []).map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                <div className="p-1.5 rounded-lg bg-amber-50 shrink-0"><Fuel size={14} className="text-amber-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.pfi_number}</p>
                  <p className="text-xs text-slate-400 truncate">{p.location_name || '—'}</p>
                </div>
                <p className="text-sm font-bold text-amber-700 shrink-0">{Number(p.balance).toLocaleString()} L</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// One compact section per role, each with its own task cards and a link
// into that role's full workspace — an admin sees everything at a glance
// instead of paging through every role's dashboard individually.
function DashboardSection({ title, path, navigate, tasks, loading }: {
  title: string;
  path: string;
  navigate: ReturnType<typeof useNavigate>;
  tasks: Array<{ key: string; label: string; count: number }>;
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <button type="button" onClick={() => navigate(path)} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
          Open workspace <ArrowRight size={12} />
        </button>
      </div>
      <TaskCards tasks={tasks} loading={loading} />
    </div>
  );
}

// Human-friendly label for an AuditLog action code, e.g. "PAYMENT_CONFIRMED" → "Payment Confirmed".
const fmtActivityAction = (action: string) =>
  action.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function RecentActivity() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => apiClient.admin.getAuditLogs({ page_size: 8 }),
    staleTime: 30_000,
  });
  const activity = data?.results ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-800">Recent Activity</h2>
        <button type="button" onClick={() => navigate('/order-audit')} className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1">
          View all <ArrowRight size={12} />
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : activity.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
          No activity recorded yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {activity.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="p-1.5 rounded-lg bg-slate-50 shrink-0"><History size={13} className="text-slate-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{fmtActivityAction(a.action)}</p>
                <p className="text-xs text-slate-400 truncate">{a.actor_full_name || 'System'} · Order #{a.order_id}</p>
              </div>
              <p className="text-xs text-slate-400 shrink-0">{formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuperAdminHome() {
  const navigate = useNavigate();
  const security = useQuery({ queryKey: ['security-home-summary'], queryFn: () => apiClient.admin.getSecurityHomeSummary(), staleTime: 30_000 });
  const finance = useQuery({ queryKey: ['finance-home-summary'], queryFn: () => apiClient.admin.getFinanceHomeSummary(), staleTime: 30_000 });
  const sales = useQuery({ queryKey: ['sales-manager-home-summary'], queryFn: () => apiClient.admin.getSalesManagerHomeSummary(), staleTime: 30_000 });
  const commissions = useQuery({ queryKey: ['commission-officer-home-summary'], queryFn: () => apiClient.admin.getCommissionOfficerHomeSummary(), staleTime: 30_000 });
  const product = useQuery({ queryKey: ['product-manager-home-summary'], queryFn: () => apiClient.admin.getProductManagerHomeSummary(), staleTime: 30_000 });

  return (
    <div className="space-y-7">
      <PageHeader title="Company Overview" description="Every team's snapshot in one place." />

      <DashboardSection title="Security" path="/security" navigate={navigate} tasks={security.data?.tasks ?? []} loading={security.isLoading} />
      <DashboardSection title="Finance" path="/payment-verify" navigate={navigate} tasks={finance.data?.tasks ?? []} loading={finance.isLoading} />
      <DashboardSection title="Sales" path="/sales-manager-view" navigate={navigate} tasks={sales.data?.tasks ?? []} loading={sales.isLoading} />
      <DashboardSection title="Commissions" path="/commissions" navigate={navigate} tasks={commissions.data?.tasks ?? []} loading={commissions.isLoading} />
      <DashboardSection title="Product / PFI" path="/product-manager-view" navigate={navigate} tasks={product.data?.tasks ?? []} loading={product.isLoading} />

      <RecentActivity />

      <div className="pt-2 border-t border-slate-200">
        <DashboardOverviewContent />
      </div>
    </div>
  );
}

function RoleHome() {
  const navigate = useNavigate();
  const roles = getCurrentUserRoles();
  const hasHome = roles.includes(ROLES.SUPERADMIN) || roles.includes(ROLES.ADMIN) || roles.includes(ROLES.SECURITY) || roles.includes(ROLES.FINANCE)
    || roles.includes(ROLES.SALES_MANAGER) || roles.includes(ROLES.COMMISSIONS) || roles.includes(ROLES.COMMISSION_OFFICER) || roles.includes(ROLES.PRODUCT_MANAGER);

  // Roles without a dedicated home yet bounce straight to their real
  // workspace — every login lands here first (see Login.tsx), but there's
  // nothing to show them until their role gets a Home view of its own.
  useEffect(() => {
    if (!hasHome) {
      navigate(fallbackWorkspaceForRole(roles[0] ?? -1), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.join(',')]);

  if (roles.includes(ROLES.SUPERADMIN) || roles.includes(ROLES.ADMIN)) return <SuperAdminHome />;
  if (roles.includes(ROLES.SECURITY)) return <SecurityHome />;
  if (roles.includes(ROLES.FINANCE)) return <FinanceHome />;
  if (roles.includes(ROLES.SALES_MANAGER)) return <SalesManagerHome />;
  if (roles.includes(ROLES.COMMISSIONS) || roles.includes(ROLES.COMMISSION_OFFICER)) return <CommissionOfficerHome />;
  if (roles.includes(ROLES.PRODUCT_MANAGER)) return <ProductManagerHome />;
  return null;
}

export default function Home() {
  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto">
            <RoleHome />
          </div>
        </div>
      </div>
    </div>
  );
}
