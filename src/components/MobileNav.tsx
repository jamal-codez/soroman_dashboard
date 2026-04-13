import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { apiClient } from '@/api/client';

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

const navCategories: NavCategory[] = [
  {
    category: '',
    items: [
      { title: "Overview", icon: GaugeIcon, path: "/dashboard", allowedRoles: [0,1] },
    ],
  },
  {
    category: 'Sales & Customers',
    items: [
      { title: "Orders", icon: ClipboardCheck, path: "/orders", allowedRoles: [0,1,3] },
      { title: "Pickup Customers", icon: Users, path: "/customers", allowedRoles: [0,1,3] },
      { title: "Delivery Customers", icon: UserCheck, path: "/buyers-list", allowedRoles: [0,1,3] },
    ],
  },
  {
    category: 'Dispatch & Waybill',
    items: [
      { title: "Loading Tickets", icon: FileBadge2Icon, path: "/pickup-processing", allowedRoles: [0,1,4] },
      { title: "Truck-Out Orders", icon: Truck, path: "/in-house-create", allowedRoles: [0,4] },
      { title: "Truck-Outs & Deliveries", icon: ClipboardCheck, path: "/in-house-records", allowedRoles: [0,1] },
      { title: "Record Sale", icon: Banknote, path: "/in-house-sales", allowedRoles: [0,3] },
    ],
  },
  {
    category: 'Transport',
    items: [
      { title: "Fleet", icon: Truck, path: "/fleet-trucks", allowedRoles: [0,1,6] },
      { title: "Trucks Ledger", icon: Banknote, path: "/fleet-ledger", allowedRoles: [0,6] },
    ],
  },
  {
    category: 'Finance',
    items: [
      { title: "Pending Payments", icon: HourglassIcon, path: "/payment-verify", allowedRoles: [0,1,2] },
      { title: "Payments Report", icon: FileBarChart2Icon, path: "/confirmed-payments", allowedRoles: [0,1,2] },
      { title: "Bank Accounts", icon: LandmarkIcon, path: "/finance", allowedRoles: [0,1,2] },
    ],
  },
  {
    category: 'Inventory & Pricing',
    items: [
      { title: "Stock Management", icon: DropletIcon, path: "/inventory", allowedRoles: [0,1] },
      { title: "Manage Prices", icon: Tag, path: "/pricing", allowedRoles: [0,1] },
      { title: "PFI Tracking", icon: FileSearch2, path: "/pfi", allowedRoles: [0,1,2] },
    ],
  },
  {
    category: 'Admin',
    items: [
      { title: "Assign PFI", icon: TicketPlusIcon, path: "/orders-pfi", allowedRoles: [0] },
      { title: "Track Actions", icon: ActivityIcon, path: "/order-audit", allowedRoles: [0,1] },
      { title: "Manage Staff", icon: Users2Icon, path: "/users-management", allowedRoles: [0,1] },
    ],
  },
  {
    category: 'Records',
    items: [
      { title: "Submit Record/Request", icon: FileText, path: "/documents", allowedRoles: [0,1,2,3,4,5,6] },
      { title: "Records & Requests", icon: FileSearch2, path: "/records", allowedRoles: [0,1,2] },
    ],
  },
  {
    category: 'Security',
    items: [
      { title: "Security Clearance", icon: ShieldCheck, path: "/security", allowedRoles: [0,1,5] },
    ],
  },
];

export const MobileNav = React.memo(function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = parseInt(localStorage.getItem('role') || '10');
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
        items: group.items.filter((i) => i.allowedRoles.includes(role)),
      }))
      .filter((group) => group.items.length > 0),
    [role]
  );

  const handleLogout = async () => {
    try { await apiClient.admin.logoutUser(); } catch { /* ignore — clear locally regardless */ }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
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
          <SheetContent side="left" className="w-[88vw] max-w-[360px] p-0">
            <SheetHeader className="p-4 border-b border-slate-200">
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

            <div className="p-2">
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
