import { useState, useMemo } from 'react';
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
  ChevronsLeft,
  ChevronsRight,
  LogOutIcon
} from "lucide-react";
import { Button } from './ui/button';
import { apiClient } from '@/api/client';

type PagedCount = { count?: number };
type OrdersResults = { results?: Array<{ status?: string | null }> };

// SUPERADMIN= 0,"SUPERADMIN"
// ADMIN= 1,"General Admin"
// FINANCE =2,"Finance Admin"
// SALES=3,"Marketing Officer"
// RELEASE=4,"Release Officer"

const navItems = [
  { title: "Overview", icon: GaugeIcon, path: "/dashboard", allowedRoles: [0, 1, 2, 3, 4] },
  { title: "Orders", icon: ClipboardCheck, path: "/orders", allowedRoles: [0, 1, 2, 3, 4] },
  { title: "Stock Management", icon: DropletIcon, path: "/inventory", allowedRoles: [0, 1] },
  { title: "PFI Tracking", icon: FileSearch2, path: "/pfi", allowedRoles: [1, 2] },
  { title: "Finance", icon: LandmarkIcon, path: "/finance", allowedRoles: [0, 1, 2] },
  { title: "Manage Prices", icon: Tag, path: "/pricing", allowedRoles: [0, 1, 3] },
  { title: "Loading Tickets", icon: FileBadge2Icon, path: "/pickup-processing", allowedRoles: [0, 1, 4,] },
  { title: "Pending Payments", icon: HourglassIcon, path: "/payment-verify", allowedRoles: [0, 1, 2] },
  { title: "Payments Report", icon: FileBarChart2Icon, path: "/confirmed-payments", allowedRoles: [0, 1, 2] },
  { title: "Manage Staff", icon: Users2Icon, path: "/users-management", allowedRoles: [0, 1] },
  { title: "Security Clearance", icon: ShieldCheck, path: "/security", allowedRoles: [0, 1, 5] },
  { title: "Track Actions", icon: ActivityIcon, path: "/order-audit", allowedRoles: [1] }
  // { title: "Our Customers", icon: Users, path: "/customers", allowedRoles: [0, 1, 3] },
  // { title: "Reports", icon: BarChart2, path: "/report", allowedRoles: [0, 1,2,3,4] },
  // { title: "Delivery Process", icon: Truck, path: "/delivery-processing", allowedRoles: [0, 1, 2, 4] },
  // { title: "Offline Sales", icon: ClipboardList, path: "/offline-sales", allowedRoles: [0, 1,2,4] },
  // { title: "Order Verification", icon: FileText, path: "/order-verification", allowedRoles: [0, 1, 2] },
  // { title: "Manage Marketers", icon: Users, path: "/agents", allowedRoles: [0, 1] },
];

export const SidebarNav = () => {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const role = parseInt(localStorage.getItem('role')||'10');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullname');
    localStorage.removeItem('label');
    navigate('/login');
  };

  const { data: pendingVerifyResponse } = useQuery({
    queryKey: ['sidebar', 'verify-orders-count'],
    queryFn: () => apiClient.admin.getVerifyOrders({ search: '', page: 1, page_size: 1 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const pendingPaymentsCount = useMemo(() => {
    const c = (pendingVerifyResponse as PagedCount | undefined)?.count;
    return typeof c === 'number' ? c : 0;
  }, [pendingVerifyResponse]);

  const { data: allOrdersResponse } = useQuery({
    queryKey: ['sidebar', 'paid-orders-count'],
    queryFn: () => apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const paidAwaitingReleaseCount = useMemo(() => {
    const results = (allOrdersResponse as OrdersResults | undefined)?.results;
    if (!Array.isArray(results)) return 0;
    return results.filter((o) => (o?.status || '').toLowerCase() === 'paid').length;
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
          {navItems.map((item) => {
            if (!item.allowedRoles.includes(role)) return null;

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
                  // identical height & visual rhythm in both states
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
};
