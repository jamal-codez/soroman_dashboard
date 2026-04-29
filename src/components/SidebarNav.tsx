import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from "@/lib/utils";
import { 
  Home, 
  Users, 
  ShoppingCart, 
  Fuel, 
  Bell, 
  Settings, 
  Menu, 
  ArrowLeft,
  LogOut,
  User,
  Truck,
  Banknote,
  FileText,
  Tag,
  ClipboardList,
  BarChart2,
  ShieldCheck,
  BarChart3,
  PiggyBank,
  Hourglass,
  HourglassIcon,
  DollarSign,
  ShieldAlertIcon,
  Gauge,
  GaugeIcon,
  ClipboardCheck,
  DropletIcon,
  FileSearch2,
  LandmarkIcon,
  TicketPlusIcon,
  ClockAlertIcon,
  FileBarChart2Icon,
  Users2Icon,
  ActivityIcon,
  FileBadge2Icon,
  Package,
  ChevronsLeft,
  ChevronsRight,
  LogOutIcon,
  UserCheck,
} from "lucide-react";
import { Button } from './ui/button';
import { apiClient } from '@/api/client';

type PagedCount = { count?: number };
type OrdersResults = { results?: Array<{ status?: string | null }> };

// SUPERADMIN: 0,  Support
//   ADMIN: 1,  Administration
//   FINANCE: 2,  Finance
//   SALES: 3,  Sales
//   RELEASE: 4,  Ticketing
//   SECURITY: 5,  Security
//   TRANSPORT: 6,  Transport
//   RELEASE_OFFICER: 7,  Release
//   AUDITOR: 8,  Audit
//   MARKETING: 9,  Marketing

type NavItem = { title: string; icon: React.ComponentType<{ size?: string | number; className?: string }>; path: string; allowedRoles: number[] };
type NavCategory = { category: string; items: NavItem[] };

