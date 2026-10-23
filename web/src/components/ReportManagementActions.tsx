import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { Report } from '../lib/types';

interface ReportManagementActionsProps {
  report: Pick<Report, 'id' | 'referenceNo' | 'title'>;
  onDeleted: () => void | Promise<void>;
  showDetails?: boolean;
}

export function ReportManagementActions({
  report,
  onDeleted,
  showDetails = true,
}: ReportManagementActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = () => {
    if (!busy) setConfirmOpen(false);
  };

  const deleteReport = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAdminReport(report.id);
      setConfirmOpen(false);
      await onDeleted();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-[8.5rem] flex-wrap items-center gap-2">
      {showDetails && (
        <Link
          to={`/reports/${encodeURIComponent(report.id)}`}
          className="btn btn-ghost btn-sm"
          aria-label={`Details for ${report.referenceNo}`}
        >
          Details
        </Link>
      )}
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        disabled={busy}
        aria-label={`Delete ${report.referenceNo}`}
      >
        Delete
      </button>
      {error && (
        <p className="w-full text-xs text-red-700" role="alert">
          Could not delete {report.referenceNo}: {error}
        </p>
      )}
      <Modal
        open={confirmOpen}
        onClose={closeDialog}
        title="Delete this report?"
        description={`${report.referenceNo} · ${report.title}`}
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeDialog} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void deleteReport()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete report'}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This permanently removes the report and its related photos, assignments, and history. This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}
