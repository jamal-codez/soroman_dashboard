import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Lazy-loaded pages — each page is a separate JS chunk that only downloads
// when the user navigates to that route. This cuts the initial bundle from
// ~720KB down to ~200KB and makes subsequent navigations near-instant (cached).
// ---------------------------------------------------------------------------
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Orders = lazy(() => import("./pages/Orders"));
const Inventory = lazy(() => import("./pages/Inventory"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Customers = lazy(() => import("./pages/Customers"));
const Finance = lazy(() => import("./pages/Finance"));
const Release = lazy(() => import("./pages/Release"));
const PaymentVerification = lazy(() => import("./pages/PaymentVerify"));
const ConfirmedPayments = lazy(() => import("./pages/ConfirmedPayments"));
const Notify = lazy(() => import("./pages/Notify"));
const Settings = lazy(() => import("./pages/Settings"));
const OrderVerification = lazy(() => import("./pages/OrderVerification"));
const DeliveryProcessing = lazy(() => import("./pages/DeliveryProcessing").then(m => ({ default: m.DeliveryProcessing })));
const PickupProcessing = lazy(() => import("./pages/PickupProcessing").then(m => ({ default: m.PickupProcessing })));
const OfflineSales = lazy(() => import("./pages/offlineSales"));
const Report = lazy(() => import("./pages/Report"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Agents = lazy(() => import("./pages/Agents"));
const SecurityPage = lazy(() => import("./pages/Security"));
const OrderAudit = lazy(() => import("./pages/OrderAudit"));
const PFIPage = lazy(() => import("./pages/PFI"));
const OrdersPFI = lazy(() => import("./pages/OrdersPFI"));

// ---------------------------------------------------------------------------
// QueryClient with sane global defaults
// • staleTime 30s  → data is reused across route switches instead of
//                     hammering the API on every navigation.
// • gcTime 5min    → unmounted queries stay in cache so going "back" is instant.
// • retry 1        → fail fast; the user can always pull-to-refresh.
// • refetchOnWindowFocus limited to "stale" data only.
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// ---------------------------------------------------------------------------
// Lightweight spinner shown while a lazy chunk downloads (~100-200ms typical)
// ---------------------------------------------------------------------------
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-slate-100">
    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
  </div>
);

const isGeneralAdmin = () => {
  const raw = localStorage.getItem('role');
  const role = raw === null ? NaN : Number(raw);
  return role === 1;
};

const canViewPfi = () => {
  const raw = localStorage.getItem('role');
  const role = raw === null ? NaN : Number(raw);
  return role === 1 || role === 2;
};

const canViewConfirmedPayments = () => {
  const raw = localStorage.getItem('role');
  const role = raw === null ? NaN : Number(raw);
  return role === 0 || role === 1 || role === 2;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/dashboard" element={<Index />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders-pfi" element={<OrdersPFI />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route
                path="/pfi"
                element={canViewPfi() ? <PFIPage /> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/customers" element={<Customers />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/release" element={<Release />} />
              <Route path="/payment-verify" element={<PaymentVerification />} />
              <Route
                path="/confirmed-payments"
                element={canViewConfirmedPayments() ? <ConfirmedPayments /> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/notifications" element={<Notify />} />
              <Route path="/users-management" element={<Settings />} />
              <Route path="/login" element={<Login />} />
              <Route path="/order-verification" element={<OrderVerification />} />
              <Route path="/delivery-processing" element={<DeliveryProcessing />} />
              <Route path="/pickup-processing" element={<PickupProcessing />} />
              <Route path="/offline-sales" element={<OfflineSales />} />
              <Route path="/report" element={<Report />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route
                path="/agents"
                element={isGeneralAdmin() ? <Agents /> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/order-audit"
                element={isGeneralAdmin() ? <OrderAudit /> : <Navigate to="/dashboard" replace />}
              />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
