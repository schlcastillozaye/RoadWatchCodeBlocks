import { useMemo, useState } from 'react';
import { AuthImage, Lightbox } from '../components/AuthImage';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback';
import { MapCanvas, MapLegend } from '../components/MapPanel';
import { PlaceSearch } from '../components/PlaceSearch';
import { CategoryChip, PriorityBadge, RepairBadge } from '../components/StatusBadge';
import { PageHeader, Section } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_LABELS, distanceKm, formatDateTime, formatDistance, locationLabel, relativeTime } from '../lib/format';
import { useAsync, useDebounced } from '../lib/useAsync';
import type { IssueCategory, PlaceResult, RepairStatus, Report } from '../lib/types';

const MAX_REPORTS = 100;

/** Local-day boundaries converted to ISO so date filters match the browser's timezone. */
function startOfDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endOfDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function PublicMapPage() {
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [repairStatus, setRepairStatus] = useState<RepairStatus | ''>('');
  const [areaLabel, setAreaLabel] = useState('');
  const debouncedArea = useDebounced(areaLabel);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [placeOrigin, setPlaceOrigin] = useState<PlaceResult | null>(null);
  const [textQuery, setTextQuery] = useState<string>('');

  const query = useMemo(
    () => ({
      pageSize: MAX_REPORTS,
      category: (category || undefined) as IssueCategory | undefined,
      repairStatus: (repairStatus || undefined) as RepairStatus | undefined,
      areaLabel: debouncedArea || undefined,
      from: startOfDayIso(from),
      to: endOfDayIso(to),
      search: (textQuery || undefined) as string | undefined,
    }),
    [category, repairStatus, debouncedArea, from, to, textQuery],
  );

  const feed = useAsync(
    () => api.publicReports(query),
    [query.category, query.repairStatus, query.areaLabel, query.from, query.to, query.search],
  );
  const detail = useAsync(() => (selectedId ? api.publicReport(selectedId) : Promise.resolve(null)), [selectedId]);

  const reports = feed.data?.items ?? [];
  const markers = reports.map((report) => ({
    id: report.id,
    lat: report.latitude,
    lng: report.longitude,
    title: `${report.title} · ${report.referenceNo}`,
    status: report.repairStatus,
  }));

  const openDetail = (id: string) => {
    setSelectedId(id);
    setFocusId(id);
    setFocusPoint(null);
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    setPlaceOrigin(place);
    setTextQuery('');
    setFocusPoint({ lat: place.lat, lng: place.lng });
    setFocusId(null);
    setSelectedId(null);
  };

  const handlePlaceUnavailable = (_reason: string, queryText: string) => {
    setPlaceOrigin(null);
    setFocusPoint(null);
    setTextQuery(queryText);
  };

  const handlePlaceReset = () => {
    setPlaceOrigin(null);
    setFocusPoint(null);
    setTextQuery('');
  };

  const visibleReports = useMemo(() => {
    const list = reports;
    if (!placeOrigin) return list;

    return [...list]
      .map((report) => ({
        report,
        km: distanceKm(placeOrigin.lat, placeOrigin.lng, report.latitude, report.longitude),
      }))
      .sort((a, b) => a.km - b.km)
      .map((item) => item.report);
  }, [reports, placeOrigin]);

  return (
    <>
      <PageHeader
        title="Public map"
        subtitle="Approved reports only. Pending and rejected submissions never appear here."
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void feed.reload()}>
            ⟳ Refresh
          </button>
        }
      />

      <Section className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="brand-label" htmlFor="map-category">
              Category
            </label>
            <select
              id="map-category"
              className="brand-input"
              value={category}
              onChange={(event) => setCategory(event.target.value as IssueCategory | '')}
            >
              <option value="">All categories</option>
              {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label" htmlFor="map-repair">
              Repair status
            </label>
            <select
              id="map-repair"
              className="brand-input"
              value={repairStatus}
              onChange={(event) => setRepairStatus(event.target.value as RepairStatus | '')}
            >
              <option value="">All statuses</option>
              <option value="NOT_ASSIGNED">Not assigned</option>
              <option value="AWAITING_MAINTENANCE">Awaiting maintenance</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div>
            <label className="brand-label" htmlFor="map-area">
              Area
            </label>
            <input
              id="map-area"
              className="brand-input"
              placeholder="e.g. Quezon City"
              value={areaLabel}
              onChange={(event) => setAreaLabel(event.target.value)}
            />
          </div>
          <div>
            <label className="brand-label" htmlFor="map-from">
              From date
            </label>
            <input
              id="map-from"
              type="date"
              className="brand-input"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <label className="brand-label" htmlFor="map-to">
              To date
            </label>
            <input
              id="map-to"
              type="date"
              className="brand-input"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <MapLegend />
          </div>
        </div>
        <div className="mt-4">
          <PlaceSearch onSelect={handlePlaceSelect} onUnavailable={handlePlaceUnavailable} onReset={handlePlaceReset} />
        </div>
        {placeOrigin && (
          <p className="mt-2 text-xs text-ink-3">
            Showing reports nearest to <span className="font-medium text-navy">{placeOrigin.address}</span> ·
            sorted by distance.
          </p>
        )}
        {textQuery && !placeOrigin && (
          <p className="mt-2 text-xs text-ink-3">
            Matching reports for “{textQuery}” (local fallback).
          </p>
        )}
      </Section>

      {feed.loading && !feed.data ? (
        <LoadingBlock label="Loading approved reports…" />
      ) : feed.error ? (
        <ErrorState message={feed.error} onRetry={feed.reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Section title={`Approved reports (${reports.length})`} description="Tap a card to open full details">
              {reports.length === 0 ? (
                <EmptyState
                  icon="◉"
                  title="No approved reports for this filter"
                  message="Try another category or repair status."
                />
              ) : (
                <ul className="max-h-[560px] space-y-2.5 overflow-y-auto pr-1">
                  {visibleReports.map((report) => {
                    const dist = placeOrigin
                      ? distanceKm(placeOrigin.lat, placeOrigin.lng, report.latitude, report.longitude)
                      : null;
                    return (
                      <li key={report.id}>
                        <button
                          type="button"
                          onClick={() => openDetail(report.id)}
                          className={`flex w-full items-center gap-3 rounded-brand-sm border p-3 text-left transition hover:border-navy ${
                            selectedId === report.id ? 'border-navy bg-sheet' : 'border-azure bg-surface'
                          }`}
                        >
                          {report.thumbnailUrl ? (
                            <AuthImage
                              src={report.thumbnailUrl}
                              isPublic
                              alt=""
                              className="h-14 w-14 shrink-0 rounded-brand-sm object-cover"
                            />
                          ) : (
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-brand-sm bg-cream text-lg text-navy">
                              ◉
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-navy">{report.title}</p>
                            <p className="truncate text-xs text-ink-3">
                              {report.referenceNo} ·{' '}
                              {locationLabel(report.latitude, report.longitude, report.addressText, report.areaLabel)}
                            </p>
                            {dist !== null && (
                              <p className="mt-0.5 text-xs text-ink-3">{formatDistance(dist)}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <CategoryChip category={report.category} />
                              <RepairBadge status={report.repairStatus} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>

          <div className="lg:col-span-2">
            <Section title="Map" description="Colour-coded by repair status">
              <div className="overflow-hidden rounded-brand-sm border border-azure" style={{ height: 420 }}>
                <MapCanvas
                  markers={markers}
                  onSelect={openDetail}
                  focusId={focusId}
                  focusPoint={focusPoint}
                  className="h-full w-full"
                />
              </div>
            </Section>

            {selectedId && (
              <div className="mt-6">
                <PublicDetail
                  loading={detail.loading}
                  error={detail.error}
                  report={detail.data}
                  onRetry={detail.reload}
                  onPhoto={setLightboxIndex}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {detail.data && lightboxIndex !== null && detail.data.photos[lightboxIndex] && (
        <Lightbox
          photos={detail.data.photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}

function PublicDetail({
  loading,
  error,
  report,
  onRetry,
  onPhoto,
}: {
  loading: boolean;
  error: string | null;
  report: Report | null;
  onRetry: () => void;
  onPhoto: (index: number) => void;
}) {
  if (loading && !report) return <LoadingBlock label="Loading details…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!report) return null;

  return (
    <Section title={report.title} description={report.referenceNo}>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={report.category} />
        <RepairBadge status={report.repairStatus} />
        <PriorityBadge priority={report.priority} />
      </div>

      {report.photos.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {report.photos.map((photo, index) => (
            <AuthImage
              key={photo.id}
              src={photo.url}
              isPublic
              alt={`Photo ${index + 1}`}
              className="h-20 w-20 shrink-0 cursor-pointer rounded-brand-sm border border-azure object-cover"
              onClick={() => onPhoto(index)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-2">{report.description}</p>

      <p className="mt-3 text-xs text-ink-3">
        {locationLabel(report.latitude, report.longitude, report.addressText, report.areaLabel)} · reported{' '}
        {relativeTime(report.createdAt)}
      </p>

      {report.completionNotes && (
        <div className="mt-4 rounded-brand-sm border border-green/25 bg-green-tint p-3.5 text-sm text-ink-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green">Completion notes</p>
          {report.completionNotes}
        </div>
      )}

      {report.completedAt && (
        <p className="mt-3 text-xs text-green">Completed {formatDateTime(report.completedAt)}</p>
      )}

      <a
        className="btn btn-secondary btn-sm mt-4"
        href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=17/${report.latitude}/${report.longitude}`}
        target="_blank"
        rel="noreferrer"
      >
        Open in OpenStreetMap ↗
      </a>
    </Section>
  );
}
