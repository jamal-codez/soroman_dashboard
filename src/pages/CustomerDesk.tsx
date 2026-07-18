/**
 * Customer Desk Officer Dashboard — UI-only prototype.
 *
 * Everything on this page runs off local mock data (see MOCK_CUSTOMERS
 * below) and in-memory state. There is no backend for this feature yet —
 * "sending" a broadcast, "creating" an order, "recording" a complaint, etc.
 * all just mutate local state so the officer workflow can be demoed and
 * reviewed end-to-end before any API work happens.
 */
import { useMemo, useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { MobileNav } from '@/components/MobileNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Search, UserPlus, ShoppingCart, MessageSquareWarning, Send, Megaphone,
  Wallet, Users, ClipboardList, Fuel, Mail, Bell, Sparkles, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, X, ChevronRight, ChevronLeft, Building2,
  Phone, MapPin, FileText, Truck, Star, ShieldCheck, TrendingUp, Copy,
  Download, RotateCcw, MessageCircle, PhoneCall, Package, Banknote,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OrderStatus = 'Completed' | 'Awaiting Pickup' | 'Pending Payment';
type PaymentStatus = 'Matched' | 'Pending' | 'Failed' | 'Refunded';
type ComplaintPriority = 'High' | 'Medium' | 'Low';
type ComplaintStatus = 'Open' | 'Assigned' | 'Working' | 'Resolved' | 'Closed';
type MessageChannel = 'WhatsApp' | 'SMS' | 'Email' | 'Phone Note';

type CustomerOrder = {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  depot: string;
  status: OrderStatus;
  date: string;
  amount: number;
};

type CustomerPayment = {
  id: string;
  orderId?: string;
  method: 'DVA' | 'Bank Transfer' | 'Cash' | 'Split Payment' | 'Wallet';
  amount: number;
  status: PaymentStatus;
  date: string;
};

type CustomerComplaint = {
  id: string;
  type: string;
  description: string;
  priority: ComplaintPriority;
  assignedTo: string;
  status: ComplaintStatus;
  date: string;
};

type CustomerMessage = {
  id: string;
  channel: MessageChannel;
  text: string;
  date: string;
  direction: 'inbound' | 'outbound';
};

type ActivityEntry = { id: string; description: string; timestamp: string };
type CustomerDocument = { id: string; name: string; type: string; uploadedAt: string };

type Customer = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  tin: string;
  cac: string;
  status: 'Active' | 'Inactive';
  verified: boolean;
  customerSince: string;
  relationshipManager: string;
  walletBalance: number;
  availableCredit: number;
  pendingDeposits: number;
  virtualAccountNumber: string;
  loyaltyTier: 'Gold' | 'Silver' | 'Bronze';
  creditEligible: boolean;
  preferredDepot: string;
  preferredProduct: string;
  avgMonthlyVolume: number;
  preferredPaymentMethod: string;
  preferredContactMethod: string;
  vehicleNumbers: string[];
  orders: CustomerOrder[];
  payments: CustomerPayment[];
  complaints: CustomerComplaint[];
  messages: CustomerMessage[];
  activityLog: ActivityEntry[];
  documents: CustomerDocument[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const DEPOTS = ['Calabar', 'Port Harcourt', 'Warri', 'Dangote Refinery', 'Lagos AIPEC'];
const PRODUCTS = ['PMS', 'AGO', 'LPG', 'Jet A1'];

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'CUST-1001',
    companyName: 'ABC Energy Ltd',
    contactName: 'Adaeze Chukwu',
    phone: '08031234567',
    email: 'adaeze@abcenergy.ng',
    address: '14 Marina Road, Lagos',
    tin: '01234567-0001',
    cac: 'RC1182334',
    status: 'Active',
    verified: true,
    customerSince: 'March 2026',
    relationshipManager: 'Victory',
    walletBalance: 14520000,
    availableCredit: 5000000,
    pendingDeposits: 1200000,
    virtualAccountNumber: '9012345678',
    loyaltyTier: 'Gold',
    creditEligible: true,
    preferredDepot: 'Lagos AIPEC',
    preferredProduct: 'PMS',
    avgMonthlyVolume: 420000,
    preferredPaymentMethod: 'Wallet',
    preferredContactMethod: 'WhatsApp',
    vehicleNumbers: ['KJA-224-XA', 'ABC-991-KD'],
    orders: [
      { id: 'SO10431', product: 'PMS', quantity: 45000, unit: 'L', depot: 'Lagos AIPEC', status: 'Completed', date: '2026-07-14', amount: 51165000 },
      { id: 'SO10432', product: 'AGO', quantity: 60000, unit: 'L', depot: 'Lagos AIPEC', status: 'Awaiting Pickup', date: '2026-07-16', amount: 74400000 },
      { id: 'SO10433', product: 'PMS', quantity: 30000, unit: 'L', depot: 'Lagos AIPEC', status: 'Pending Payment', date: '2026-07-17', amount: 34110000 },
    ],
    payments: [
      { id: 'PAY-9001', orderId: 'SO10431', method: 'DVA', amount: 51165000, status: 'Matched', date: '2026-07-14' },
      { id: 'PAY-9002', orderId: 'SO10432', method: 'Bank Transfer', amount: 74400000, status: 'Matched', date: '2026-07-16' },
      { id: 'PAY-9003', orderId: 'SO10433', method: 'Wallet', amount: 34110000, status: 'Pending', date: '2026-07-17' },
    ],
    complaints: [
      { id: 'CMP-501', type: 'Loading Delay', description: 'Truck waited 3 hours at Lagos AIPEC gate.', priority: 'Medium', assignedTo: 'Operations', status: 'Resolved', date: '2026-07-10' },
    ],
    messages: [
      { id: 'MSG-1', channel: 'WhatsApp', text: "Good morning, is today's PMS price still ₦1,074.50?", date: '2026-07-17 08:12', direction: 'inbound' },
      { id: 'MSG-2', channel: 'WhatsApp', text: 'Yes ma, that price holds until 12pm today.', date: '2026-07-17 08:15', direction: 'outbound' },
      { id: 'MSG-3', channel: 'Phone Note', text: 'Called to confirm SO10432 truck details.', date: '2026-07-16 14:02', direction: 'outbound' },
    ],
    activityLog: [
      { id: 'ACT-1', description: 'Order SO10433 created', timestamp: '2026-07-17 09:58' },
      { id: 'ACT-2', description: 'Wallet funded ₦5,000,000', timestamp: '2026-07-17 10:43' },
      { id: 'ACT-3', description: 'Order SO10432 marked Awaiting Pickup', timestamp: '2026-07-16 11:20' },
    ],
    documents: [
      { id: 'DOC-1', name: 'CAC Certificate.pdf', type: 'Registration', uploadedAt: '2026-03-02' },
      { id: 'DOC-2', name: 'TIN Certificate.pdf', type: 'Tax', uploadedAt: '2026-03-02' },
    ],
  },
  {
    id: 'CUST-1002',
    companyName: 'Kaystra Enterprise',
    contactName: 'Malik Adekanmbi',
    phone: '07037942384',
    email: 'malik@kaystra.com',
    address: '22 Ikorodu Road, Lagos',
    tin: '02345678-0001',
    cac: 'RC0997231',
    status: 'Active',
    verified: true,
    customerSince: 'January 2025',
    relationshipManager: 'Victory',
    walletBalance: 2100000,
    availableCredit: 0,
    pendingDeposits: 0,
    virtualAccountNumber: '9012345690',
    loyaltyTier: 'Silver',
    creditEligible: false,
    preferredDepot: 'Port Harcourt',
    preferredProduct: 'AGO',
    avgMonthlyVolume: 180000,
    preferredPaymentMethod: 'Bank Transfer',
    preferredContactMethod: 'Phone',
    vehicleNumbers: ['GBB-699-XA'],
    orders: [
      { id: 'SO10399', product: 'AGO', quantity: 30000, unit: 'L', depot: 'Port Harcourt', status: 'Completed', date: '2026-07-02', amount: 34110000 },
    ],
    payments: [
      { id: 'PAY-9010', orderId: 'SO10399', method: 'Bank Transfer', amount: 34110000, status: 'Matched', date: '2026-07-02' },
    ],
    complaints: [
      { id: 'CMP-502', type: 'Wrong Quantity', description: 'Received 29,600L instead of 30,000L.', priority: 'High', assignedTo: 'Operations', status: 'In Progress' as ComplaintStatus, date: '2026-07-15' },
    ],
    messages: [
      { id: 'MSG-4', channel: 'SMS', text: 'Confirm your truck is en route to Port Harcourt depot.', date: '2026-07-15 07:40', direction: 'outbound' },
    ],
    activityLog: [
      { id: 'ACT-4', description: 'Complaint CMP-502 raised', timestamp: '2026-07-15 16:05' },
    ],
    documents: [],
  },
  {
    id: 'CUST-1003',
    companyName: 'Jorax Oil Petrochemical',
    contactName: 'Bala Suleiman',
    phone: '08039133550',
    email: 'bala@joraxoil.ng',
    address: '5 Trans-Amadi Layout, Port Harcourt',
    tin: '03456789-0001',
    cac: 'RC1043221',
    status: 'Active',
    verified: false,
    customerSince: 'June 2026',
    relationshipManager: 'Ifeoma',
    walletBalance: 0,
    availableCredit: 0,
    pendingDeposits: 17100000,
    virtualAccountNumber: '9012345701',
    loyaltyTier: 'Bronze',
    creditEligible: false,
    preferredDepot: 'Port Harcourt',
    preferredProduct: 'PMS',
    avgMonthlyVolume: 95000,
    preferredPaymentMethod: 'DVA',
    preferredContactMethod: 'WhatsApp',
    vehicleNumbers: [],
    orders: [
      { id: 'SO10400', product: 'PMS', quantity: 30000, unit: 'L', depot: 'Port Harcourt', status: 'Pending Payment', date: '2026-07-13', amount: 34110000 },
    ],
    payments: [
      { id: 'PAY-9020', orderId: 'SO10400', method: 'DVA', amount: 17100000, status: 'Pending', date: '2026-07-13' },
    ],
    complaints: [],
    messages: [
      { id: 'MSG-5', channel: 'Email', text: 'Please send today\'s AGO and PMS price list.', date: '2026-07-17 07:55', direction: 'inbound' },
    ],
    activityLog: [
      { id: 'ACT-5', description: 'New customer registered', timestamp: '2026-06-01 09:00' },
    ],
    documents: [],
  },
  {
    id: 'CUST-1004',
    companyName: 'Oracreek Nigeria Ltd',
    contactName: 'Ngozi Eze',
    phone: '08132515820',
    email: 'ngozi@oracreek.ng',
    address: '9 Aba Road, Port Harcourt',
    tin: '04567890-0001',
    cac: 'RC0885521',
    status: 'Inactive',
    verified: true,
    customerSince: 'August 2024',
    relationshipManager: 'Ifeoma',
    walletBalance: 640000,
    availableCredit: 0,
    pendingDeposits: 0,
    virtualAccountNumber: '9012345712',
    loyaltyTier: 'Silver',
    creditEligible: false,
    preferredDepot: 'Port Harcourt',
    preferredProduct: 'AGO',
    avgMonthlyVolume: 60000,
    preferredPaymentMethod: 'Wallet',
    preferredContactMethod: 'Email',
    vehicleNumbers: ['EDIT-815-KD'],
    orders: [
      { id: 'SO10310', product: 'AGO', quantity: 20000, unit: 'L', depot: 'Port Harcourt', status: 'Completed', date: '2026-06-10', amount: 22740000 },
    ],
    payments: [
      { id: 'PAY-9030', orderId: 'SO10310', method: 'Wallet', amount: 22740000, status: 'Matched', date: '2026-06-10' },
    ],
    complaints: [
      { id: 'CMP-503', type: 'Price', description: 'Disputes rate applied on last order.', priority: 'Low', assignedTo: 'Finance', status: 'Open', date: '2026-06-12' },
    ],
    messages: [],
    activityLog: [
      { id: 'ACT-6', description: 'Last order completed', timestamp: '2026-06-10 12:00' },
    ],
    documents: [],
  },
];

