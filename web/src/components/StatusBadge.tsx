import type { ReactNode } from 'react';
import { CATEGORY_ICONS, CATEGORY_LABELS, MODERATION_LABELS, PRIORITY_LABELS, REPAIR_LABELS } from '../lib/format';
import type { IssueCategory, ModerationStatus, Priority, RepairStatus } from '../lib/types';

export type BadgeTone = 'amber' | 'green' | 'red' | 'blue' | 'slate' | 'sky' | 'navy';

const TONE_CLASSES: Record<BadgeTone, string> = {
  amber: 'bg-amber-tint text-amber border-amber/25',
  green: 'bg-green-tint text-green border-green/25',
  red: 'bg-red-tint text-red border-red/25',
  blue: 'bg-blue-tint text-blue border-blue/25',
  slate: 'bg-slate-tint text-slate border-slate/25',
  sky: 'bg-sky/60 text-navy border-sky',
  navy: 'bg-navy text-surface border-navy',
};

export function Badge({
  tone = 'slate',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const MODERATION_TONES: Record<ModerationStatus, BadgeTone> = {
  PENDING_REVIEW: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};

const REPAIR_TONES: Record<RepairStatus, BadgeTone> = {
  NOT_ASSIGNED: 'slate',
  AWAITING_MAINTENANCE: 'blue',
  IN_PROGRESS: 'amber',
  AWAITING_VERIFICATION: 'blue',
  RETURNED_FOR_WORK: 'amber',
  COMPLETED: 'green',
  VERIFIED_COMPLETED: 'green',
};

const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  LOW: 'slate',
  MEDIUM: 'blue',
  HIGH: 'amber',
  URGENT: 'red',
};

export function ModerationBadge({ status }: { status: ModerationStatus }) {
  return (
    <Badge tone={MODERATION_TONES[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {MODERATION_LABELS[status]}
    </Badge>
  );
}

export function RepairBadge({ status }: { status: RepairStatus }) {
  return (
    <Badge tone={REPAIR_TONES[status]}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {REPAIR_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={PRIORITY_TONES[priority]} className="priority-badge">
      <svg
        aria-hidden="true"
        className="priority-badge-icon"
        viewBox="0 0 16 16"
        focusable="false"
      >
        <path d="M3 1.5a.75.75 0 0 1 .75.75v.32c2.12-1.24 4.04.61 6.06.14 1.25-.29 2.18-.1 3.08.42v6.26c-1.03-.59-1.9-.82-3.08-.54-2.03.47-3.94-1.37-6.06-.14v6.54H2.25V2.25A.75.75 0 0 1 3 1.5Z" />
      </svg>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function CategoryChip({ category }: { category: IssueCategory }) {
  return (
    <Badge tone="sky">
      <span aria-hidden="true">{CATEGORY_ICONS[category]}</span>
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}
