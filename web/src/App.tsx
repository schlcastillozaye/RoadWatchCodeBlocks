import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './lib/auth';
import { AuditPage } from './pages/AuditPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicMapPage } from './pages/PublicMapPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/:id"
        element={
          <ProtectedRoute roles={['ADMIN', 'MAINTENANCE_OFFICER']}>
            <ReportDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignments"
        element={
          <ProtectedRoute roles={['MAINTENANCE_OFFICER']}>
            <AssignmentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/map"
        element={
          <ProtectedRoute>
            <PublicMapPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AuditPage />
          </ProtectedRoute>
        }
      />

      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={user ? <NotFoundPage /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
