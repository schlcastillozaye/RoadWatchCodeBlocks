import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthImage } from '../components/AuthImage';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback';
import { ReportManagementActions } from '../components/ReportManagementActions';
import { CategoryChip, ModerationBadge, PriorityBadge, RepairBadge } from '../components/StatusBadge';
import { Pagination, PageHeader, Section } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_LABELS, MODERATION_LABELS, PRIORITY_LABELS, REPAIR_LABELS, relativeTime } from '../lib/format';
import type { IssueCategory, ModerationStatus, Priority, RepairStatus, ReportQuery } from '../lib/types';
import { useAsync, useDebounced } from '../lib/useAsync';

const PAGE_SIZE = 12;

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

export function ReportsPage() {
  const [params, setParams] = useSearchParams();

  const search = params.get('search') ?? '';
  const debouncedSearch = useDebounced(search);
  const category = (params.get('category') as IssueCategory | null) ?? '';
  const moderationStatus = (params.get('moderationStatus') as ModerationStatus | null) ?? '';
  const repairStatus = (params.get('repairStatus') as RepairStatus | null) ?? '';
  const priority = (params.get('priority') as Priority | null) ?? '';
  const areaLabel = params.get('areaLabel') ?? '';
  const debouncedArea = useDebounced(areaLabel);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = (params.get('sort') as ReportQuery['sort']) ?? 'newest';
  const page = Number(params.get('page') ?? '1') || 1;

  const query = useMemo<ReportQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      category: (category || undefined) as IssueCategory | undefined,
      moderationStatus: (moderationStatus || undefined) as ModerationStatus | undefined,
      repairStatus: (repairStatus || undefined) as RepairStatus | undefined,
      priority: (priority || undefined) as Priority | undefined,
      areaLabel: debouncedArea || undefined,
      from: startOfDayIso(from),
      to: endOfDayIso(to),
      sort,
    }),
    [page, debouncedSearch, category, moderationStatus, repairStatus, priority, debouncedArea, from, to, sort],
  );

  const { data, error, loading, reload } = useAsync(() => api.listReports(query), [
    query.page,
    query.search,
    query.category,
    query.moderationStatus,
    query.repairStatus,
    query.priority,
    query.areaLabel,
    query.from,
    query.to,
    query.sort,
  ]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const reloadAfterDelete = async () => {
    const refreshed = await reload();
    if (refreshed && refreshed.items.length === 0 && page > refreshed.totalPages && page > 1) {
      update('page', String(Math.max(1, refreshed.totalPages)));
    }
  };

  const activeFilterCount = [search, category, moderationStatus, repairStatus, priority, areaLabel, from, to].filter(
    Boolean,
  ).length;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Every submitted road issue, with moderation and repair state."
        actions={
          <>
            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams())}>
                Clear filters ({activeFilterCount})
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
              ⟳ Refresh
            </button>
          </>
        }
      />

      <Section className="mb-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="brand-label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              className="brand-input"
              placeholder="Title, description or reference no."
              value={search}
              onChange={(event) => update('search', event.target.value)}
            />
          </div>

          <div>
            <label className="brand-label" htmlFor="moderation">
              Moderation
            </label>
            <select
              id="moderation"
              className="brand-input"
              value={moderationStatus}
              onChange={(event) => update('moderationStatus', event.target.value)}
            >
              <option value="">All</option>
              {(Object.keys(MODERATION_LABELS) as ModerationStatus[]).map((key) => (
                <option key={key} value={key}>
                  {MODERATION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="brand-label" htmlFor="repair">
              Repair
            </label>
            <select
              id="repair"
              className="brand-input"
              value={repairStatus}
              onChange={(event) => update('repairStatus', event.target.value)}
            >
              <option value="">All</option>
              {(Object.keys(REPAIR_LABELS) as RepairStatus[]).map((key) => (
                <option key={key} value={key}>
                  {REPAIR_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="brand-label" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="brand-input"
              value={category}
              onChange={(event) => update('category', event.target.value)}
            >
              <option value="">All</option>
              {(Object.keys(CATEGORY_LABELS) as IssueCategory[]).map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="brand-label" htmlFor="priority">
              Priority
            </label>
            <select
              id="priority"
              className="brand-input"
              value={priority}
              onChange={(event) => update('priority', event.target.value)}
            >
              <option value="">All</option>
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="brand-label" htmlFor="areaLabel">
              Area
            </label>
            <input
              id="areaLabel"
              className="brand-input"
              placeholder="e.g. Quezon City"
              value={areaLabel}
              onChange={(event) => update('areaLabel', event.target.value)}
            />
          </div>

          <div>
            <label className="brand-label" htmlFor="from">
              From date
            </label>
            <input
              id="from"
              type="date"
              className="brand-input"
              value={from}
              onChange={(event) => update('from', event.target.value)}
            />
          </div>

          <div>
            <label className="brand-label" htmlFor="to">
              To date
            </label>
            <input
              id="to"
              type="date"
              className="brand-input"
              value={to}
              onChange={(event) => update('to', event.target.value)}
            />
          </div>

          <div>
            <label className="brand-label" htmlFor="sort">
              Sort
            </label>
            <select
              id="sort"
              className="brand-input"
              value={sort}
              onChange={(event) => update('sort', event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </div>
      </Section>

      {loading && !data ? (
        <LoadingBlock label="Loading reports…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon="☰"
          title="No reports match these filters"
          message="Try clearing a filter or searching for a different keyword."
        />
      ) : (
        <Section>
          {/* Desktop header row */}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8.5rem,auto)] gap-3 border-b border-azure pb-2 text-xs font-semibold uppercase tracking-wide text-ink-3 lg:grid">
            <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_auto] gap-3">
              <span>Report</span>
              <span>Category</span>
              <span>Moderation</span>
              <span>Repair</span>
              <span className="text-right">Submitted</span>
            </div>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-azure/70">
            {data!.items.map((report) => (
              <li key={report.id}>
                <div className="grid gap-3 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <Link
                    to={`/reports/${encodeURIComponent(report.id)}`}
                    className="grid min-w-0 gap-3 transition hover:bg-sheet/70 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_auto] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {report.photos[0] ? (
                        <AuthImage
                          src={report.photos[0].url}
                          isPublic={report.photos[0].isPublic}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-brand-sm object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-brand-sm bg-cream text-lg text-navy">
                          ⚑
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy">{report.title}</p>
                        <p className="truncate text-xs text-ink-3">
                          {report.referenceNo} · {report.areaLabel ?? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                          <CategoryChip category={report.category} />
                          <ModerationBadge status={report.moderationStatus} />
                          <RepairBadge status={report.repairStatus} />
                        </div>
                      </div>
                    </div>

                    <div className="hidden lg:block">
                      <CategoryChip category={report.category} />
                    </div>
                    <div className="hidden lg:block">
                      <ModerationBadge status={report.moderationStatus} />
                    </div>
                    <div className="hidden lg:block">
                      <RepairBadge status={report.repairStatus} />
                    </div>

                    <div className="flex items-center justify-between gap-2 lg:flex-col lg:items-end">
                      <PriorityBadge priority={report.priority} />
                      <span className="text-xs text-ink-3">{relativeTime(report.createdAt)}</span>
                    </div>
                  </Link>
                  <ReportManagementActions report={report} onDeleted={reloadAfterDelete} />
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={data!.page}
            totalPages={data!.totalPages}
            total={data!.total}
            onPage={(next) => update('page', String(next))}
          />
        </Section>
      )}
    </>
  );
}
