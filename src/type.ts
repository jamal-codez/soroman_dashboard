import { LucideIcon } from "lucide-react";

export interface AnalyticsData {
    orders: number;
    orders_change: number;
    sales_revenue: number;
    sales_revenue_change: number;
    fuel_volume: number;
    fuel_volume_change: number;
    active_customers: number;
    active_customers_change: number;
  }
  
  export interface SalesData {
    month: string;
    pms: number;
    ago: number;
    lpg: number;
    jet: number;
  }
  
  interface StatCardProps {
    title: string;
    value: string;
    change: string;
    changeDirection: 'up' | 'down';
    icon: LucideIcon;
    iconColor: string;
    iconBgColor: string;
    isLoading?: boolean;
  }
  
  export interface Product {
    id: number;
    name: string;
    unit_price: number;
    stock_quantity: number;
  }
  
  export interface Order {
    id: string;
    customer_name: string;
    product: string;
    quantity: number;
    total_price: number;
    status: 'pending' | 'completed' | 'cancelled' | 'processing' | 'shipping';
    created_at: string;
  }
  
  export type Customer = {
    id: string;
    name: string;
    company_name?: string;
    total_orders?: number;
  };