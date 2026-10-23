import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, LoadingBlock, SkeletonRows } from '../components/Feedback';
import { ReportManagementActions } from '../components/ReportManagementActions';
import { ModerationBadge, PriorityBadge, RepairBadge } from '../components/StatusBadge';
import { PageHeader, Section, StatCard } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY_LABELS, relativeTime } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { useAsync } from '../lib/useAsync';

export function DashboardPage() {
  const { isAdmin, isOfficer, user } = useAuth();
  return isAdmin ? <AdminDashboard /> : isOfficer ? <OfficerDashboard /> : <CitizenNotice name={user?.fullName} />;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.getStatistics(), []);

  if (loading && !data) return <LoadingBlock label="Loading statistics…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const { totals, byCategory, byArea, recent } = data;
  const maxCategory = Math.max(1, ...byCategory.map((entry) => entry.count));

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        subtitle="Moderation and repair activity across all reported road issues."
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
              ⟳ Refresh
            </button>
            <Link to="/reports?moderationStatus=PENDING_REVIEW" className="btn btn-primary btn-sm">
              Review queue ({totals.pending})
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total reports" value={totals.total} tone="navy" />
        <StatCard
          label="Pending review"
          value={totals.pending}
          tone="amber"
          hint="Awaiting moderation"
          onClick={() => navigate('/reports?moderationStatus=PENDING_REVIEW')}
        />
        <StatCard
          label="Approved"
          value={totals.approved}
          tone="green"
          hint="Visible on the public map"
          onClick={() => navigate('/reports?moderationStatus=APPROVED')}
        />
        <StatCard
          label="Rejected"
          value={totals.rejected}
          tone="red"
          hint="Never shown publicly"
          onClick={() => navigate('/reports?moderationStatus=REJECTED')}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Not assigned"
          value={totals.notAssigned}
          tone="slate"
          onClick={() => navigate('/reports?repairStatus=NOT_ASSIGNED')}
        />
        <StatCard
          label="Awaiting maintenance"
          value={totals.awaiting}
          tone="blue"
          onClick={() => navigate('/reports?repairStatus=AWAITING_MAINTENANCE')}
        />
        <StatCard
          label="In progress"
          value={totals.inProgress}
          tone="amber"
          onClick={() => navigate('/reports?repairStatus=IN_PROGRESS')}
        />
        <StatCard
          label="Completed"
          value={totals.completed}
          tone="green"
          onClick={() => navigate('/reports?repairStatus=COMPLETED')}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Section title="Reports by category" className="lg:col-span-2">
          {byCategory.length === 0 ? (
            <p className="text-sm text-ink-3">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map((entry) => (
                <div key={entry.category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">{CATEGORY_LABELS[entry.category]}</span>
                    <span className="text-ink-3">{entry.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sheet">
                    <div
                      className="h-full rounded-full bg-navy"
                      style={{ width: `${Math.round((entry.count / maxCategory) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Top areas" description="By number of reports">
          {byArea.length === 0 ? (
            <p className="text-sm text-ink-3">No area data yet.</p>
          ) : (
            <ul className="divide-y divide-azure/70">
              {byArea.slice(0, 8).map((entry) => (
                <li key={entry.area} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="truncate pr-3 text-ink-2">{entry.area}</span>
                  <span className="font-semibold text-navy">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        className="mt-6"
        title="Latest activity"
        description="The most recently submitted reports"
        actions={
          <Link to="/reports" className="btn btn-ghost btn-sm">
            View all →
          </Link>
        }
      >
        {loading ? (
          <SkeletonRows rows={3} />
        ) : recent.length === 0 ? (
          <p className="text-sm text-ink-3">No reports submitted yet.</p>
        ) : (
          <ul className="divide-y divide-azure/70">
            {recent.slice(0, 6).map((report) => (
              <li
                key={report.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  to={`/reports/${encodeURIComponent(report.id)}`}
                  className="min-w-0 flex-1 transition hover:opacity-80"
                >
                  <p className="truncate font-semibold text-navy">{report.title}</p>
                  <p className="text-xs text-ink-3">
                    {report.referenceNo} · {relativeTime(report.createdAt)}
                    {report.areaLabel ? ` · ${report.areaLabel}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ModerationBadge status={report.moderationStatus} />
                    <RepairBadge status={report.repairStatus} />
                    <PriorityBadge priority={report.priority} />
                  </div>
                </Link>
                <ReportManagementActions report={report} onDeleted={() => void reload()} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function OfficerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notificationActionError, setNotificationActionError] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => api.officerSummary(), []);
  const assignments = useAsync(() => api.listAssignments({ pageSize: 5, sort: 'priority' }), []);
  const notifications = useAsync(() => api.officerNotifications(), []);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void notifications.reload();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [notifications.reload]);

  if (loading && !data) return <LoadingBlock label="Loading your assignments…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  const summary = data ?? { assigned: 0, awaiting: 0, inProgress: 0, completed: 0 };
  const active = summary.awaiting + summary.inProgress;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.fullName?.split(' ')[0] ?? 'officer'}`}
        subtitle="Your assigned road maintenance work."
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
              ⟳ Refresh
            </button>
            <Link to="/assignments" className="btn btn-primary btn-sm">
              Open assignments
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active work" value={active} tone="amber" hint="Awaiting + in progress" />
        <StatCard label="Awaiting maintenance" value={summary.awaiting} tone="blue" />
        <StatCard label="In progress" value={summary.inProgress} tone="amber" />
        <StatCard label="Completed" value={summary.completed} tone="green" />
      </div>

      <Section
        className="mt-6"
        title="Assignment notifications"
        description={`${notifications.data?.unreadCount ?? 0} unread`}
        actions={
          <>
            {(notifications.data?.unreadCount ?? 0) > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  setNotificationActionError(null);
                  try {
                    await api.markAllOfficerNotificationsRead();
                    await notifications.reload();
                  } catch (actionError) {
                    setNotificationActionError(errorMessage(actionError));
                  }
                }}
              >
                Mark all read
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void notifications.reload()}>
              Refresh
            </button>
          </>
        }
      >
        {notificationActionError && (
          <p role="alert" className="mb-3 rounded-brand-sm bg-red-tint p-3 text-sm text-red">
            {notificationActionError}
          </p>
        )}
        {notifications.loading && !notifications.data ? (
          <SkeletonRows rows={2} />
        ) : notifications.error ? (
          <ErrorState message={notifications.error} onRetry={notifications.reload} />
        ) : (notifications.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-3">No assignment notifications yet.</p>
        ) : (
          <ul className="divide-y divide-azure/70">
            {notifications.data!.items.slice(0, 5).map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={async () => {
                    setNotificationActionError(null);
                    try {
                      if (!notification.isRead) await api.markOfficerNotificationRead(notification.id);
                      navigate(`/reports/${notification.reportId}`);
                    } catch (actionError) {
                      setNotificationActionError(errorMessage(actionError));
                    }
                  }}
                  className={`flex w-full items-start gap-3 py-3 text-left transition hover:opacity-80 ${
                    notification.isRead ? 'opacity-75' : 'font-semibold'
                  }`}
                >
                  <span
                    aria-label={notification.isRead ? 'Read' : 'Unread'}
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      notification.isRead ? 'bg-azure' : 'bg-amber'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-navy">{notification.title}</span>
                    <span className="mt-1 block text-xs font-normal text-ink-3">
                      {notification.message} · {relativeTime(notification.createdAt)}
                    </span>
                  </span>
                  <span className="text-xs text-navy">Open →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        className="mt-6"
        title="Next up"
        description="Highest-priority approved reports assigned to you"
        actions={
          <Link to="/assignments" className="btn btn-ghost btn-sm">
            View all →
          </Link>
        }
      >
        {assignments.loading ? (
          <SkeletonRows rows={3} />
        ) : assignments.error ? (
          <ErrorState message={assignments.error} onRetry={assignments.reload} />
        ) : (assignments.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-3">Nothing assigned to you right now.</p>
        ) : (
          <ul className="divide-y divide-azure/70">
            {assignments.data!.items.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="flex w-full flex-col gap-2 py-3 text-left transition hover:opacity-80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{report.title}</p>
                    <p className="text-xs text-ink-3">
                      {report.referenceNo} · {report.areaLabel ?? 'Location pinned'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RepairBadge status={report.repairStatus} />
                    <PriorityBadge priority={report.priority} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function CitizenNotice({ name }: { name?: string | null }) {
  return (
    <>
      <PageHeader title={`Hello, ${name?.split(' ')[0] ?? 'there'}`} subtitle="Welcome to RoadBlocks." />
      <Section title="Use the mobile app to file reports">
        <p className="text-sm text-ink-2">
          This web platform is built for administrators and maintenance officers. To report a road issue, track your
          submissions and receive updates, please sign in with the RoadBlocks mobile app.
        </p>
        <p className="mt-3 text-sm text-ink-3">
          You can still browse the public map of approved reports from the navigation menu.
        </p>
      </Section>
    </>
  );
}
