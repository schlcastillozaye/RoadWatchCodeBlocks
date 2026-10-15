import { formatDateTime, titleCase } from '../lib/format';
import type { StatusHistoryEntry } from '../lib/types';

const TYPE_COLORS: Record<string, string> = {
  CREATION: 'bg-navy',
  MODERATION: 'bg-green',
  ASSIGNMENT: 'bg-blue',
  REPAIR: 'bg-amber',
};

export function Timeline({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-3">No status updates recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-1">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
          <div className="relative flex flex-col items-center">
            <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${TYPE_COLORS[entry.type] ?? 'bg-slate'}`} />
            {index < entries.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-azure" />}
          </div>
          <div className="min-w-0 flex-1 -mt-0.5">
            <p className="text-sm font-semibold text-ink">
              {titleCase(entry.type)}
              {entry.toValue && <span className="font-normal text-ink-2"> · {titleCase(entry.toValue)}</span>}
            </p>
            {entry.note && <p className="mt-0.5 text-sm text-ink-2">{entry.note}</p>}
            <p className="mt-0.5 text-xs text-ink-3">
              {[entry.actor?.fullName, formatDateTime(entry.createdAt)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
