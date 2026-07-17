import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Home as HomeIcon,
  GaugeIcon,
  ClipboardCheck,
  DropletIcon,
  FileSearch2,
  LandmarkIcon,
  Tag,
  FileBadge2Icon,
  HourglassIcon,
  FileBarChart2Icon,
  Users2Icon,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  ActivityIcon,
  Users,
  Truck,
  Banknote,
  TicketPlusIcon,
  UserCheck,
  FileText,
  Package,
  ClipboardList,
  Fuel,
  FileArchiveIcon,
  Flame,
  RotateCcw,
  ArrowLeftRight,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { apiClient } from '@/api/client';
import { getCurrentUserRoles } from '@/roles';

type LucideIcon = React.ComponentType<{ className?: string; size?: number | string }>;
type PagedCount = { count?: number };
type OrdersResults = { results?: Array<{ status?: string | null }> };

type NavItem = {
  title: string;
  icon: LucideIcon;
  path: string;
  allowedRoles: number[];
};

type NavCategory = {
  category: string;
  items: NavItem[];
};

// Every active role number — Home is every role's landing page.
const ALL_ROLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const navCategories: NavCategory[] = [
  {
    category: '',
    items: [
      { title: "Overview", icon: GaugeIcon, path: "/dashboard", allowedRoles: [8] },
      { title: "Home", icon: HomeIcon, path: "/home", allowedRoles: ALL_ROLES },
    ],
  },
  {
    category: 'Orders',
    items: [
      { title: "All Orders", icon: FileArchiveIcon, path: "/depot-view", allowedRoles: [0, 1, 2, 4, 7, 8, 15, 16, 17, 18] },
      { title: "Orders", icon: ActivityIcon, path: "/sales-manager-view", allowedRoles: [0, 9] },
      { title: "Orders", icon: FileArchiveIcon, path: "/product-manager-view", allowedRoles: [0, 10] },
      { title: "Our Customers", icon: Users, path: "/customers", allowedRoles: [0, 1, 8, 9] },
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
      { title: "LPG Division", icon: Flame, path: "/lpg", allowedRoles: [0, 1, 8, 11, 12, 13, 14] },
      { title: "LPG Dashboard", icon: Flame, path: "/lpg/dashboard", allowedRoles: [0, 1, 8, 11] },
      { title: "LPG Plants", icon: Flame, path: "/lpg/plants", allowedRoles: [0, 1, 8, 12] },
      { title: "LPG Stock Register", icon: Flame, path: "/lpg/stock", allowedRoles: [0, 1, 8, 13] },
      { title: "LPG Sales Register", icon: Flame, path: "/lpg/sales", allowedRoles: [0, 1, 8, 14] },
    ],
  },
  {
    category: 'Truck Sales',
    items: [
      { title: "Delivery Inventory", icon: Package,     path: "/delivery-inventory",    allowedRoles: [0, 1, 3, 6, 8] },
      { title: "Delivery Customers", icon: UserCheck,   path: "/delivery-customers-db", allowedRoles: [0, 1, 3, 6, 8] },
      { title: "Sales Ledger",       icon: ClipboardList, path: "/delivery-sales-ledger", allowedRoles: [0, 1, 3, 8] },
      { title: "Filling Stations",   icon: Fuel,        path: "/filling-stations",      allowedRoles: [0, 1, 3, 8] },
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

export const MobileNav = React.memo(function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const userRoles = getCurrentUserRoles();
  const [open, setOpen] = useState(false);

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

  const { data: allOrdersResponse } = useQuery({
    queryKey: ['sidebar', 'paid-orders-count'],
    queryFn: () => apiClient.admin.getAllAdminOrders({ page: 1, page_size: 1, status: 'paid' }),
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

  const visibleCategories = useMemo(() =>
    navCategories
      .map((group) => ({
        ...group,
        items: group.items.filter((i) => i.allowedRoles.some((r) => userRoles.includes(r))),
      }))
      .filter((group) => group.items.length > 0),
    [userRoles]
  );

  const handleLogout = async () => {
    try { await apiClient.admin.logoutUser(); } catch { /* ignore — clear locally regardless */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
    localStorage.removeItem('fullname');
    localStorage.removeItem('label');
    navigate('/login');
  };

  return (
    <div className="sm:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="h-14 px-4 flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10">
              <Menu size={18} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[88vw] max-w-[360px] p-0 flex flex-col">
            <SheetHeader className="p-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="" className="w-8 h-8" />
                <SheetTitle className="text-left">Soroman</SheetTitle>
                {/* <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setOpen(false)}>
                  <X size={18} />
                </Button> */}
              </div>
              {/* <div className="mt-2 text-xs text-slate-600">
                {localStorage.getItem('fullname') || ''}
                {localStorage.getItem('label') ? ` · ${localStorage.getItem('label')}` : ''}
              </div> */}
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain p-2">
              {visibleCategories.map((group) => (
                <div key={group.category || '__overview'}>
                  {group.category && (
                    <div className="pt-3 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 select-none">
                      {group.category}
                    </div>
                  )}
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    const badgeCount = getBadgeCount(item.path);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => {
                          navigate(item.path);
                          setOpen(false);
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors',
                          isActive ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-900'
                        )}
                      >
                        <Icon size={18} className={cn(isActive ? 'text-white' : 'text-slate-600')} />
                        <span className="truncate">{item.title}</span>
                        {renderBadge(badgeCount)}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="mt-3 border-t border-slate-200 pt-3 px-2">
                <Button variant="destructive" className="w-full justify-start gap-2" onClick={handleLogout}>
                  <LogOut size={16} /> Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="" className="w-8 h-8" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 truncate">Soroman Dashboard</div>
            <div className="text-[11px] text-slate-500 truncate">{location.pathname}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MobileNav;
