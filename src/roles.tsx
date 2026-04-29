// Define roles
export const ROLES = {
  SUPERADMIN: 0,       // Support
  ADMIN: 1,            // Administration
  FINANCE: 2,          // Finance
  SALES: 3,            // Sales
  RELEASE: 4,          // Ticketing
  SECURITY: 5,         // Security
  TRANSPORT: 6,        // Transport
  RELEASE_OFFICER: 7,  // Release
  AUDITOR: 8,          // Audit
  MARKETING: 9,        // Marketing
};

/**
 * Returns true if the current user has a read-only role (e.g. Auditor).
 * Use this to hide create/edit/delete/confirm buttons in the UI.
 * The backend enforces this too (403 on write methods).
 */
export function isReadOnlyRole(role?: number | string | null): boolean {
  const r = Number(role);
  return r === ROLES.AUDITOR || r === ROLES.MARKETING;
}

/** Convenience: read the role from localStorage and check */
export function isCurrentUserReadOnly(): boolean {
  try {
    return isReadOnlyRole(localStorage.getItem('role'));
  } catch {
    return false;
  }
}
