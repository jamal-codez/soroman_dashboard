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
  FileCheck2,
  FileArchive,
  FileArchiveIcon,
  Flame,
  RotateCcw,
  ArrowLeftRight,
  MessageCircle,
  Headphones,
} from "lucide-react";
import { Button } from './ui/button';
import { apiClient } from '@/api/client';
import { getCurrentUserRoles } from '@/roles';

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
//   LOCATION_MANAGER: 10,  Location Manager
//   LPG_DASHBOARD: 11,  LPG Dashboard
//   LPG_PLANTS: 12,  LPG Plants
//   LPG_STOCK: 13,  LPG Stock
//   LPG_SALES: 14,  LPG Sales
//   COMMISSIONS: 15,  Commissions
//   SUPERADMIN: 0,            // Support
//   ADMIN: 1,                 // Administration
//   FINANCE: 2,               // Finance
//   SALES: 3,                 // Sales
//   RELEASE: 4,               // Ticketing
//   SECURITY: 5,              // Security
//   TRANSPORT: 6,             // Transport
//   RELEASE_OFFICER: 7,       // Release
//   AUDITOR: 8,               // Audit
//   SALES_MANAGER: 9,         // Sales Manager
//   PRODUCT_MANAGER: 10,      // Product Manager
// // LPG_DASHBOARD: 11,  LPG Dashboard
//   LPG_PLANTS: 12,  LPG Plants
//   LPG_STOCK: 13,  LPG Stock
//   LPG_SALES: 14,  LPG Sales
//   COMMISSIONS: 15,          // Commissions
//   COMMISSION_OFFICER: 16,   // Commission Officer
//   DISPATCH: 17,             // Dispatch
//   IT_COMPLIANCE: 18,        // IT Compliance (depot view read-only)

type NavItem = { title: string; icon: React.ComponentType<{ size?: string | number; className?: string }>; path: string; allowedRoles: number[] };
type NavCategory = { category: string; items: NavItem[] };