const RECENT_ACTIVITY = [
  { time: '10:43 AM', text: 'Muhammad Bello funded wallet', sub: '₦5,000,000', icon: Wallet },
  { time: '10:35 AM', text: 'Order SO10432 created', sub: 'ABC Energy Ltd', icon: ShoppingCart },
  { time: '10:20 AM', text: 'Complaint received', sub: 'Late loading — Kaystra Enterprise', icon: MessageSquareWarning },
  { time: '09:58 AM', text: 'New customer registered', sub: 'ABC Energy Ltd', icon: UserPlus },
];

const FOLLOW_UPS = [
  { title: 'Call ABC Energy', detail: 'No order in 12 days', icon: PhoneCall, tone: 'amber' as const },
  { title: 'Follow up', detail: 'Outstanding quotation — Kaystra Enterprise', icon: FileText, tone: 'blue' as const },
  { title: 'Wallet low balance', detail: 'Oracreek Nigeria Ltd', icon: Wallet, tone: 'amber' as const },
  { title: 'Customer complaint unresolved', detail: '2 days — Oracreek Nigeria Ltd', icon: AlertTriangle, tone: 'red' as const },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtMoney = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const fmtNum = (n: number) => n.toLocaleString('en-NG');

const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Awaiting Pickup': 'bg-blue-50 text-blue-700 border-blue-200',
  'Pending Payment': 'bg-amber-50 text-amber-700 border-amber-200',
};

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  'Matched': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
  'Failed': 'bg-red-50 text-red-700 border-red-200',
  'Refunded': 'bg-slate-100 text-slate-600 border-slate-200',
};

