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
import { ROLES } from "./roles";

const queryClient = new QueryClient();

const App = () => {
  const role = localStorage.getItem('role'); // Retrieve role from storage

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Index />} />
            {role === ROLES.ADMIN.toString() && <Route path="/orders" element={<Orders />} />}
            {role === ROLES.FINANCE.toString() && <Route path="/finance" element={<Finance />} />}
            {role === ROLES.RELEASE.toString() && <Route path="/release" element={<Release />} />}
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/payment-verify" element={<PaymentVerification />} />
            <Route path="/notifications" element={<Notify />} />
            <Route path="/users-management" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
