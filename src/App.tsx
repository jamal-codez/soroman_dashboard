
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          <Route path="/delivery-processing" element={<DeliveryProcessing searchQuery={""} />} />
          <Route path="/pickup-processing" element={<PickupProcessing searchQuery={""} />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
