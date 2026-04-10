import { Navigate, useLocation } from 'react-router-dom';

/**
 * AuthGuard — wraps any route that requires an authenticated session.
 * If no token is found in localStorage the user is kicked to /login.
 * The original path is preserved in `state.from` so a future "redirect
 * after login" enhancement can send them back.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * RoleGuard — additionally checks the user's role (read from localStorage)
 * against a list of permitted roles. If the role is not allowed the user
 * is sent to /dashboard instead.
 *
 * Because this reads localStorage on every render it stays in sync even if
 * the role changes mid-session (e.g. admin edits the user's role).
 */
export function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: number[];
  children: React.ReactNode;
}) {
  const raw = localStorage.getItem('role');
  const role = raw === null ? NaN : Number(raw);

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