const COMPLAINT_STATUS_STYLE: Record<string, string> = {
  'Open': 'bg-red-50 text-red-700 border-red-200',
  'Assigned': 'bg-blue-50 text-blue-700 border-blue-200',
  'Working': 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Resolved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Closed': 'bg-slate-100 text-slate-600 border-slate-200',
};

const PRIORITY_STYLE: Record<ComplaintPriority, string> = {
  High: 'bg-red-50 text-red-700 border-red-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const TONE_STYLE = {
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  red: 'border-red-200 bg-red-50 text-red-700',
};

// ─────────────────────────────────────────────────────────────────────────────
// Small shared building blocks
// ─────────────────────────────────────────────────────────────────────────────

function KPICard({ label, value, icon, tone = 'neutral' }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const toneWrap: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-2">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', toneWrap[tone])}>
        {icon}
      </div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-950 tracking-tight">{value}</p>
    </div>
  );
}

function QuickActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white px-3 py-4 text-center hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors group"
    >
      <div className="h-9 w-9 rounded-full bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-700 flex items-center justify-center transition-colors">
        {icon}
      </div>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
    </button>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase border', className)}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant panel (mock — keyword-matched canned responses over mock data)
// ─────────────────────────────────────────────────────────────────────────────

function generateAIResponse(query: string, customers: Customer[]): string {
  const q = query.toLowerCase();

  if (q.includes("haven't ordered") || q.includes('havent ordered') || q.includes('no order')) {
    const names = customers.filter((c) => c.status === 'Inactive').map((c) => c.companyName);
    return names.length
      ? `${names.length} customer(s) look inactive: ${names.join(', ')}.`
      : 'No customers match that right now.';
  }
  if (q.includes('buying agO'.toLowerCase()) || (q.includes('agO'.toLowerCase()) && q.includes('week'))) {
    const names = customers.filter((c) => c.preferredProduct === 'AGO').map((c) => c.companyName);
    return names.length ? `Buying AGO this week: ${names.join(', ')}.` : 'No AGO orders found this week.';
  }
  if (q.includes('pending payment')) {
    const names = customers.filter((c) => c.orders.some((o) => o.status === 'Pending Payment')).map((c) => c.companyName);
    return names.length ? `Pending payments: ${names.join(', ')}.` : 'No customers have pending payments.';
  }
  if (q.includes('quotation')) {
    const match = customers.find((c) => q.includes(c.companyName.toLowerCase().split(' ')[0]));
    return match
      ? `Draft quotation prepared for ${match.companyName} — ${fmtNum(match.avgMonthlyVolume)}L ${match.preferredProduct} at ${match.preferredDepot}. Ready to send from the Orders tab.`
      : "Tell me which customer to quote, e.g. \"Create a quotation for ABC Energy\".";
  }
  if (q.includes('top customer')) {
    const top = [...customers].sort((a, b) => b.avgMonthlyVolume - a.avgMonthlyVolume).slice(0, 3);
    return `Today's top customers by volume: ${top.map((c) => `${c.companyName} (${fmtNum(c.avgMonthlyVolume)}L/mo)`).join(', ')}.`;
  }
  return "I can help with things like \"Show customers that haven't ordered in 30 days\", \"Find everyone buying AGO this week\", \"Which customers have pending payments?\", or \"Show today's top customers\".";
}

const AI_SUGGESTIONS = [
  "Show today's top customers",
  'Which customers have pending payments?',
  "Show customers that haven't ordered in 30 days",
  'Find everyone buying AGO this week',
];

