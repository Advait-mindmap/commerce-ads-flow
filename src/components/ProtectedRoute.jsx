import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();

  if (isLoadingAuth || !authChecked) return fallback;
  if (!isAuthenticated) return unauthenticatedElement;

  return <Outlet />;
}

/**
 * Route-level role gate. Sits inside ProtectedRoute, so by this point the user
 * is known — the only question is whether their role covers this path.
 */
export function RoleRoute() {
  const { canRoute, roleLabel, role } = useAuth();
  const { pathname } = useLocation();

  if (canRoute(pathname)) return <Outlet />;

  return (
    <div className="p-6">
      <div className="max-w-lg mx-auto mt-16 bg-white border border-slate-200 rounded-lg p-6 text-center">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Restricted</div>
        <h1 className="text-base font-semibold text-slate-900 mt-2">This screen is outside your role</h1>
        <p className="text-[13px] text-slate-600 mt-2">
          You are signed in as <span className="font-medium text-slate-900">{roleLabel || role}</span>, which does not
          include access to <span className="font-mono text-slate-700">{pathname}</span>.
        </p>
        <p className="text-xs text-slate-500 mt-3">
          Sign in with a different demo role to view it, or ask an administrator to widen this role.
        </p>
      </div>
    </div>
  );
}