const navCategories: NavCategory[] = [
  {
    category: '',
    items: [
      { title: "Overview", icon: GaugeIcon, path: "/dashboard", allowedRoles: [0,1,8] },
    ],
  },
  {
    category: 'Sales & Customers',
    items: [
      { title: "Orders", icon: ClipboardCheck, path: "/orders", allowedRoles: [0,1,2,4,7,8,9] },
      { title: "Pickup Customers", icon: Users, path: "/customers", allowedRoles: [0,1,8,9] },
      // { title: "Delivery Customers", icon: UserCheck, path: "/buyers-list", allowedRoles: [0,1,3] },
    ],
  },
  {
    category: 'Dispatch & Waybill',
    items: [
      { title: "Confirm Release", icon: ShieldCheck, path: "/confirm-release", allowedRoles: [0,1,7,8] },
      { title: "Released Orders", icon: ClipboardCheck, path: "/released-orders", allowedRoles: [0,1,4,7,8] },
      { title: "Loading Tickets", icon: FileBadge2Icon, path: "/pickup-processing", allowedRoles: [0,1,4,7,8] },
      { title: "Daily Sales Report", icon: FileBarChart2Icon, path: "/daily-sales-report", allowedRoles: [0,1,2,7,8] },
      // { title: "Truck-Out Orders", icon: Truck, path: "/in-house-create", allowedRoles: [0,4] },
      // { title: "Truck-Outs & Deliveries", icon: ClipboardCheck, path: "/in-house-records", allowedRoles: [0] },
      // { title: "Record Sale", icon: Banknote, path: "/in-house-sales", allowedRoles: [0] },
    ],
  },
  {
    category: 'Transport',
    items: [
      { title: "Fleet", icon: Truck, path: "/fleet-trucks", allowedRoles: [0,1,6,8] },
      { title: "Trucks Ledger", icon: Banknote, path: "/fleet-ledger", allowedRoles: [0,6,8] },
    ],
  },
  {
    category: 'Deliveries',
    items: [
      { title: "Inventory", icon: Package, path: "/delivery-inventory", allowedRoles: [0,1,3,6,8] },
      { title: "Delivery Customers", icon: UserCheck, path: "/delivery-customers-db", allowedRoles: [0,1,3,6,8] },
      { title: "Sales Ledger", icon: ClipboardList, path: "/delivery-sales-ledger", allowedRoles: [0,1,3,8] },
    ],
  },
  {
    category: 'Finance',
    items: [
      { title: "Pending Payments", icon: HourglassIcon, path: "/payment-verify", allowedRoles: [0,1,2,8,9] },
      { title: "Payments Report", icon: FileBarChart2Icon, path: "/confirmed-payments", allowedRoles: [0,1,2,8,9] },
      { title: "Bank Accounts", icon: LandmarkIcon, path: "/finance", allowedRoles: [0,1,2,8,9] },
    ],
  },
  {
    category: 'Admin',
    items: [
      { title: "Assign PFI", icon: TicketPlusIcon, path: "/orders-pfi", allowedRoles: [0] },
      { title: "Manage Prices", icon: Tag, path: "/pricing", allowedRoles: [0,1,8] },
      { title: "PFI Tracking", icon: FileSearch2, path: "/pfi", allowedRoles: [0,1,2,8] },
      { title: "Stock Management", icon: DropletIcon, path: "/inventory", allowedRoles: [0] },
      // { title: "Track Actions", icon: ActivityIcon, path: "/order-audit", allowedRoles: [0,1,8] },
      { title: "Manage Staff", icon: Users2Icon, path: "/users-management", allowedRoles: [0,1,8] },
    ],
  },
  {
    category: 'Records',
    items: [
      { title: "Submit Record/Request", icon: FileText, path: "/documents", allowedRoles: [0,1,2,3,4,5,6,7,8,9] },
      { title: "Records & Requests", icon: FileSearch2, path: "/records", allowedRoles: [0,1,2,7,8] },
    ],
  },
  {
    category: 'Security',
    items: [
      { title: "Security Clearance", icon: ShieldCheck, path: "/security", allowedRoles: [0,1,5,8] },
    ],
  },
];

