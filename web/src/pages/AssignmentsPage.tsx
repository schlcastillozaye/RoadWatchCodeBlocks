import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthImage } from '../components/AuthImage';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback';
import { MapCanvas } from '../components/MapPanel';
import { CategoryChip, PriorityBadge, RepairBadge } from '../components/StatusBadge';
import { Pagination, PageHeader, Section, StatCard } from '../components/ui';
import { RepairDialog } from '../components/dialogs/RepairDialog';
import { api } from '../lib/api';
import { REPAIR_LABELS, relativeTime } from '../lib/format';
import type { Report, RepairStatus } from '../lib/types';
import { useAsync } from '../lib/useAsync';

const PAGE_SIZE = 8;
const FILTERS: (RepairStatus | '')[] = ['', 'AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED'];

export function AssignmentsPage() {
  const [repairStatus, setRepairStatus] = useState<RepairStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Report | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, repairStatus: repairStatus || undefined, sort: 'priority' as const }),
    [page, repairStatus],
  );

  const assignments = useAsync(() => api.listAssignments(query), [query.page, query.repairStatus]);
  const summary = useAsync(() => api.officerSummary(), []);

  const items = assignments.data?.items ?? [];
  const markers = items.map((report) => ({
    id: report.id,
    lat: report.latitude,
    lng: report.longitude,
    title: report.title,
    status: report.repairStatus,
  }));

  const openRepair = (report: Report) => {
    setSelected(report);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title="My assignments"
        subtitle="Approved road issues assigned to you for maintenance."
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void assignments.reload()}>
            ⟳ Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assigned" value={summary.data?.assigned ?? '—'} tone="navy" />
        <StatCard label="Awaiting" value={summary.data?.awaiting ?? '—'} tone="blue" />
        <StatCard label="In progress" value={summary.data?.inProgress ?? '—'} tone="amber" />
        <StatCard label="Completed" value={summary.data?.completed ?? '—'} tone="green" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter || 'all'}
            type="button"
            onClick={() => {
              setRepairStatus(filter);
              setPage(1);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              repairStatus === filter ? 'border-navy bg-navy text-surface' : 'border-azure bg-surface text-ink-2 hover:border-navy'
            }`}
          >
            {filter ? REPAIR_LABELS[filter] : 'All'}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {assignments.loading && !assignments.data ? (
            <LoadingBlock label="Loading assignments…" />
          ) : assignments.error ? (
            <ErrorState message={assignments.error} onRetry={assignments.reload} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="✎"
              title="No assignments here"
              message="When an administrator assigns approved reports to you, they will appear in this list."
            />
          ) : (
            <Section>
              <ul className="divide-y divide-azure/70">
                {items.map((report) => (
                  <li key={report.id} className="py-4">
                    <div className="flex items-start gap-3">
                      {report.photos[0] ? (
                        <AuthImage
                          src={report.photos[0].url}
                          isPublic={report.photos[0].isPublic}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-brand-sm object-cover"
                        />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-brand-sm bg-cream text-xl text-navy">
                          ⚑
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-navy">{report.title}</p>
                            <p className="text-xs text-ink-3">
                              {report.referenceNo} · {report.areaLabel ?? 'Pinned location'} ·{' '}
                              {relativeTime(report.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <RepairBadge status={report.repairStatus} />
                            <PriorityBadge priority={report.priority} />
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <CategoryChip category={report.category} />
                          {report.repairStatus !== 'COMPLETED' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => openRepair(report)}>
                              Update status
                            </button>
                          )}
                          <Link to={`/reports/${report.id}`} className="btn btn-secondary btn-sm">
                            View details
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <Pagination
                page={assignments.data!.page}
                totalPages={assignments.data!.totalPages}
                total={assignments.data!.total}
                onPage={setPage}
              />
            </Section>
          )}
        </div>

        <div className="lg:col-span-2">
          <Section title="Assignment map" description="Your active work, pinned by repair status">
            <div className="overflow-hidden rounded-brand-sm border border-azure" style={{ height: 340 }}>
              <MapCanvas markers={markers} className="h-full w-full" />
            </div>
            {markers.length === 0 && (
              <p className="mt-3 text-xs text-ink-3">Nothing to plot yet — assignments will appear here.</p>
            )}
          </Section>
        </div>
      </div>

      {selected && (
        <RepairDialog
          report={selected}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            void assignments.reload();
            void summary.reload();
          }}
          canOverride={false}
        />
      )}
    </>
  );
}
