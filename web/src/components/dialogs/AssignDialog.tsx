import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Banner, Spinner } from '../Feedback';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { PRIORITY_LABELS } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Officer, Priority, Report } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

export function AssignDialog({
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
  const officers = useAsync(() => (open ? api.listOfficers() : Promise.resolve([] as Officer[])), [open]);

  const [officerId, setOfficerId] = useState(report.assignedOfficer?.id ?? '');
  const [priority, setPriority] = useState<Priority | ''>(report.priority);
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setOfficerId(report.assignedOfficer?.id ?? '');
      setPriority(report.priority);
      setNote('');
      setDueDate('');
      setError(null);
    }
  }, [open, report.assignedOfficer?.id, report.priority]);

  const submit = async () => {
    setError(null);
    if (!officerId) {
      setError('Select a maintenance officer to assign this report to.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.assign(report.id, {
        officerId,
        priority: priority || undefined,
        note: note.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      onDone(updated);
      toast.success('Officer assigned. The report is now awaiting maintenance.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const officerList = officers.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign to maintenance"
      description={`${report.referenceNo} · ${report.title}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || officers.loading}>
            {saving && <Spinner size={16} className="border-white/40 border-t-white" />}
            Assign officer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        {officers.error && <Banner tone="error">{officers.error}</Banner>}

        <div>
          <label className="brand-label" htmlFor="officer">
            Maintenance officer <span className="text-red">*</span>
          </label>
          {officers.loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-3">
              <Spinner size={16} /> Loading officers…
            </div>
          ) : officerList.length === 0 ? (
            <Banner tone="warn">
              No active maintenance officers found. Create an officer account under “Users” first.
            </Banner>
          ) : (
            <select
              id="officer"
              className="brand-input"
              value={officerId}
              onChange={(event) => setOfficerId(event.target.value)}
            >
              <option value="">Select an officer…</option>
              {officerList.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.fullName} — {officer.activeAssignments ?? 0} active
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label" htmlFor="assign-priority">
              Priority
            </label>
            <select
              id="assign-priority"
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
          </div>
          <div>
            <label className="brand-label" htmlFor="dueDate">
              Target date (optional)
            </label>
            <input
              id="dueDate"
              type="date"
              className="brand-input"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="brand-label" htmlFor="assign-note">
            Instructions for the officer (optional)
          </label>
          <textarea
            id="assign-note"
            className="brand-input min-h-[90px] resize-y"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Coordinate with the barangay for traffic rerouting while working."
          />
        </div>
      </div>
    </Modal>
  );
}
