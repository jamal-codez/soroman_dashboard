// Define roles
export const ROLES = {
  SUPERADMIN: 0,            // Support
  ADMIN: 1,                 // Administration
  FINANCE: 2,               // Finance
  SALES: 3,                 // Sales
  RELEASE: 4,               // Ticketing
  SECURITY: 5,              // Security
  TRANSPORT: 6,             // Transport
  RELEASE_OFFICER: 7,       // Release
  AUDITOR: 8,               // Audit
  SALES_MANAGER: 9,         // Sales Manager
  PRODUCT_MANAGER: 10,      // Product Manager
  LPG_ADMIN: 11,            // LPG Admin — unrestricted LPG access
  LPG_PLANT_MANAGER: 13,    // LPG Plant Manager — stock + sales, scoped to assigned plants
  LPG_CASHIER: 14,          // LPG Cashier — sales only, scoped to assigned plants
  COMMISSIONS: 15,          // Commissions
  COMMISSION_OFFICER: 16,   // Commission Officer
  DISPATCH: 17,             // Dispatch
  IT_COMPLIANCE: 18,        // IT Compliance (depot view read-only)
};

/**
 * Returns true if the current user has a read-only role (e.g. Auditor).
 * Use this to hide create/edit/delete/confirm buttons in the UI.
 * The backend enforces this too (403 on write methods).
 */
export function isReadOnlyRole(role?: number | string | null): boolean {
  const r = Number(role);
  return r === ROLES.AUDITOR || r === ROLES.SALES_MANAGER;
}

/**
 * Reads the full set of roles assigned to the current user from localStorage.
 * Falls back to the single legacy `role` value for sessions logged in before
 * multi-role support existed (or if `roles` was never set).
 */
export function getCurrentUserRoles(): number[] {
  try {
    const raw = localStorage.getItem('roles');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(Number);
    }
  } catch {
    // fall through to legacy single-role fallback
  }
  const legacy = Number(localStorage.getItem('role'));
  return Number.isFinite(legacy) ? [legacy] : [];
}

/** Convenience: read the role(s) from localStorage and check if ANY of them are read-only. */
export function isCurrentUserReadOnly(): boolean {
  try {
    return getCurrentUserRoles().some(isReadOnlyRole);
  } catch {
    return false;
  }
}

/**
 * Each role's real operational workspace — used by Home.tsx (src/pages/Home.tsx)
 * to redirect a role that doesn't have a dedicated `/home` snapshot yet onto
 * the page that actually lets them work. Every login lands on `/home` first
 * (see Login.tsx); this is where roles without a Home view bounce onward to.
 */
export function fallbackWorkspaceForRole(role: number | string): string {
  switch (Number(role)) {
    case ROLES.SUPERADMIN:
      return '/dashboard';
    case ROLES.ADMIN:
      return '/dashboard';
    case ROLES.FINANCE:
      return '/payment-verify';
    case ROLES.SALES:              // TRUCK SALES
      return '/delivery-sales-ledger';
    case ROLES.RELEASE:            // TICKETING
      return '/pickup-processing';
    case ROLES.SECURITY:
      return '/security';
    case ROLES.TRANSPORT:
      return '/fleet-ledger';
    case ROLES.RELEASE_OFFICER:
      return '/pickup-processing';
    case ROLES.AUDITOR:
      return '/dashboard';
    case ROLES.SALES_MANAGER:
      return '/sales-manager-view';
    case ROLES.PRODUCT_MANAGER:
      return '/product-manager-view';
    case ROLES.LPG_ADMIN:
      return '/lpg/dashboard';
    case ROLES.LPG_PLANT_MANAGER:
      return '/lpg/dashboard';
    case ROLES.LPG_CASHIER:
      return '/lpg/sales';
    case ROLES.COMMISSIONS:
      return '/commissions';
    case ROLES.COMMISSION_OFFICER:
      return '/commissions';
    case ROLES.DISPATCH:
      return '/pickup-processing';
    case ROLES.IT_COMPLIANCE:
      return '/depot-view';
    default:
      return '/dashboard';
  }
}
