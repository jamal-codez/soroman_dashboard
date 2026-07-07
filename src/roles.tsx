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
