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
