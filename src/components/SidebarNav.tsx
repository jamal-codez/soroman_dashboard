import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  TruckIcon,
  BanknoteIcon,
  HandHelpingIcon
} from "lucide-react";

const navItems = [
  { title: "Dashboard", icon: Home, path: "/dashboard", allowedRoles: [0,1, 2,3,4] },
  { title: "Orders", icon: ShoppingCart, path: "/orders", allowedRoles: [1,0,3] },
  { title: "Inventory", icon: Fuel, path: "/inventory", allowedRoles: [0,1,3] },
  { title: "Customers", icon: Users, path: "/customers", allowedRoles: [0,1,3] },
  { title: "Finance", icon: BanknoteIcon, path: "/finance", allowedRoles: [0,1,2] },
  // { title: "Product Release", icon: TruckIcon, path: "/release" },
  { title: "Payment Verification", icon: HandHelpingIcon, path: "/payment-verify", allowedRoles: [0,1,2] },
  // { title: "Notifications", icon: Bell, path: "/notifications" },
  { title: "Users Management", icon: Settings, path: "/users-management", allowedRoles: [0,1] }
];

export const SidebarNav = () => {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const role = parseInt(localStorage.getItem('role')||'10');
  
  const handleLogout = () => {
    // Clear tokens and role from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('fullname');
    
    // Navigate to login page
    navigate('/login');
  };

  return (
    <div className={cn(
      "bg-soroman-blue text-white h-screen transition-all duration-300 flex flex-col",
      expanded ? "w-64" : "w-20"
    )}>
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
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
        <button 
          className="text-slate-300 hover:text-white"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ArrowLeft size={20} /> : <Menu size={20} />}
        </button>
      </div>
      
      <div className="flex flex-col flex-1 overflow-y-auto py-4">
        {navItems.map((item) => {
          if (!item.allowedRoles.includes(role)) {
            return null; // Skip rendering this item if the role is not allowed
          }
          const isActive = location.pathname === item.path;
          return (
            <a 
              key={item.title}
              href={item.path}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.path);
              }}
              className={cn(
                "flex items-center py-3 px-4 hover:bg-slate-700 transition-colors",
                isActive && "bg-slate-700/50 border-l-4 border-[#169061]"
              )}
            >
              <item.icon className={cn("text-slate-300", isActive && "text-[#169061]")} size={20} />
              {expanded && (
                <span className={cn("ml-3", isActive && "text-[#169061]")}>{item.title}</span>
              )}
            </a>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-slate-700">
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
                <p className="text-xs text-slate-400">Administrator</p>
              </div>
            </>
          )}
          <button 
            className={cn(
              "text-slate-300 hover:text-white", 
              expanded ? "ml-auto" : "mx-auto"
            )}
            onClick={handleLogout}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
