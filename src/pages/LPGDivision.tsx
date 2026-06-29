import { useNavigate } from 'react-router-dom';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { LayoutDashboard, Building2, Warehouse, Receipt, ChevronRight } from 'lucide-react';

const CARDS = [
  { to: '/lpg/dashboard', label: 'Dashboard', description: 'Live KPIs across all plants — stock, sales, low-stock alerts.', icon: LayoutDashboard, color: 'bg-orange-50 text-orange-600' },
  { to: '/lpg/plants', label: 'Plants', description: 'Plant master list — name, location, capacity, status.', icon: Building2, color: 'bg-blue-50 text-blue-600' },
  { to: '/lpg/stock', label: 'Stock Register', description: 'Daily opening/received/sold stock movement per plant.', icon: Warehouse, color: 'bg-emerald-50 text-emerald-600' },
  { to: '/lpg/sales', label: 'Sales Register', description: 'Daily sales transactions, revenue, and payment method.', icon: Receipt, color: 'bg-purple-50 text-purple-600' },
];

export default function LPGDivision() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-5">
            <PageHeader
              title="LPG Division"
              description="Plants, daily stock, and sales — one master list everything else reads from."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CARDS.map(c => (
                <button
                  key={c.to}
                  onClick={() => navigate(c.to)}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-start gap-4 text-left hover:border-orange-300 hover:shadow-md transition-all"
                >
                  <div className={`p-3 rounded-lg ${c.color}`}>
                    <c.icon size={22} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{c.label}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{c.description}</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 mt-2 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
