import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl text-navy sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'navy',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'navy' | 'amber' | 'green' | 'red' | 'blue' | 'slate';
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    navy: 'bg-navy text-surface border-navy',
    amber: 'bg-amber-tint text-amber border-amber/25',
    green: 'bg-green-tint text-green border-green/25',
    red: 'bg-red-tint text-red border-red/25',
    blue: 'bg-blue-tint text-blue border-blue/25',
    slate: 'bg-slate-tint text-slate border-slate/25',
  };

  const interactive = onClick ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md' : '';

  return (
    <div
      className={`rounded-brand border p-4 ${tones[tone]} ${interactive}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') onClick();
            }
          : undefined
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-xs opacity-80">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`brand-card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg text-navy">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-azure/70 py-2.5 last:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <div className="mt-0.5 text-sm text-ink">{value}</div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-xs text-ink-3">
        Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
