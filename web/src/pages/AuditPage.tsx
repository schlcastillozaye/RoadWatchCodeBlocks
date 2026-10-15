import { useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock } from '../components/Feedback';
import { Section, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { ROLE_LABELS, formatDateTime, titleCase } from '../lib/format';
import { useAsync } from '../lib/useAsync';

const LIMITS = [50, 100, 200] as const;

export function AuditPage() {
  const [limit, setLimit] = useState<number>(100);
  const logs = useAsync(() => api.getAuditLogs(limit), [limit]);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Immutable record of moderation, assignment and maintenance actions."
        actions={
          <>
            <select
              className="brand-input w-auto"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              aria-label="Entries to show"
            >
              {LIMITS.map((value) => (
                <option key={value} value={value}>
                  Last {value}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void logs.reload()}>
              ⟳ Refresh
            </button>
          </>
        }
      />

      {logs.loading && !logs.data ? (
        <LoadingBlock label="Loading audit entries…" />
      ) : logs.error && !logs.data ? (
        <ErrorState message={logs.error} onRetry={logs.reload} />
      ) : (logs.data?.length ?? 0) === 0 ? (
        <EmptyState icon="⌸" title="No audit entries yet" message="Actions will be recorded here as staff work." />
      ) : (
        <Section>
          <ul className="divide-y divide-azure/70">
            {logs.data!.map((log) => (
              <li key={log.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-navy">{titleCase(log.action)}</p>
                  <p className="text-xs text-ink-3">{formatDateTime(log.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-ink-2">
                  {log.actor ? `${log.actor.fullName} · ${ROLE_LABELS[log.actor.role]}` : 'System'}
                  {log.entityType ? ` · ${log.entityType}` : ''}
                  {log.entityId ? ` · ${log.entityId.slice(0, 10)}…` : ''}
                </p>
                {log.metadata ? (
                  <pre className="mt-2 overflow-x-auto rounded-brand-sm bg-sheet p-2.5 text-xs text-ink-2">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
