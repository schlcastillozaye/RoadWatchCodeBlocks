import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { Banner, Spinner } from '../Feedback';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { REPAIR_LABELS } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Report, RepairStatus } from '../../lib/types';

type TargetStatus = 'AWAITING_MAINTENANCE' | 'IN_PROGRESS' | 'COMPLETED';

const NEXT_STATUS: Record<RepairStatus, TargetStatus> = {
  NOT_ASSIGNED: 'AWAITING_MAINTENANCE',
  AWAITING_MAINTENANCE: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'COMPLETED',
};

export function RepairDialog({
  report,
  open,
  onClose,
  onDone,
  canOverride,
}: {
  report: Report;
  open: boolean;
  onClose: () => void;
  onDone: (updated: Report) => void;
  canOverride: boolean;
}) {
  const [status, setStatus] = useState<TargetStatus>(NEXT_STATUS[report.repairStatus]);
  const [note, setNote] = useState('');
  const [completionNotes, setCompletionNotes] = useState(report.completionNotes ?? '');
  const [override, setOverride] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setStatus(NEXT_STATUS[report.repairStatus]);
      setNote('');
      setCompletionNotes(report.completionNotes ?? '');
      setOverride(false);
      setFiles([]);
      setError(null);
    }
  }, [open, report.repairStatus, report.completionNotes]);

  const isCompletion = status === 'COMPLETED';
  const existingAfter = report.photos.filter((photo) => photo.kind === 'AFTER').length;
  const willHaveAfter = existingAfter + files.length;

  const blockedReason = useMemo(() => {
    if (!isCompletion) return null;
    if (completionNotes.trim().length < 5) return 'Completion notes are required (at least 5 characters).';
    if (willHaveAfter < 1 && !override) {
      return 'Add at least one completion (after) photo, or tick the administrator override.';
    }
    return null;
  }, [isCompletion, completionNotes, willHaveAfter, override]);

  const submit = async () => {
    setError(null);
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateRepair(report.id, {
        repairStatus: status,
        note: note.trim() || undefined,
        completionNotes: isCompletion ? completionNotes.trim() : undefined,
        overrideCompletion: isCompletion && override && willHaveAfter < 1 ? true : undefined,
        photos: files,
      });
      onDone(updated);
      toast.success(
        status === 'COMPLETED' ? 'Repair marked as completed.' : `Repair status set to ${REPAIR_LABELS[status]}.`,
      );
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
      title="Update maintenance status"
      description={`${report.referenceNo} · currently ${REPAIR_LABELS[report.repairStatus]}`}
      widthClass="max-w-xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || Boolean(blockedReason)}>
            {saving && <Spinner size={16} className="border-white/40 border-t-white" />}
            Save update
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}

        <div>
          <label className="brand-label" htmlFor="repair-status">
            Repair status
          </label>
          <select
            id="repair-status"
            className="brand-input"
            value={status}
            onChange={(event) => setStatus(event.target.value as TargetStatus)}
          >
            {(['AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED'] as TargetStatus[]).map((key) => (
              <option key={key} value={key}>
                {REPAIR_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="brand-label" htmlFor="repair-note">
            {isCompletion ? 'Closing note (optional)' : 'Progress note (optional)'}
          </label>
          <textarea
            id="repair-note"
            className="brand-input min-h-[80px] resize-y"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Crew dispatched, patching scheduled for tomorrow morning."
          />
        </div>

        {isCompletion && (
          <>
            <div>
              <label className="brand-label" htmlFor="completion-notes">
                Completion notes <span className="text-red">*</span>
              </label>
              <textarea
                id="completion-notes"
                className="brand-input min-h-[100px] resize-y"
                value={completionNotes}
                onChange={(event) => setCompletionNotes(event.target.value)}
                placeholder="Describe the work performed, materials used and final condition of the road."
              />
            </div>

            <div>
              <label className="brand-label" htmlFor="after-photos">
                Completion photo(s) {existingAfter === 0 && <span className="text-red">*</span>}
              </label>
              <input
                id="after-photos"
                type="file"
                accept="image/*"
                multiple
                className="brand-input file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-surface"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
              <p className="mt-1.5 text-xs text-ink-3">
                {existingAfter > 0
                  ? `${existingAfter} completion photo${existingAfter === 1 ? '' : 's'} already uploaded.`
                  : 'At least one after photo is required to complete the repair.'}
                {files.length > 0 && ` ${files.length} new file${files.length === 1 ? '' : 's'} selected.`}
              </p>
            </div>

            {canOverride && (
              <label className="flex items-start gap-3 rounded-brand-sm border border-azure bg-cream px-3.5 py-3 text-sm text-ink-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={override}
                  onChange={(event) => setOverride(event.target.checked)}
                />
                <span>
                  <span className="block font-semibold text-navy">Administrator override</span>
                  Complete this repair without an after photo. The override is recorded in the audit log.
                </span>
              </label>
            )}
          </>
        )}

        {status !== 'COMPLETED' && files.length === 0 && (
          <p className="text-xs text-ink-3">
            Tip: you can attach progress photos for non-final updates too — select files above before saving.
          </p>
        )}

        {status !== 'COMPLETED' && (
          <div>
            <label className="brand-label" htmlFor="progress-photos">
              Progress photo(s) (optional)
            </label>
            <input
              id="progress-photos"
              type="file"
              accept="image/*"
              multiple
              className="brand-input file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-surface"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
