import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lightbox, PhotoGallery } from '../components/AuthImage';
import { ErrorState, LoadingBlock, Banner } from '../components/Feedback';
import { MapCanvas, MapLegend } from '../components/MapPanel';
import { CategoryChip, ModerationBadge, PriorityBadge, RepairBadge } from '../components/StatusBadge';
import { Timeline } from '../components/Timeline';
import { Section, Field } from '../components/ui';
import { AssignDialog } from '../components/dialogs/AssignDialog';
import { ModerationDialog } from '../components/dialogs/ModerationDialog';
import { RepairDialog } from '../components/dialogs/RepairDialog';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatCoords, formatDateTime, locationLabel, relativeTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import type { Report } from '../lib/types';

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isOfficer, user } = useAuth();

  const reportQuery = useAsync(() => api.getReport(id), [id]);
  const historyQuery = useAsync(() => api.getHistory(id), [id]);

  const [local, setLocal] = useState<Report | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);

  const report = local ?? reportQuery.data;

  const applyUpdate = (updated: Report) => {
    setLocal(updated);
    void historyQuery.reload();
  };

  if (reportQuery.loading && !report) return <LoadingBlock label="Loading report…" />;
  if (reportQuery.error && !report) return <ErrorState message={reportQuery.error} onRetry={reportQuery.reload} />;
  if (!report) return null;

  const canModerate = isAdmin && report.moderationStatus === 'PENDING_REVIEW';
  const canAssign = isAdmin && report.moderationStatus === 'APPROVED';
  const canMaintain =
    report.moderationStatus === 'APPROVED' &&
    (isAdmin || (isOfficer && report.assignedOfficer?.id === user?.id)) &&
    report.repairStatus !== undefined;

  const isPublicViewer = report.moderationStatus === 'APPROVED';

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <Link to={isOfficer && !isAdmin ? '/assignments' : '/reports'} className="font-semibold text-navy hover:underline">
          ← Back to {isOfficer && !isAdmin ? 'assignments' : 'reports'}
        </Link>
      </div>

      {/* Hero */}
      <div className="block-motif rounded-brand-lg bg-navy p-6 text-surface sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-sky">
              {report.referenceNo}
            </p>
            <h1 className="mt-2 text-2xl leading-tight text-surface sm:text-3xl">{report.title}</h1>
            <p className="mt-2 text-sm text-azure">
              Reported {relativeTime(report.createdAt)} · {formatDateTime(report.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ModerationBadge status={report.moderationStatus} />
            <RepairBadge status={report.repairStatus} />
            <PriorityBadge priority={report.priority} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {canModerate && (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModerationOpen(true)}>
                Moderate report
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm text-sky"
                onClick={() => navigate('/reports?moderationStatus=PENDING_REVIEW')}
              >
                Back to queue
              </button>
            </>
          )}
          {canAssign && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssignOpen(true)}>
              {report.assignedOfficer ? 'Reassign officer' : 'Assign to officer'}
            </button>
          )}
          {canMaintain && (
            <button
              type="button"
              className={canAssign ? 'btn btn-secondary btn-sm bg-transparent text-sky border-sky' : 'btn btn-primary btn-sm'}
              onClick={() => setRepairOpen(true)}
            >
              Update maintenance status
            </button>
          )}
        </div>
      </div>

      {report.moderationStatus === 'REJECTED' && report.rejectionReason && (
        <div className="mt-4">
          <Banner tone="error">
            <span>
              <strong className="block">Rejected</strong>
              {report.rejectionReason}
            </span>
          </Banner>
        </div>
      )}

      {report.completionOverride && (
        <div className="mt-4">
          <Banner tone="warn">
            This repair was completed using an administrator override (no completion photo). The override is recorded in
            the audit log.
          </Banner>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Photos" description={isPublicViewer ? 'Publicly visible on the map' : 'Visible to staff only'}>
            <PhotoGallery photos={report.photos} onSelect={(index) => setLightboxIndex(index)} size="h-28 w-28" />
          </Section>

          <Section title="Description">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{report.description}</p>
          </Section>

          {report.completionNotes && (
            <Section title="Completion notes">
              <div className="rounded-brand-sm border border-green/25 bg-green-tint p-4 text-sm text-ink-2">
                {report.completionNotes}
              </div>
            </Section>
          )}

          <Section title="Progress timeline">
            {historyQuery.loading && !historyQuery.data ? (
              <LoadingBlock label="Loading timeline…" />
            ) : historyQuery.error ? (
              <ErrorState message={historyQuery.error} onRetry={historyQuery.reload} />
            ) : (
              <Timeline entries={historyQuery.data ?? []} />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Location">
            <div className="overflow-hidden rounded-brand-sm border border-azure" style={{ height: 220 }}>
              <MapCanvas
                markers={[
                  {
                    id: report.id,
                    lat: report.latitude,
                    lng: report.longitude,
                    title: report.title,
                    status: report.repairStatus,
                  },
                ]}
                className="h-full w-full"
              />
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-ink-2">{locationLabel(report.latitude, report.longitude, report.addressText, report.areaLabel)}</p>
              <p className="font-mono text-xs text-ink-3">{formatCoords(report.latitude, report.longitude)}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  className="btn btn-secondary btn-sm"
                  href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=17/${report.latitude}/${report.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in OpenStreetMap ↗
                </a>
              </div>
              <div className="pt-1">
                <MapLegend />
              </div>
            </div>
          </Section>

          <Section title="Details">
            <Field label="Category" value={<CategoryChip category={report.category} />} />
            <Field label="Priority" value={<PriorityBadge priority={report.priority} />} />
            <Field
              label="Civilian reporter"
              value={report.citizen ? `${report.citizen.fullName}` : 'Not available'}
            />
            <Field
              label="Assigned officer"
              value={
                report.assignedOfficer
                  ? report.assignedOfficer.fullName
                  : 'Unassigned'
              }
            />
            <Field label="Area" value={report.areaLabel ?? '—'} />
            <Field label="Submitted" value={formatDateTime(report.createdAt)} />
            <Field label="Approved / rejected" value={formatDateTime(report.moderatedAt)} />
            <Field label="Assigned" value={formatDateTime(report.assignedAt)} />
            <Field label="Completed" value={formatDateTime(report.completedAt)} />
            <Field label="Last updated" value={formatDateTime(report.updatedAt)} />
          </Section>
        </div>
      </div>

      {/* Dialogues */}
      {canModerate && (
        <ModerationDialog
          report={report}
          open={moderationOpen}
          onClose={() => setModerationOpen(false)}
          onDone={applyUpdate}
        />
      )}
      {canAssign && (
        <AssignDialog report={report} open={assignOpen} onClose={() => setAssignOpen(false)} onDone={applyUpdate} />
      )}
      {canMaintain && (
        <RepairDialog
          report={report}
          open={repairOpen}
          onClose={() => setRepairOpen(false)}
          onDone={applyUpdate}
          canOverride={isAdmin}
        />
      )}

      {lightboxIndex !== null && report.photos[lightboxIndex] && (
        <Lightbox
          photos={report.photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
