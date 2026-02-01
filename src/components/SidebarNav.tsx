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
  ShieldAlertIcon
} from "lucide-react";
import { Button } from './ui/button';
import { apiClient } from '@/api/client';

// SUPERADMIN= 0,"SUPERADMIN"
// ADMIN= 1,"General Admin"
// FINANCE =2,"Finance Admin"
// SALES=3,"Marketing Officer"
// RELEASE=4,"Release Officer"

const navItems = [
  { title: "Overview", icon: Home, path: "/dashboard", allowedRoles: [0, 1] },
  { title: "Orders", icon: ShoppingCart, path: "/orders", allowedRoles: [0, 1, 2, 3, 4] },
  { title: "Stock Management", icon: Fuel, path: "/inventory", allowedRoles: [0, 1] },
  // { title: "Our Customers", icon: Users, path: "/customers", allowedRoles: [0, 1, 3] },
  { title: "Finance", icon: DollarSign, path: "/finance", allowedRoles: [0, 1, 2] },
  { title: "Manage Prices", icon: Tag, path: "/pricing", allowedRoles: [0, 1, 3] },
  // { title: "Reports", icon: BarChart2, path: "/report", allowedRoles: [0, 1,2,3,4] },
  // { title: "Delivery Process", icon: Truck, path: "/delivery-processing", allowedRoles: [0, 1, 2, 4] },
  { title: "Loading Tickets", icon: Truck, path: "/pickup-processing", allowedRoles: [0, 1, 2, 3, 4] },
  // { title: "Offline Sales", icon: ClipboardList, path: "/offline-sales", allowedRoles: [0, 1,2,4] },
  // { title: "Order Verification", icon: FileText, path: "/order-verification", allowedRoles: [0, 1, 2] },
  { title: "Pending Payments", icon: HourglassIcon, path: "/payment-verify", allowedRoles: [0, 1, 2] },
  { title: "Manage Staff", icon: User, path: "/users-management", allowedRoles: [0, 1] },
  // { title: "Manage Marketers", icon: Users, path: "/agents", allowedRoles: [0, 1] },
  { title: "Security Clearance", icon: ShieldCheck, path: "/security", allowedRoles: [0, 1, 5] },
  { title: "Track Actions", icon: ShieldAlertIcon, path: "/order-audit", allowedRoles: [1] }
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
    const c = (pendingVerifyResponse as any)?.count;
    return typeof c === 'number' ? c : 0;
  }, [pendingVerifyResponse]);

  const { data: allOrdersResponse } = useQuery({
    queryKey: ['sidebar', 'paid-orders-count'],
    queryFn: () => apiClient.admin.getAllAdminOrders({ page: 1, page_size: 10000 }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const paidAwaitingReleaseCount = useMemo(() => {
    const results = (allOrdersResponse as any)?.results as Array<any> | undefined;
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
    <div className={cn(
      "bg-sidebar text-sidebar-foreground h-screen transition-all duration-300 flex flex-col",
      expanded ? "w-64" : "w-20"
    )}>
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className={cn("flex items-center", expanded ? "" : "justify-center w-full")}>
          {expanded && (
            <div className="flex items-center gap-2">
                <img
                src="/logo.png"
                alt=""
                className='w-10 h-10 '
                />
              <span className="font-bold text-xl">Soroman</span>
            </div>
          )}
          {!expanded && (
            <img
            src="/logo.png"
            alt=""
            className='w-5 h-5 '
            />
          )}
        </div>
        <Button
          variant="ghost"
          className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ArrowLeft size={20} /> : <Menu size={20} />}
        </Button>
      </div>
      
      <div className="flex flex-col flex-1 overflow-y-auto py-4">
        {navItems.map((item) => {
          if (!item.allowedRoles.includes(role)) {
            return null; // Skip rendering this item if the role is not allowed
          }
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
                "flex items-center py-3 px-4 hover:bg-sidebar-accent transition-colors",
                isActive && "bg-sidebar-accent border-l-4 border-primary"
              )}
            >
              <item.icon className={cn("text-sidebar-foreground/70", isActive && "text-primary-foreground")} size={20} />
              {expanded && (
                <span className={cn("ml-3 text-[1rem]", isActive && "text-sidebar-foreground")}>{item.title}</span>
              )}
              {expanded && renderBadge(badgeCount)}
            </a>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          {expanded && (
            <>
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                <span className="text-sm">
                {localStorage.getItem('fullname')
            ?.split(' ')
            .map((name) => name[0])
            .join('')
            .slice(0, 2) || 'AA'}
                </span>
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-medium">{localStorage.getItem('fullname')}</p>
                <p className="text-xs text-slate-400">{localStorage.getItem('label')}</p>
              </div>
            </>
          )}
          <Button
            variant="ghost"
            className={cn(
              "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent",
              expanded ? "ml-auto" : "mx-auto"
            )}
            onClick={handleLogout}
          >
            <LogOut size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
};
