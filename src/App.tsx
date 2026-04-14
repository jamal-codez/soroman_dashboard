import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthGuard } from "@/components/AuthGuard";
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
const InHouseOrders = lazy(() => import("./pages/InHouseOrders"));
const InHouseCreate = lazy(() => import("./pages/InHouseCreate"));
const InHouseRecords = lazy(() => import("./pages/InHouseRecords"));
const InHouseSales = lazy(() => import("./pages/InHouseSales"));
const FleetTrucks = lazy(() => import("./pages/FleetTrucks"));
const FleetLedger = lazy(() => import("./pages/FleetLedger"));
const BuyersList = lazy(() => import("./pages/BuyersList"));
const Documents = lazy(() => import("./pages/SubmitRecord"));
const Records = lazy(() => import("./pages/Records"));
const DeliveryCustomersDB = lazy(() => import("./pages/DeliveryCustomersDB"));
const DeliverySalesLedger = lazy(() => import("./pages/DeliverySalesLedger"));
const DeliveryInventory = lazy(() => import("./pages/DeliveryInventory"));
const DeliveryPFIAllocations = lazy(() => import("./pages/DeliveryPFIAllocations"));

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

// ---------------------------------------------------------------------------
// Helper — wraps a page with AuthGuard (login required).
// Sidebar handles role-based visibility separately.
// ---------------------------------------------------------------------------
const Protected = ({ children }: { children: React.ReactNode }) => (
  <AuthGuard>{children}</AuthGuard>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />

              {/* Authenticated routes — any logged-in role */}
              <Route path="/dashboard" element={<Protected><Index /></Protected>} />
              <Route path="/orders" element={<Protected><Orders /></Protected>} />
              <Route path="/orders-pfi" element={<Protected><OrdersPFI /></Protected>} />
              <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
              <Route path="/customers" element={<Protected><Customers /></Protected>} />
              <Route path="/finance" element={<Protected><Finance /></Protected>} />
              <Route path="/release" element={<Protected><Release /></Protected>} />
              <Route path="/payment-verify" element={<Protected><PaymentVerification /></Protected>} />
              <Route path="/notifications" element={<Protected><Notify /></Protected>} />
              <Route path="/order-verification" element={<Protected><OrderVerification /></Protected>} />
              <Route path="/delivery-processing" element={<Protected><DeliveryProcessing /></Protected>} />
              <Route path="/pickup-processing" element={<Protected><PickupProcessing /></Protected>} />
              <Route path="/in-house-orders" element={<Protected><InHouseOrders /></Protected>} />
              <Route path="/in-house-create" element={<Protected><InHouseCreate /></Protected>} />
              <Route path="/in-house-records" element={<Protected><InHouseRecords /></Protected>} />
              <Route path="/in-house-sales" element={<Protected><InHouseSales /></Protected>} />
              <Route path="/fleet-trucks" element={<Protected><FleetTrucks /></Protected>} />
              <Route path="/fleet-ledger" element={<Protected><FleetLedger /></Protected>} />
              <Route path="/buyers-list" element={<Protected><BuyersList /></Protected>} />
              <Route path="/documents" element={<Protected><Documents /></Protected>} />
              <Route path="/records" element={<Protected><Records /></Protected>} />
              <Route path="/delivery-customers-db" element={<Protected><DeliveryCustomersDB /></Protected>} />
              <Route path="/delivery-sales-ledger" element={<Protected><DeliverySalesLedger /></Protected>} />
              <Route path="/delivery-inventory" element={<Protected><DeliveryInventory /></Protected>} />
              <Route path="/delivery-pfi-allocations" element={<Protected><DeliveryPFIAllocations /></Protected>} />
              <Route path="/offline-sales" element={<Protected><OfflineSales /></Protected>} />
              <Route path="/report" element={<Protected><Report /></Protected>} />
              <Route path="/pricing" element={<Protected><Pricing /></Protected>} />
              <Route path="/security" element={<Protected><SecurityPage /></Protected>} />

              {/* All authenticated routes */}
              <Route path="/pfi" element={<Protected><PFIPage /></Protected>} />
              <Route path="/confirmed-payments" element={<Protected><ConfirmedPayments /></Protected>} />
              <Route path="/users-management" element={<Protected><Settings /></Protected>} />
              <Route path="/agents" element={<Protected><Agents /></Protected>} />
              <Route path="/order-audit" element={<Protected><OrderAudit /></Protected>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
