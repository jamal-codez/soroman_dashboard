/**
 * OrderStatusBadge — single source of truth for order status display across the app.
 *
 * Raw status → label, colour, icon:
 *   pending  → Pending   amber   Clock
 *   paid     → Paid      green   BadgeCheck
 *   released → Released  blue    PackageCheck
 *   loaded   → Loaded    violet  Truck
 *   canceled → Canceled  red     XCircle
 *   sold     → Sold      emerald ShoppingBag
 */
import React from 'react';
import {
  Clock,
  BadgeCheck,
  PackageCheck,
  Truck,
  XCircle,
  ShoppingBag,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Config ──────────────────────────────────────────────────────────────────

type StatusConfig = {
  label: string;
  badge: string;
  dot: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  pending: {
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700 border-amber-300',
    dot:   'bg-amber-400',
    Icon:  Clock,
  },
  paid: {
    label: 'Paid',
    badge: 'bg-green-50 text-green-700 border-green-300',
    dot:   'bg-green-500',
    Icon:  BadgeCheck,
  },
  released: {
    label: 'Released',
    badge: 'bg-blue-50 text-blue-700 border-blue-300',
    dot:   'bg-blue-500',
    Icon:  PackageCheck,
  },
  loaded: {
    label: 'Loaded',
    badge: 'bg-violet-50 text-violet-700 border-violet-300',
    dot:   'bg-violet-500',
    Icon:  Truck,
  },
  canceled: {
    label: 'Canceled',
    badge: 'bg-red-50 text-red-700 border-red-300',
    dot:   'bg-red-500',
    Icon:  XCircle,
  },
  sold: {
    label: 'Sold',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    dot:   'bg-emerald-500',
    Icon:  ShoppingBag,
  },
};

const FALLBACK: StatusConfig = {
  label: '',
  badge: 'bg-slate-50 text-slate-600 border-slate-200',
  dot:   'bg-slate-400',
  Icon:  HelpCircle,
};

export function getStatusConfig(status: string): StatusConfig {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_MAP[key] ?? { ...FALLBACK, label: status || '—' };
}

// ─── Component ───────────────────────────────────────────────────────────────

type BadgeVariant = 'badge' | 'dot-label' | 'text-only';

interface OrderStatusBadgeProps {
  status: string;
  /** Visual style — defaults to 'badge' */
  variant?: BadgeVariant;
  className?: string;
  /** Override the displayed text (icon + colour still come from status) */
  labelOverride?: string;
}

export function OrderStatusBadge({
  status,
  variant = 'badge',
  className,
  labelOverride,
}: OrderStatusBadgeProps) {
  const cfg = getStatusConfig(status);
  const label = labelOverride ?? cfg.label;

  if (variant === 'text-only') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-sm font-medium', className)}>
        <cfg.Icon size={13} className="shrink-0" />
        {label}
      </span>
    );
  }

  if (variant === 'dot-label') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)}>
        <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
        {label}
      </span>
    );
  }

  // default: 'badge'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        cfg.badge,
        className,
      )}
    >
      <cfg.Icon size={11} className="shrink-0" />
      {label}
    </span>
  );
}

// ─── Standalone helpers (drop-in replacements for legacy getStatusClass etc.) ─

/** Returns Tailwind badge classes for the given raw status */
export const getOrderStatusClass = (status: string): string =>
  getStatusConfig(status).badge;

/** Returns the display label for the given raw status */
export const getOrderStatusLabel = (status: string): string =>
  getStatusConfig(status).label;

/** Returns the icon element for the given raw status */
export const getOrderStatusIcon = (
  status: string,
  size = 14,
): React.ReactElement => {
  const { Icon, badge } = getStatusConfig(status);
  // extract just the text-* class for the icon colour
  const textCls = badge.split(' ').find((c) => c.startsWith('text-')) ?? 'text-slate-500';
  return <Icon size={size} className={cn('shrink-0', textCls)} />;
};
