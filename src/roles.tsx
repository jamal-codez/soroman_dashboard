// Define roles
export const ROLES = {
  SUPERADMIN: 0,
  ADMIN: 1,
  FINANCE: 2,
  SALES: 3,
  RELEASE: 4,
  SECURITY: 5,
  TRANSPORT: 6,
  RELEASE_OFFICER: 7,
  AUDITOR: 8,
};

/**
 * Returns true if the current user has a read-only role (e.g. Auditor).
 * Use this to hide create/edit/delete/confirm buttons in the UI.
 * The backend enforces this too (403 on write methods).
 */
export function isReadOnlyRole(role?: number | string | null): boolean {
  const r = Number(role);
  return r === ROLES.AUDITOR;
}

/** Convenience: read the role from localStorage and check */
export function isCurrentUserReadOnly(): boolean {
  try {
    return isReadOnlyRole(localStorage.getItem('role'));
  } catch {
    return false;
  }
}
