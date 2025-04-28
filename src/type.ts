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
    pending_order_value: number;
    unpaid_orders: number;
  }
  
  export interface SalesData {
    month: string;
    pms: number;
    ago: number;
    lpg: number;
    jet: number;
  }

  
export type NotificationType = 'BID_REVIEW' | 'PAYMENT' | 'INVENTORY' | 'DELIVERY' | 'CUSTOMER';

export interface NotificationPayload {
  emails: string[];
  type: NotificationType;
  project: {
    name: string;
  };
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: NotificationType;
  read: boolean;
}


  export interface ProductResponse {
    results: Product[];
    count: number;
  }

  export interface OrderResponse {
    count: number;
    results: Order[];
  }
  
  export interface StatCardProps {
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
    customer: {
      name: string;
      email: string;
    };
    product: string;
    quantity: string;
    date: string;
    amount: string;
    status: 'Completed' | 'Processing' | 'Shipping' | 'Cancelled';
  };
  
  
export interface AnalyticsData {
  orders: number;
  orders_change: number;
  sales_revenue: number;
  sales_revenue_change: number;
  quantity_sold: Array<{
    product_name: string;
    current_quantity: number;
    change: number;
  }>;
  active_customers: number;
  active_customers_change: number;
  pending_order_value: number;
  unpaid_orders:number;
}

export interface SalesData {
  month: string;
  [product: string]: number | string;
}

export interface Product {
  id: number;
  name: string;
  abbreviation: string;
  description: string;
  unit_price: number;
  stock_quantity: number;
  created_at: string;
}

export interface Order {
  id: number;
  total_price: number;
  status: string;
  created_at: string;
  products: Array<{
    product: number;
    quantity: number;
    price: number;
  }>;
}

export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  company_name?: string;
}