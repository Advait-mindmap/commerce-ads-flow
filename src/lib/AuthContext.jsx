import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';

const AuthContext = createContext(null);

/**
 * Session state plus the role grants the server issued for this user.
 *
 * `permissions` mirrors server/rbac.js and is used to hide what the user cannot
 * do. It is a convenience only — every entity read/write and every privileged
 * function is re-checked on the server, so tampering with it in the browser
 * gains nothing.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const me = await api.auth.me();
      setUser(me);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      // A 401 here is the normal signed-out case, not a failure worth surfacing.
      setAuthError(error.status === 401 || error.status === 403 ? null : { type: 'unknown', message: error.message });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);

  const logout = useCallback(async (shouldRedirect = true) => {
    await api.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    if (shouldRedirect) window.location.href = '/login';
  }, []);

  const navigateToLogin = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = returnTo && returnTo !== '/'
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : '/login';
  }, []);

  const permissions = user?.permissions || null;

  const can = useCallback((entity, action) => {
    if (!permissions) return false;
    const grants = permissions.entities || {};
    const explicit = grants[entity];
    if (explicit) return explicit.includes(action);
    return Array.isArray(grants['*']) ? grants['*'].includes(action) : false;
  }, [permissions]);

  const hasCap = useCallback((cap) => Boolean(permissions?.caps?.includes(cap)), [permissions]);

  const canRoute = useCallback((path) => {
    if (!permissions) return false;
    const routes = permissions.routes || [];
    if (routes.includes('*')) return true;
    return routes.some((allowed) => (allowed === '/' ? path === '/' : path === allowed || path.startsWith(`${allowed}/`)));
  }, [permissions]);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    authError,
    role: user?.role || null,
    roleLabel: permissions?.label || null,
    permissions,
    can,
    hasCap,
    canRoute,
    logout,
    navigateToLogin,
    checkUserAuth
  }), [user, isAuthenticated, isLoadingAuth, authChecked, authError, permissions, can, hasCap, canRoute, logout, navigateToLogin, checkUserAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
