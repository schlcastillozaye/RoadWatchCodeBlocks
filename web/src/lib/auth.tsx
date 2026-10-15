import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  isAdmin: boolean;
  isOfficer: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    api.onSessionExpired = () => setUser(null);

    (async () => {
      if (api.hasSession) {
        await refreshUser();
      }
      setInitializing(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.login(email, password);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      isAdmin: user?.role === 'ADMIN',
      isOfficer: user?.role === 'MAINTENANCE_OFFICER',
      isStaff: user?.role === 'ADMIN' || user?.role === 'MAINTENANCE_OFFICER',
      login,
      logout,
      refreshUser,
    }),
    [user, initializing, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
