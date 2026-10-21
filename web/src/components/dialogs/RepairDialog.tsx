import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { Banner, Spinner } from '../Feedback';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { REPAIR_LABELS } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Report, RepairStatus } from '../../lib/types';

type TargetStatus = 'IN_PROGRESS' | 'AWAITING_VERIFICATION';

const NEXT_STATUS: Record<RepairStatus, TargetStatus> = {
  NOT_ASSIGNED: 'IN_PROGRESS',
  AWAITING_MAINTENANCE: 'IN_PROGRESS',
  IN_PROGRESS: 'AWAITING_VERIFICATION',
  AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
  RETURNED_FOR_WORK: 'IN_PROGRESS',
  COMPLETED: 'AWAITING_VERIFICATION',
  VERIFIED_COMPLETED: 'AWAITING_VERIFICATION',
};

export function RepairDialog({
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
  const [status, setStatus] = useState<TargetStatus>(NEXT_STATUS[report.repairStatus]);
  const [note, setNote] = useState('');
  const [completionNotes, setCompletionNotes] = useState(report.completionNotes ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setStatus(NEXT_STATUS[report.repairStatus]);
      setNote('');
      setCompletionNotes(report.completionNotes ?? '');
      setFiles([]);
      setError(null);
    }
  }, [open, report.repairStatus, report.completionNotes]);

  const isSubmission = status === 'AWAITING_VERIFICATION';
  const existingAfter = report.photos.filter((photo) => photo.kind === 'AFTER').length;
  const blockedReason = useMemo(() => {
    if (!isSubmission) return null;
    if (completionNotes.trim().length < 5) return 'Completion notes are required (at least 5 characters).';
    if (files.length < 1) return 'Add at least one completion (after) photo.';
    return null;
  }, [isSubmission, completionNotes, files.length]);

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
        completionNotes: isSubmission ? completionNotes.trim() : undefined,
        photos: files,
      });
      onDone(updated);
      toast.success(
        status === 'AWAITING_VERIFICATION' ? 'Repair evidence submitted for admin verification.' : `Repair status set to ${REPAIR_LABELS[status]}.`,
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
            {[NEXT_STATUS[report.repairStatus]].map((key) => (
              <option key={key} value={key}>
                {REPAIR_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="brand-label" htmlFor="repair-note">
            {isSubmission ? 'Completion notes' : 'Progress note (optional)'}
          </label>
          <textarea
            id="repair-note"
            className="brand-input min-h-[80px] resize-y"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Crew dispatched, patching scheduled for tomorrow morning."
          />
        </div>

        {isSubmission && (
          <>
            <div>
              <label className="brand-label" htmlFor="completion-notes">
                Completion notes (at least 5 characters) <span className="text-red">*</span>
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
                  : '                  At least one after photo is required for admin verification.'}
                {files.length > 0 && ` ${files.length} new file${files.length === 1 ? '' : 's'} selected.`}
              </p>
            </div>

          </>
        )}

        {!isSubmission && files.length === 0 && (
          <p className="text-xs text-ink-3">
            Tip: you can attach progress photos for non-final updates too — select files above before saving.
          </p>
        )}

        {!isSubmission && (
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
