import type { ReactNode } from 'react';

export function Spinner({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-azure border-t-navy ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-ink-3">
      <Spinner size={26} />
      {label}
    </div>
  );
}

export function EmptyState({
  icon = '◍',
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-[74px] w-[74px] items-center justify-center rounded-brand-lg bg-cream text-3xl text-navy">
        {icon}
      </div>
      <h3 className="text-lg">{title}</h3>
      {message && <p className="max-w-md text-sm text-ink-3">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-[64px] w-[64px] items-center justify-center rounded-brand bg-red-tint text-2xl text-red">
        ⚠
      </div>
      <h3 className="text-lg">Something went wrong</h3>
      <p className="max-w-md text-sm text-ink-3">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm mt-1" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="brand-card h-[92px] animate-pulse opacity-70" />
      ))}
    </div>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'success' | 'error';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-sky/50 border-sky text-ink-2',
    warn: 'bg-cream border-azure text-ink-2',
    success: 'bg-green-tint border-green/25 text-green',
    error: 'bg-red-tint border-red/25 text-red',
  } as const;

  return (
    <div className={`flex items-start gap-3 rounded-brand-sm border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
  );
}
