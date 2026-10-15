import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Banner, Spinner } from '../Feedback';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { PRIORITY_LABELS } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Priority, Report } from '../../lib/types';

export function ModerationDialog({
  report,
  open,
  onClose,
  onDone,
}: {
  report: Report;
  open: boolean;
  onClose: () => void;
  onDone: (updated: Report) => void;
}) {
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<Priority | ''>(report.priority);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setDecision('APPROVE');
      setReason('');
      setPriority(report.priority);
      setError(null);
    }
  }, [open, report.priority]);

  const submit = async () => {
    setError(null);
    if (decision === 'REJECT' && reason.trim().length < 5) {
      setError('Please give a clear reason (at least 5 characters) so the citizen understands.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.moderate(report.id, {
        decision,
        reason: decision === 'REJECT' ? reason.trim() : undefined,
        priority: priority || undefined,
      });
      onDone(updated);
      toast.success(decision === 'APPROVE' ? 'Report approved and published.' : 'Report rejected. The citizen will see your reason.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Moderate report"
      description={`${report.referenceNo} · ${report.title}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={decision === 'APPROVE' ? 'btn btn-primary' : 'btn btn-danger'}
            onClick={submit}
            disabled={saving}
          >
            {saving && <Spinner size={16} className="border-white/40 border-t-white" />}
            {decision === 'APPROVE' ? 'Approve report' : 'Reject report'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDecision('APPROVE')}
            className={`rounded-brand-sm border px-4 py-3 text-left text-sm font-semibold transition ${
              decision === 'APPROVE' ? 'border-green bg-green-tint text-green' : 'border-azure bg-surface text-ink-2'
            }`}
          >
            ✓ Approve
            <span className="mt-1 block text-xs font-normal opacity-80">Publishes to the public map</span>
          </button>
          <button
            type="button"
            onClick={() => setDecision('REJECT')}
            className={`rounded-brand-sm border px-4 py-3 text-left text-sm font-semibold transition ${
              decision === 'REJECT' ? 'border-red bg-red-tint text-red' : 'border-azure bg-surface text-ink-2'
            }`}
          >
            ✕ Reject
            <span className="mt-1 block text-xs font-normal opacity-80">Stays hidden, reason required</span>
          </button>
        </div>

        {decision === 'REJECT' ? (
          <div>
            <label className="brand-label" htmlFor="reject-reason">
              Rejection reason <span className="text-red">*</span>
            </label>
            <textarea
              id="reject-reason"
              className="brand-input min-h-[110px] resize-y"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The photo does not clearly show a road issue, or the location appears to be on private property."
            />
          </div>
        ) : (
          <div>
            <label className="brand-label" htmlFor="approve-priority">
              Priority (optional)
            </label>
            <select
              id="approve-priority"
              className="brand-input"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority | '')}
            >
              <option value="">Keep current ({PRIORITY_LABELS[report.priority]})</option>
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITY_LABELS[key]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-3">
              Approving makes the report visible on the public map and available for assignment.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
