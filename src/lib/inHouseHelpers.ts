// Shared types, constants, and helpers for in-house order pages.

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InHouseOrder {
  id: number;
  reference?: string;
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    company_name?: string;
    companyName?: string;
  };
  products?: Array<{ name?: string; unit_price?: number | string }>;
  quantity?: number | string;
  total_price?: string | number;
  status: string;
  created_at: string;
  state?: string;
  order_type?: string;
  notes?: string;
  pfi_id?: number | null;
  pfi_number?: string | null;
  customer_name?: string;
  customer_phone?: string;
  driver_name?: string;
  driver_phone?: string;
  truck_number?: string;
  supervised_by?: string;
  loading_date?: string;
  destination_state?: string;
  destination_town?: string;
  sold_to_name?: string;
  sold_to_phone?: string;
  delivery_address?: string;
  sold_at?: string;
}

export interface InHouseOrderResponse {
  count: number;
  results: InHouseOrder[];
}

export interface State {
  id: number;
  name: string;
  classifier?: string;
}

export interface Product {
  id: number;
  name: string;
  abbreviation?: string;
  unit_price?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

export const MAX_TRUCK_CAPACITY = 60_000;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusDisplayMap: Record<string, string> = {
  pending: 'Pending',
  paid: 'Awaiting Ticket',
  released: 'Loaded',
  sold: 'Sold',
  canceled: 'Canceled',
};

export const getStatusText = (status: string) =>
  statusDisplayMap[status.toLowerCase()] || status;

export const getStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'bg-green-50 text-green-700 border border-green-200 ring-1 ring-green-100';
    case 'pending':
      return 'bg-amber-50 text-amber-700 border border-amber-200 ring-1 ring-amber-100';
    case 'canceled':
      return 'bg-red-50 text-red-700 border border-red-200 ring-1 ring-red-100';
    case 'released':
      return 'bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-100';
    case 'loaded':
      return 'bg-violet-50 text-violet-700 border border-violet-200 ring-1 ring-violet-100';
    case 'sold':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 ring-1 ring-emerald-100';
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-200 ring-1 ring-slate-100';
  }
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export const formatCurrency = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null || v === '' || v === '0' || v === '0.00')
    return '—';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return '—';
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatQuantity = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null || v === '') return '0';
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString();
};

/** Format a raw string with thousand separators for display in input */
export const formatWithCommas = (v: string): string => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) return `${formatted}.${parts[1]}`;
  return formatted;
};

/** Strip commas to get a raw number string */
export const stripCommas = (v: string): string => v.replace(/,/g, '');
