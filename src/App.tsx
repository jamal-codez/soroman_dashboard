import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import Customers from "./pages/Customers";
import Finance from "./pages/Finance";
import Release from "./pages/Release";
import PaymentVerification from "./pages/PaymentVerify";
import Notify from "./pages/Notify";
import Settings from "./pages/Settings";
import OrderVerification from "./pages/OrderVerification";
import { DeliveryProcessing } from "./pages/DeliveryProcessing";
import { PickupProcessing } from "./pages/PickupProcessing";
import OfflineSales from "./pages/offlineSales";
import Report from "./pages/Report";
import Pricing from "./pages/Pricing";
import Agents from "./pages/Agents";
import SecurityPage from "./pages/Security";
import OrderAudit from "./pages/OrderAudit";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Index />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/release" element={<Release />} />
          <Route path="/payment-verify" element={<PaymentVerification />} />
          <Route path="/notifications" element={<Notify />} />
          <Route path="/users-management" element={<Settings />} />
          <Route path="/login" element={<Login />} />
          <Route path="/order-verification" element={<OrderVerification />} />
          <Route path="/delivery-processing" element={<DeliveryProcessing />} />
          <Route path="/pickup-processing" element={<PickupProcessing />} />
          <Route path="/offline-sales" element={<OfflineSales/>} />
          <Route path="/report" element={<Report/>} />
          <Route path="/pricing" element={<Pricing/>} />
          <Route path="/order-audit" element={<OrderAudit />} />
          {/* <Route path="/agents" element={<Agents />} /> */}
          <Route path="/security" element={<SecurityPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
