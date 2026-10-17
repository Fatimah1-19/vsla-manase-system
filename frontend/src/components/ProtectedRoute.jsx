import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';
import NotAllowed from '../pages/NotAllowed.jsx';

/** Blocks a page until we know who is logged in and whether her role fits. */
export default function ProtectedRoute({ children, roles }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // The right role only. If someone reaches a page by hand that her role may not
  // use, she is told plainly rather than quietly sent away.
  if (roles && !roles.includes(user.role)) return <NotAllowed />;

  return children;
}