export const SidebarNav = React.memo(function SidebarNav() {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const role = parseInt(localStorage.getItem('role')||'10');

  const handleLogout = async () => {
    try { await apiClient.admin.logoutUser(); } catch { /* ignore — clear locally regardless */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullname');
    localStorage.removeItem('label');
    navigate('/login');
  };

  const { data: pendingVerifyResponse } = useQuery({
    queryKey: ['sidebar', 'verify-orders-count'],
    queryFn: () => apiClient.admin.getVerifyOrders({ status: 'pending', page: 1, page_size: 1 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const pendingPaymentsCount = useMemo(() => {
    const c = (pendingVerifyResponse as PagedCount | undefined)?.count;
    return typeof c === 'number' ? c : 0;
  }, [pendingVerifyResponse]);

  // Only fetch count + minimal results to derive badge counts.
  // Previously fetched page_size=10000 which transferred ~2MB of JSON on every poll.
  const { data: allOrdersResponse } = useQuery({
    queryKey: ['sidebar', 'paid-orders-count'],
    queryFn: async () => {
      // Fetch page_size=1 with status=paid to get count of paid (released) orders.
      // The backend returns { count, results } — we only need `count`.
      const res = await apiClient.admin.getAllAdminOrders({ page: 1, page_size: 1, status: 'paid' });
      return res;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const paidAwaitingReleaseCount = useMemo(() => {
    const c = (allOrdersResponse as PagedCount | undefined)?.count;
    return typeof c === 'number' ? c : 0;
  }, [allOrdersResponse]);

  const getBadgeCount = (path: string) => {
    if (path === '/payment-verify') return pendingPaymentsCount;
    if (path === '/pickup-processing') return paidAwaitingReleaseCount;
    return 0;
  };

  const renderBadge = (count: number) => {
    if (!count) return null;
    const text = count > 99 ? '99+' : String(count);
    return (
      <span className="ml-auto inline-flex min-w-[22px] items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
        {text}
      </span>
    );
  };

  return (
    <aside
      className={cn(
        // desktop sidebar only (mobile uses MobileNav)
        "hidden sm:flex h-screen flex-col border-r",
        // black theme
        "bg-black text-white border-white/10",
        // smooth collapse
        "transition-[width] duration-200 ease-in-out",
        expanded ? "w-64" : "w-[76px]"
      )}
      aria-label="Sidebar navigation"
    >
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-4 border-b",
        "border-white/10"
      )}>
        <div
          className={cn(
            "flex items-center gap-2 min-w-0",
            expanded ? "" : "justify-center flex-1"
          )}
          title={expanded ? undefined : "Soroman"}
        >
          <img src="/logo.png" alt="Soroman" className={cn("shrink-0", expanded ? "w-9 h-9" : "w-8 h-8")} />
          {expanded ? (
            <div className="min-w-0 leading-tight">
              <div className="font-semibold text-base">Soroman</div>
              <div className="text-[11px] text-white/60">Dashboard</div>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "ml-auto shrink-0 rounded-md",
            "text-white/80 hover:text-white hover:bg-white/10",
            // keep toggle in a consistent spot when collapsed
            !expanded && "ml-0"
          )}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
        </Button>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto py-3",
          "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        )}
        aria-label="Primary"
      >
        <div className={cn("space-y-1", expanded ? "px-2" : "px-1")}>
          {navCategories.map((group) => {
            // Only show the category if at least one item is visible to this role
            const visibleItems = group.items.filter((item) => item.allowedRoles.includes(role));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.category || '__overview'}>
                {/* Category label — tiny, uppercase, muted */}
                {group.category && expanded && (
                  <div className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/40 select-none">
                    {group.category}
                  </div>
                )}
                {/* Thin separator when collapsed */}
                {group.category && !expanded && (
                  <div className="my-2 mx-3 border-t border-white/10" />
                )}

                {visibleItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const badgeCount = getBadgeCount(item.path);

                  return (
                    <a
                      key={item.title}
                      href={item.path}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.path);
                      }}
                      className={cn(
                        "group flex items-center rounded-md text-sm",
                        "h-11",
                        expanded ? "gap-3 px-3" : "justify-center px-0",
                        "transition-colors",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/80 hover:bg-white/5 hover:text-white"
                      )}
                      aria-current={isActive ? 'page' : undefined}
                      title={expanded ? undefined : item.title}
                    >
                      <item.icon
                        size={18}
                        className={cn(
                          "shrink-0",
                          isActive ? "text-white" : "text-white/70 group-hover:text-white"
                        )}
                      />

                      {expanded ? <span className="min-w-0 flex-1 truncate">{item.title}</span> : null}

                      {expanded ? renderBadge(badgeCount) : null}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className={cn("border-t p-3", "border-white/10")}>
        {expanded ? (
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold">
              {localStorage
                .getItem('fullname')
                ?.split(' ')
                .map((name) => name[0])
                .join('')
                .slice(0, 2) || 'AA'}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">{localStorage.getItem('fullname') || ''}</div>
              <div className="truncate text-xs text-white/60">{localStorage.getItem('label') || ''}</div>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          className={cn(
            // match menu item sizing
            "h-11 w-full rounded-md",
            expanded ? "justify-start gap-2 px-3" : "justify-center px-0",
            // red logout
            "text-red-300 hover:text-red-200 hover:bg-red-500/10"
          )}
          onClick={handleLogout}
          title="Logout"
          aria-label="Logout"
        >
          <LogOutIcon size={16} className="text-red-300" />
          {expanded ? <span className="font-semibold">Logout</span> : null}
        </Button>
      </div>
    </aside>
  );
});