// Every active role number — used for pages visible to all staff
const ALL_ROLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const navCategories: NavCategory[] = [
  {
    category: '',
    items: [
      { title: "Overview", icon: GaugeIcon, path: "/dashboard", allowedRoles: [8] },
      { title: "Home", icon: Home, path: "/home", allowedRoles: ALL_ROLES },
    ],
  },
  {
    category: 'Orders',
    items: [
      { title: "All Orders", icon: FileArchiveIcon, path: "/depot-view", allowedRoles: [0, 1, 2, 4, 7, 8, 15, 16, 17, 18] },
      { title: "Orders", icon: ActivityIcon, path: "/sales-manager-view", allowedRoles: [0, 9] },
      { title: "Orders", icon: FileArchiveIcon, path: "/product-manager-view", allowedRoles: [0, 10] },
      { title: "Our Customers", icon: Users, path: "/customers", allowedRoles: [0, 1, 8, 9] },
      { title: "Customer Desk", icon: Headphones, path: "/customer-desk", allowedRoles: [0, 1] },
      // { title: "Daily Sales Report", icon: FileBarChart2Icon, path: "/daily-sales-report", allowedRoles: [0, 1, 8] },
    ],
  },
  {
    category: 'My Reports',
    items: [
      // Each role sees one "My Report" item that goes to the dedicated report page
      { title: "My Report", icon: ClipboardList, path: "/my-report", allowedRoles: [0, 5, 9, 10, 15, 16, 18] },
    ],
  },
  {
    category: 'Operations',
    items: [
      { title: "Loading Tickets",   icon: FileBadge2Icon, path: "/pickup-processing", allowedRoles: [0, 1, 4, 7, 8, 17] },
      { title: "Security Clearance", icon: ShieldCheck,   path: "/security",          allowedRoles: [0, 1, 5, 8] },
      { title: "Security Report",   icon: FileSearch2,    path: "/security-report",   allowedRoles: [0, 1, 5, 8] },
    ],
  },
  {
    category: 'Finance',
    items: [
      { title: "Verify Payments", icon: HourglassIcon,      path: "/payment-verify",     allowedRoles: [0, 1, 2, 8] },
      { title: "Finance Report",       icon: FileBarChart2Icon, path: "/confirmed-payments",    allowedRoles: [0, 1, 2, 8] },
      { title: "Overpayment Refunds",  icon: RotateCcw,         path: "/overpayment-refunds",   allowedRoles: [0, 1, 2, 8, 15, 16] },
      { title: "Transfer Requests",    icon: ArrowLeftRight,    path: "/overpayment-requests",  allowedRoles: [0, 1, 2, 8] },
      { title: "Commissions",          icon: Banknote,          path: "/commissions",           allowedRoles: [0, 1, 15, 16] },
      { title: "Bank Accounts",   icon: LandmarkIcon,       path: "/finance",            allowedRoles: [0, 1, 2, 8] },
      { title: "Bank Statements", icon: FileText,           path: "/bank-statements",    allowedRoles: [0, 1, 8] },
    ],
  },
  {
    category: 'Transport',
    items: [
      { title: "Fleet Directory",     icon: Truck,    path: "/fleet-trucks", allowedRoles: [0, 1, 6, 8] },
      { title: "Fleet Expense Ledger", icon: Banknote, path: "/fleet-ledger", allowedRoles: [0, 1, 6, 8] },
    ],
  },
  {
    category: 'LPG Division',
    items: [
      { title: "LPG Division", icon: Flame, path: "/lpg", allowedRoles: [0, 1, 8, 11, 13, 14] },
      { title: "LPG Dashboard", icon: Flame, path: "/lpg/dashboard", allowedRoles: [0, 1, 8, 11, 13] },
      { title: "LPG Plants", icon: Flame, path: "/lpg/plants", allowedRoles: [0, 1, 8, 11] },
      { title: "LPG Stock Register", icon: Flame, path: "/lpg/stock", allowedRoles: [0, 1, 8, 11, 13] },
      { title: "LPG Sales Register", icon: Flame, path: "/lpg/sales", allowedRoles: [0, 1, 8, 11, 13, 14] },
    ],
  },
  {
    category: 'Truck Sales',
    items: [
      { title: "Delivery Inventory", icon: Package,     path: "/delivery-inventory",    allowedRoles: [0, 1, 3, 6, 8] },
      { title: "Delivery Customers", icon: UserCheck,   path: "/delivery-customers-db", allowedRoles: [0, 1, 3, 6, 8] },
      { title: "Sales Ledger",       icon: ClipboardList, path: "/delivery-sales-ledger", allowedRoles: [0, 1, 3, 8] },
      { title: "Filling Stations",   icon: Fuel,        path: "/filling-stations",      allowedRoles: [0, 1, 8, 12] },
    ],
  },
  {
    category: 'Admin',
    items: [
      { title: "Reports Hub",      icon: FileBarChart2Icon, path: "/admin-reports",   allowedRoles: [0, 1, 8] },
      { title: "Messaging",        icon: MessageCircle,     path: "/messaging",       allowedRoles: [0, 1] },
      { title: "Assign PFI",       icon: TicketPlusIcon,  path: "/orders-pfi",       allowedRoles: [0] },
      { title: "Product Pricing",  icon: Tag,             path: "/pricing",          allowedRoles: [0, 1] },
      { title: "PFI Tracking",     icon: FileSearch2,     path: "/pfi",              allowedRoles: [0, 1, 2, 7, 8] },
      { title: "Stock Management", icon: DropletIcon,     path: "/inventory",        allowedRoles: [0] },
      { title: "Users Log",        icon: ActivityIcon,    path: "/order-audit",      allowedRoles: [0, 1, 8] },
      { title: "Manage Users",     icon: Users2Icon,      path: "/users-management", allowedRoles: [0, 1, 8] },
    ],
  },
  {
    category: 'Feedback',
    items: [
      { title: "Feedback & Reviews", icon: ActivityIcon, path: "/feedback-dashboard", allowedRoles: [0, 1, 8] },
    ],
  },
];

export const SidebarNav = React.memo(function SidebarNav() {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const userRoles = getCurrentUserRoles();

  const handleLogout = async () => {
    try { await apiClient.admin.logoutUser(); } catch { /* ignore — clear locally regardless */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
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
            const visibleItems = group.items.filter((item) => item.allowedRoles.some((r) => userRoles.includes(r)));
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
                  const itemPathname = item.path.split('?')[0];
                  const isActive = location.pathname === itemPathname && !item.path.includes('?');
                  const badgeCount = getBadgeCount(itemPathname);

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
