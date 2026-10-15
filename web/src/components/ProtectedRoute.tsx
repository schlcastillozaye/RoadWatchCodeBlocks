import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AppLayout } from './AppLayout';
import { LoadingBlock } from './Feedback';
import type { Role } from '../lib/types';

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sheet">
        <LoadingBlock label="Preparing your workspace…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <AppLayout>
        <div className="brand-card p-8 text-center">
          <h1 className="text-2xl text-navy">Not available for your role</h1>
          <p className="mt-2 text-sm text-ink-3">
            This area is limited to {roles.map((role) => role.replace('_', ' ').toLowerCase()).join(' and ')} accounts.
            Please use the section assigned to your role.
          </p>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}

/** Wraps a page with the app shell but no role restriction. */
export function ProtectedShell({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