function AIAssistantPanel({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: 'Ask me anything about your customers, orders, or payments — plain English is fine.' },
  ]);

  const handleAsk = () => {
    const q = query.trim();
    if (!q) return;
    const response = generateAIResponse(q, customers);
    setThread((prev) => [...prev, { role: 'user', text: q }, { role: 'ai', text: response }]);
    setQuery('');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">AI Assistant</p>
          <p className="text-xs text-slate-500">Ask a question in plain English — it searches your customers, orders, and payments for you.</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="max-w-2xl mx-auto space-y-3 max-h-64 overflow-y-auto py-1">
          {thread.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] sm:max-w-md rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                m.role === 'user' ? 'bg-slate-900 text-white rounded-br-md' : 'bg-emerald-50 text-emerald-900 rounded-bl-md'
              )}>
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {AI_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
              placeholder="Ask the assistant…"
              className="flex-1 h-10 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
            />
            <Button size="sm" className="h-10 px-4 gap-1.5" onClick={handleAsk}>
              Ask <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer profile — summary header + tabs
// ─────────────────────────────────────────────────────────────────────────────

function CustomerSummaryHeader({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const outstandingOrders = customer.orders.filter((o) => o.status !== 'Completed').length;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 mb-3">
        <ChevronLeft size={14} /> Back to dashboard
      </button>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shrink-0">
            {customer.companyName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-950">{customer.companyName.toUpperCase()}</h1>
              {customer.verified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <ShieldCheck size={11} /> Verified
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer Since {customer.customerSince} · Relationship Manager: {customer.relationshipManager}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Status</p>
            <p className={cn('text-sm font-bold', customer.status === 'Active' ? 'text-emerald-600' : 'text-slate-400')}>{customer.status}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Wallet Balance</p>
            <p className="text-sm font-bold text-slate-900">{fmtMoney(customer.walletBalance)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Loyalty Tier</p>
            <p className="text-sm font-bold text-amber-600 flex items-center gap-1"><Star size={12} className="fill-amber-500 text-amber-500" /> {customer.loyaltyTier}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Credit Eligible</p>
            <p className={cn('text-sm font-bold', customer.creditEligible ? 'text-emerald-600' : 'text-slate-400')}>{customer.creditEligible ? 'YES' : 'NO'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Outstanding Orders</p>
            <p className="text-sm font-bold text-slate-900">{outstandingOrders}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ customer }: { customer: Customer }) {
  const rows: Array<[string, string, React.ReactNode]> = [
    ['Company', customer.companyName, <Building2 size={13} key="i" />],
    ['Contact', customer.contactName, <Users size={13} key="i" />],
    ['Phone', customer.phone, <Phone size={13} key="i" />],
    ['Email', customer.email, <Mail size={13} key="i" />],
    ['Address', customer.address, <MapPin size={13} key="i" />],
    ['TIN', customer.tin, <FileText size={13} key="i" />],
    ['CAC', customer.cac, <FileText size={13} key="i" />],
  ];
  const prefs: Array<[string, string]> = [
    ['Preferred Depot', customer.preferredDepot],
    ['Preferred Product', customer.preferredProduct],
    ['Average Monthly Volume', `${fmtNum(customer.avgMonthlyVolume)} L`],
    ['Preferred Payment Method', customer.preferredPaymentMethod],
    ['Preferred Contact Method', customer.preferredContactMethod],
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer Information</p>
        <div className="divide-y divide-slate-100">
          {rows.map(([label, value, icon]) => (
            <div key={label} className="flex items-center gap-2.5 py-2 text-sm">
              <span className="text-slate-400 shrink-0">{icon}</span>
              <span className="text-slate-500 w-28 shrink-0">{label}</span>
              <span className="text-slate-800 font-medium truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Preferences</p>
        <div className="divide-y divide-slate-100">
          {prefs.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-500">{label}</span>
              <span className="text-slate-800 font-semibold">{value}</span>
            </div>
          ))}
        </div>
        {customer.vehicleNumbers.length > 0 && (
          <div className="pt-2">
            <p className="text-xs text-slate-500 mb-1.5">Registered Vehicles</p>
            <div className="flex flex-wrap gap-1.5">
              {customer.vehicleNumbers.map((v) => (
                <span key={v} className="text-[11px] font-mono px-2 py-1 rounded bg-slate-100 text-slate-700">{v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTab({ customer, onDuplicate }: { customer: Customer; onDuplicate: (o: CustomerOrder) => void }) {
  if (customer.orders.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No orders yet.</div>;
  }
  return (
    <div className="space-y-2.5">
      {customer.orders.map((o) => (
        <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-50 text-slate-600 shrink-0"><Package size={16} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono font-bold text-sm text-slate-900">{o.id}</p>
              <Pill className={ORDER_STATUS_STYLE[o.status]}>{o.status}</Pill>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{fmtNum(o.quantity)}{o.unit} {o.product} · {o.depot} · {o.date}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-slate-900">{fmtMoney(o.amount)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => onDuplicate(o)}><Copy size={12} /> Duplicate</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"><Download size={12} /> Invoice</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"><Truck size={12} /> Track</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WalletTab({ customer }: { customer: Customer }) {
  const [showAdjust, setShowAdjust] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Wallet Balance" value={fmtMoney(customer.walletBalance)} icon={<Wallet size={16} />} tone="green" />
        <KPICard label="Available Credit" value={fmtMoney(customer.availableCredit)} icon={<Banknote size={16} />} tone="blue" />
        <KPICard label="Pending Deposits" value={fmtMoney(customer.pendingDeposits)} icon={<Clock size={16} />} tone="amber" />
        <KPICard label="Virtual Account" value={customer.virtualAccountNumber} icon={<ShieldCheck size={16} />} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5"><Wallet size={13} /> Fund Wallet</Button>
        <Button size="sm" variant="outline" className="gap-1.5"><ArrowRight size={13} /> Transfer Wallet</Button>
        <Button size="sm" variant="outline" className="gap-1.5"><RotateCcw size={13} /> Refund</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdjust((v) => !v)}><ClipboardList size={13} /> Adjust Balance</Button>
        <Button size="sm" variant="outline" className="gap-1.5"><Download size={13} /> Download Statement</Button>
      </div>
      {showAdjust && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Balance adjustment requires a reason and is logged to the activity trail — wire-up pending backend support.
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-100">Recent Transactions</p>
        <div className="divide-y divide-slate-100">
          {customer.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium text-slate-800">{p.method}{p.orderId ? ` · ${p.orderId}` : ''}</p>
                <p className="text-xs text-slate-400">{p.date}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{fmtMoney(p.amount)}</p>
                <Pill className={PAYMENT_STATUS_STYLE[p.status]}>{p.status}</Pill>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentsTab({ customer }: { customer: Customer }) {
  if (customer.payments.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No payments recorded.</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Payment</th>
            <th className="px-4 py-2.5">Order</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5 text-right">Amount</th>
            <th className="px-4 py-2.5 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customer.payments.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{p.id}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.orderId || '—'}</td>
              <td className="px-4 py-2.5 text-slate-700">{p.method}</td>
              <td className="px-4 py-2.5 text-slate-500">{p.date}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{fmtMoney(p.amount)}</td>
              <td className="px-4 py-2.5 text-right"><Pill className={PAYMENT_STATUS_STYLE[p.status]}>{p.status}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplaintsTab({ customer, onUpdate }: { customer: Customer; onUpdate: (id: string, patch: Partial<CustomerComplaint>) => void }) {
  if (customer.complaints.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No complaints on file.</div>;
  }
  const ASSIGNEES = ['Operations', 'Finance', 'IT', 'Sales', 'Transport', 'Management'];
  const STATUSES: ComplaintStatus[] = ['Open', 'Assigned', 'Working', 'Resolved', 'Closed'];
  return (
    <div className="space-y-2.5">
      {customer.complaints.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm text-slate-900">{c.type}</p>
                <Pill className={PRIORITY_STYLE[c.priority]}>{c.priority}</Pill>
                <Pill className={COMPLAINT_STATUS_STYLE[c.status] || 'bg-slate-100 text-slate-600 border-slate-200'}>{c.status}</Pill>
              </div>
              <p className="text-xs text-slate-500 mt-1">{c.description}</p>
              <p className="text-[11px] text-slate-400 mt-1">{c.date}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <select
              aria-label="Assign to"
              value={c.assignedTo}
              onChange={(e) => onUpdate(c.id, { assignedTo: e.target.value })}
              className="h-8 text-xs rounded-md border border-slate-200 bg-slate-50 px-2"
            >
              {ASSIGNEES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              aria-label="Status"
              value={c.status}
              onChange={(e) => onUpdate(c.id, { status: e.target.value as ComplaintStatus })}
              className="h-8 text-xs rounded-md border border-slate-200 bg-slate-50 px-2"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1"><MessageCircle size={12} /> Comment</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-red-600 hover:text-red-700"><TrendingUp size={12} /> Escalate</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const CHANNEL_ICON: Record<MessageChannel, React.ElementType> = {
  WhatsApp: MessageCircle,
  SMS: Send,
  Email: Mail,
  'Phone Note': PhoneCall,
};

function MessagesTab({ customer }: { customer: Customer }) {
  if (customer.messages.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No messages yet.</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {customer.messages.map((m) => {
        const Icon = CHANNEL_ICON[m.channel];
        return (
          <div key={m.id} className={cn('flex items-start gap-3 px-4 py-3', m.direction === 'outbound' && 'bg-slate-50/60')}>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0"><Icon size={14} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">{m.channel}</span>
                <span className="text-[11px] text-slate-400">{m.direction === 'inbound' ? 'from customer' : 'to customer'}</span>
              </div>
              <p className="text-sm text-slate-800 mt-0.5">{m.text}</p>
              <p className="text-[11px] text-slate-400 mt-1">{m.date}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsTab({ customer }: { customer: Customer }) {
  if (customer.documents.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No documents uploaded.</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {customer.documents.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-3">
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0"><FileText size={14} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
            <p className="text-xs text-slate-400">{d.type} · uploaded {d.uploadedAt}</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1"><Download size={12} /> Download</Button>
        </div>
      ))}
    </div>
  );
}

function ActivityLogTab({ customer }: { customer: Customer }) {
  if (customer.activityLog.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">No activity yet.</div>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      {customer.activityLog.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
          <span className="text-slate-700 flex-1">{a.description}</span>
          <span className="text-xs text-slate-400 shrink-0">{a.timestamp}</span>
        </div>
      ))}
    </div>
  );
}

function CustomerProfile({ customer, onBack, onUpdateComplaint, onDuplicateOrder }: {
  customer: Customer;
  onBack: () => void;
  onUpdateComplaint: (customerId: string, complaintId: string, patch: Partial<CustomerComplaint>) => void;
  onDuplicateOrder: (customer: Customer, order: CustomerOrder) => void;
}) {
  return (
    <div className="space-y-4">
      <CustomerSummaryHeader customer={customer} onBack={onBack} />
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="complaints">Complaints</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab customer={customer} /></TabsContent>
        <TabsContent value="orders"><OrdersTab customer={customer} onDuplicate={(o) => onDuplicateOrder(customer, o)} /></TabsContent>
        <TabsContent value="wallet"><WalletTab customer={customer} /></TabsContent>
        <TabsContent value="payments"><PaymentsTab customer={customer} /></TabsContent>
        <TabsContent value="complaints">
          <ComplaintsTab customer={customer} onUpdate={(id, patch) => onUpdateComplaint(customer.id, id, patch)} />
        </TabsContent>
        <TabsContent value="messages"><MessagesTab customer={customer} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab customer={customer} /></TabsContent>
        <TabsContent value="activity"><ActivityLogTab customer={customer} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Order wizard
// ─────────────────────────────────────────────────────────────────────────────

function CreateOrderWizard({ open, onClose, customers, presetCustomerId, presetOrder, onCreated }: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  presetCustomerId?: string;
  presetOrder?: CustomerOrder;
  onCreated: (customerId: string, order: CustomerOrder) => void;
}) {
  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState(presetCustomerId || '');
  const [product, setProduct] = useState(presetOrder?.product || '');
  const [depot, setDepot] = useState(presetOrder?.depot || '');
  const [quantity, setQuantity] = useState(presetOrder ? String(presetOrder.quantity) : '');
  const [payment, setPayment] = useState('Wallet');

  const customer = customers.find((c) => c.id === customerId);
  const unitPrice = 1137; // today's illustrative price — auto-loaded, not editable
  const total = (Number(quantity) || 0) * unitPrice;

  const reset = () => {
    setStep(1); setCustomerId(''); setProduct(''); setDepot(''); setQuantity(''); setPayment('Wallet');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleGenerate = () => {
    if (!customer) return;
    const newOrder: CustomerOrder = {
      id: `SO${10440 + Math.floor(Math.random() * 900)}`,
      product, quantity: Number(quantity) || 0, unit: 'L', depot,
      status: 'Pending Payment', date: new Date().toISOString().slice(0, 10), amount: total,
    };
    onCreated(customerId, newOrder);
    handleClose();
  };

  const steps = ['Customer', 'Product', 'Depot', 'Quantity', 'Price', 'Payment', 'Generate'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create Order</DialogTitle>
          <DialogDescription>Step {step} of {steps.length} — {steps[step - 1]}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-2">
          {steps.map((s, i) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full', i < step ? 'bg-emerald-500' : 'bg-slate-100')} />
          ))}
        </div>

        <div className="min-h-[220px]">
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Customer</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomerId(c.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors',
                      customerId === c.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <p className="font-semibold text-slate-800">{c.companyName}</p>
                    <p className="text-xs text-slate-400">{c.phone} · {c.preferredDepot}</p>
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1"><UserPlus size={13} /> Create New Customer Instead</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Choose Product</p>
              <div className="grid grid-cols-2 gap-2">
                {PRODUCTS.map((p) => (
                  <button key={p} type="button" onClick={() => setProduct(p)}
                    className={cn('rounded-lg border px-4 py-3 text-sm font-semibold', product === p ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Choose Depot</p>
              <div className="grid grid-cols-1 gap-2">
                {DEPOTS.map((d) => (
                  <button key={d} type="button" onClick={() => setDepot(d)}
                    className={cn('rounded-lg border px-4 py-2.5 text-sm font-semibold text-left flex items-center gap-2', depot === d ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>
                    <MapPin size={14} /> {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <label htmlFor="order-qty" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantity (Litres)</label>
              <input
                id="order-qty"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="45000"
                className="w-full h-11 rounded-md border border-slate-200 bg-slate-50 px-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Price (auto-loaded)</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Unit Price</span><span className="font-semibold text-slate-800">{fmtMoney(unitPrice)}/L</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Quantity</span><span className="font-semibold text-slate-800">{fmtNum(Number(quantity) || 0)}L</span></div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200"><span className="text-slate-500">Total</span><span className="font-bold text-emerald-700">{fmtMoney(total)}</span></div>
              </div>
              <p className="text-[11px] text-slate-400">Price is set centrally — officer cannot edit unless permitted.</p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Method</p>
              <div className="grid grid-cols-1 gap-2">
                {['Wallet', 'DVA', 'Bank Transfer', 'Split Payment', 'Pay Later (Credit Customers)'].map((m) => (
                  <button key={m} type="button" onClick={() => setPayment(m)}
                    className={cn('rounded-lg border px-4 py-2.5 text-sm font-semibold text-left', payment === m ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50')}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3 text-center py-6">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">Ready to generate this order</p>
              <p className="text-xs text-slate-500">
                {customer?.companyName} · {fmtNum(Number(quantity) || 0)}L {product} · {depot} · {payment}
              </p>
              <p className="text-[11px] text-slate-400">On generate: reference + invoice created, WhatsApp/SMS/Email sent automatically.</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)} className="gap-1"><ChevronLeft size={14} /> Back</Button>}
          {step < 7 ? (
            <Button
              size="sm"
              className="gap-1"
              disabled={(step === 1 && !customerId) || (step === 2 && !product) || (step === 3 && !depot) || (step === 4 && !quantity)}
              onClick={() => setStep((s) => s + 1)}
            >
              Next <ChevronRight size={14} />
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={handleGenerate}><Sparkles size={14} /> Generate Order</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Customer dialog
// ─────────────────────────────────────────────────────────────────────────────

function NewCustomerDialog({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (c: { companyName: string; contactName: string; phone: string; email: string }) => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const reset = () => { setCompanyName(''); setContactName(''); setPhone(''); setEmail(''); };
  const handleClose = () => { reset(); onClose(); };

  const canSave = companyName.trim() && phone.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
          <DialogDescription>Just the essentials — profile enrichment (preferred depot, product, etc.) happens on the profile page.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Company Name</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ABC Energy Ltd" className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Name</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803…" className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button size="sm" disabled={!canSave} onClick={() => { onCreate({ companyName, contactName, phone, email }); handleClose(); }}>Create Customer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Complaint dialog
// ─────────────────────────────────────────────────────────────────────────────

const COMPLAINT_TYPES = ['Loading Delay', 'Payment Issue', 'Price', 'System', 'Truck', 'Driver', 'Refund', 'Other'];

function RecordComplaintDialog({ open, onClose, customers, onRecord }: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  onRecord: (customerId: string, complaint: CustomerComplaint) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState(COMPLAINT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('Medium');
  const [assignedTo, setAssignedTo] = useState('Operations');

  const reset = () => { setCustomerId(''); setType(COMPLAINT_TYPES[0]); setDescription(''); setPriority('Medium'); setAssignedTo('Operations'); };
  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Record Complaint</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
              <option value="">— Select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ComplaintPriority)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
                {(['High', 'Medium', 'Low'] as const).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign To</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
              {['Operations', 'Finance', 'IT', 'Sales', 'Transport', 'Management'].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened?" className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!customerId || !description.trim()}
            onClick={() => {
              onRecord(customerId, {
                id: `CMP-${500 + Math.floor(Math.random() * 400)}`,
                type, description: description.trim(), priority, assignedTo, status: 'Open',
                date: new Date().toISOString().slice(0, 10),
              });
              handleClose();
            }}
          >
            Record Complaint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast dialog (price list / promotions / holiday / maintenance)
// ─────────────────────────────────────────────────────────────────────────────

const AUDIENCES = ['Everyone', 'PMS Customers', 'AGO Customers', 'LPG Customers', 'Jet A1 Customers', 'Inactive Customers', 'VIP Customers'];
const BROADCAST_TYPES = ["Today's Prices", 'Promotions', 'Holiday Messages', 'Maintenance Notices'];
const CHANNELS = ['SMS', 'WhatsApp', 'Email', 'Push Notification'];

function BroadcastDialog({ open, onClose, defaultType, onSend }: {
  open: boolean;
  onClose: () => void;
  defaultType: string;
  onSend: (summary: string) => void;
}) {
  const [type, setType] = useState(defaultType);
  const [channels, setChannels] = useState<string[]>(['SMS']);
  const [audience, setAudience] = useState('Everyone');
  const [message, setMessage] = useState('');

  const reset = () => { setType(defaultType); setChannels(['SMS']); setAudience('Everyone'); setMessage(''); };
  const handleClose = () => { reset(); onClose(); };

  const toggleChannel = (c: string) => setChannels((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); if (v) setType(defaultType); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Broadcast</DialogTitle>
          <DialogDescription>Send an update to a group of customers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
              {BROADCAST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Audience</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Channels</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', channels.includes(c) ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Message</label>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your message…" className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!message.trim() || channels.length === 0}
            onClick={() => { onSend(`${type} sent to ${audience} via ${channels.join(', ')}.`); handleClose(); }}
          >
            <Send size={13} /> Send Broadcast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Instant customer search
// ─────────────────────────────────────────────────────────────────────────────

function CustomerSearchBar({ customers, onSelect }: { customers: Customer[]; onSelect: (c: Customer) => void }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) =>
      c.companyName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.virtualAccountNumber.includes(q) ||
      c.orders.some((o) => o.id.toLowerCase().includes(q)) ||
      c.vehicleNumbers.some((v) => v.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [query, customers]);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by phone, company, customer ID, wallet account, order ref, or vehicle number…"
          className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 shadow-sm"
        />
      </div>
      {query.trim() && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-slate-400 text-center">No matches.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); setQuery(''); }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-slate-800">{c.companyName}</p>
                  <Pill className={c.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>{c.status}</Pill>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{c.phone} · {c.id}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home
// ─────────────────────────────────────────────────────────────────────────────

function DashboardHome({ customers, onSelectCustomer, onQuickAction }: {
  customers: Customer[];
  onSelectCustomer: (c: Customer) => void;
  onQuickAction: (action: string) => void;
}) {
  const kpis = useMemo(() => {
    const pendingPayments = customers.reduce((s, c) => s + c.orders.filter((o) => o.status === 'Pending Payment').length, 0);
    const pendingComplaints = customers.reduce((s, c) => s + c.complaints.filter((cm) => cm.status !== 'Resolved' && cm.status !== 'Closed').length, 0);
    const awaitingPickup = customers.reduce((s, c) => s + c.orders.filter((o) => o.status === 'Awaiting Pickup').length, 0);
    const walletDepositsToday = customers.reduce((s, c) => s + c.pendingDeposits, 0);
    return { pendingPayments, pendingComplaints, awaitingPickup, walletDepositsToday };
  }, [customers]);

  return (
    <div className="space-y-5">
      <CustomerSearchBar customers={customers} onSelect={onSelectCustomer} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Customers Assisted Today" value="12" icon={<Users size={16} />} tone="blue" />
        <KPICard label="Orders Created Today" value="6" icon={<ShoppingCart size={16} />} tone="green" />
        <KPICard label="Pending Payments" value={String(kpis.pendingPayments)} icon={<Clock size={16} />} tone="amber" />
        <KPICard label="Pending Complaints" value={String(kpis.pendingComplaints)} icon={<MessageSquareWarning size={16} />} tone="red" />
        <KPICard label="Orders Awaiting Pickup" value={String(kpis.awaitingPickup)} icon={<Package size={16} />} tone="blue" />
        <KPICard label="Unread Customer Messages" value="3" icon={<Mail size={16} />} tone="amber" />
        <KPICard label="New Customer Registrations" value="1" icon={<UserPlus size={16} />} tone="green" />
        <KPICard label="Wallet Deposits Today" value={fmtMoney(kpis.walletDepositsToday)} icon={<Wallet size={16} />} />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Quick Actions</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          <QuickActionButton label="New Customer" icon={<UserPlus size={16} />} onClick={() => onQuickAction('new-customer')} />
          <QuickActionButton label="Create Order" icon={<ShoppingCart size={16} />} onClick={() => onQuickAction('create-order')} />
          <QuickActionButton label="Search Customer" icon={<Search size={16} />} onClick={() => onQuickAction('search')} />
          <QuickActionButton label="Record Complaint" icon={<MessageSquareWarning size={16} />} onClick={() => onQuickAction('complaint')} />
          <QuickActionButton label="Send Price List" icon={<Send size={16} />} onClick={() => onQuickAction('price-list')} />
          <QuickActionButton label="Broadcast Promotion" icon={<Megaphone size={16} />} onClick={() => onQuickAction('broadcast')} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Recent Activity</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="p-1.5 rounded-lg bg-slate-50 text-slate-500 shrink-0"><a.icon size={14} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">{a.text}</p>
                  <p className="text-xs text-slate-400 truncate">{a.sub}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Follow-up Queue</p>
          <div className="space-y-2">
            {FOLLOW_UPS.map((f, i) => (
              <div key={i} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5', TONE_STYLE[f.tone])}>
                <f.icon size={15} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs opacity-80 truncate">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CustomerDesk() {
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderWizard, setOrderWizard] = useState<{ open: boolean; customerId?: string; order?: CustomerOrder }>({ open: false });
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState<{ open: boolean; defaultType: string }>({ open: false, defaultType: "Today's Prices" });
  const { toast } = useToast();

  const selected = customers.find((c) => c.id === selectedId) || null;

  const handleQuickAction = (action: string) => {
    if (action === 'new-customer') setNewCustomerOpen(true);
    else if (action === 'create-order') setOrderWizard({ open: true });
    else if (action === 'complaint') setComplaintOpen(true);
    else if (action === 'price-list') setBroadcastOpen({ open: true, defaultType: "Today's Prices" });
    else if (action === 'broadcast') setBroadcastOpen({ open: true, defaultType: 'Promotions' });
    else if (action === 'search') {
      const el = document.querySelector<HTMLInputElement>('input[placeholder^="Search by phone"]');
      el?.focus();
    }
  };

  const handleCreateCustomer = (data: { companyName: string; contactName: string; phone: string; email: string }) => {
    const newCustomer: Customer = {
      id: `CUST-${1000 + customers.length + 1}`,
      companyName: data.companyName,
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      address: '', tin: '', cac: '',
      status: 'Active', verified: false,
      customerSince: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      relationshipManager: 'Unassigned',
      walletBalance: 0, availableCredit: 0, pendingDeposits: 0,
      virtualAccountNumber: `90${Math.floor(Math.random() * 100000000)}`,
      loyaltyTier: 'Bronze', creditEligible: false,
      preferredDepot: DEPOTS[0], preferredProduct: PRODUCTS[0], avgMonthlyVolume: 0,
      preferredPaymentMethod: 'Wallet', preferredContactMethod: 'Phone',
      vehicleNumbers: [], orders: [], payments: [], complaints: [], messages: [],
      activityLog: [{ id: `ACT-${Date.now()}`, description: 'New customer registered', timestamp: new Date().toLocaleString('en-GB') }],
      documents: [],
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    toast({ title: 'Customer created', description: `${data.companyName} has been added.` });
    setSelectedId(newCustomer.id);
  };

  const handleOrderCreated = (customerId: string, order: CustomerOrder) => {
    setCustomers((prev) => prev.map((c) => c.id === customerId
      ? { ...c, orders: [order, ...c.orders], activityLog: [{ id: `ACT-${Date.now()}`, description: `Order ${order.id} created`, timestamp: new Date().toLocaleString('en-GB') }, ...c.activityLog] }
      : c));
    toast({ title: 'Order generated', description: `${order.id} created — invoice and notifications sent.` });
  };

  const handleDuplicateOrder = (customer: Customer, order: CustomerOrder) => {
    setOrderWizard({ open: true, customerId: customer.id, order });
  };

  const handleRecordComplaint = (customerId: string, complaint: CustomerComplaint) => {
    setCustomers((prev) => prev.map((c) => c.id === customerId
      ? { ...c, complaints: [complaint, ...c.complaints], activityLog: [{ id: `ACT-${Date.now()}`, description: `Complaint ${complaint.id} raised`, timestamp: new Date().toLocaleString('en-GB') }, ...c.activityLog] }
      : c));
    toast({ title: 'Complaint recorded', description: `${complaint.type} logged and assigned to ${complaint.assignedTo}.` });
  };

  const handleUpdateComplaint = (customerId: string, complaintId: string, patch: Partial<CustomerComplaint>) => {
    setCustomers((prev) => prev.map((c) => c.id === customerId
      ? { ...c, complaints: c.complaints.map((cm) => cm.id === complaintId ? { ...cm, ...patch } : cm) }
      : c));
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav />
        <TopBar />
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1500px] mx-auto space-y-5">
            <PageHeader title="Customer Desk" description="Your customer's representative inside Soroman — everything in one place." />

            {selected ? (
              <CustomerProfile
                customer={selected}
                onBack={() => setSelectedId(null)}
                onUpdateComplaint={handleUpdateComplaint}
                onDuplicateOrder={handleDuplicateOrder}
              />
            ) : (
              <DashboardHome customers={customers} onSelectCustomer={(c) => setSelectedId(c.id)} onQuickAction={handleQuickAction} />
            )}

            <AIAssistantPanel customers={customers} />
          </div>
        </div>
      </div>

      <CreateOrderWizard
        open={orderWizard.open}
        onClose={() => setOrderWizard({ open: false })}
        customers={customers}
        presetCustomerId={orderWizard.customerId}
        presetOrder={orderWizard.order}
        onCreated={handleOrderCreated}
      />
      <NewCustomerDialog open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} onCreate={handleCreateCustomer} />
      <RecordComplaintDialog open={complaintOpen} onClose={() => setComplaintOpen(false)} customers={customers} onRecord={handleRecordComplaint} />
      <BroadcastDialog
        open={broadcastOpen.open}
        defaultType={broadcastOpen.defaultType}
        onClose={() => setBroadcastOpen((s) => ({ ...s, open: false }))}
        onSend={(summary) => toast({ title: 'Broadcast sent', description: summary })}
      />
    </div>
  );
}
