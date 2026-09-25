import { useState } from 'react';
import { AlertTriangle, History, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';

/**
 * How long the organization keeps its audit log (owners only; the server
 * enforces that). No plan-based cap; the minimum keeps a shortening on
 * record. Shortening deletes older entries at the next nightly cleanup.
 * @param {{ audit: { organizationId: string, organizationName: string, auditRetentionDays: number | null,
 *   minRetentionDays: number }, onChanged: () => Promise<void> }} props
 *   audit: organizationAudit from GET /workspaces/:id.
 */
export default function OrganizationAuditSettings({ audit, onChanged }) {
  const [keepForever, setKeepForever] = useState(audit.auditRetentionDays === null);
  const [days, setDays] = useState(String(audit.auditRetentionDays ?? 365));
  const [isSaving, setIsSaving] = useState(false);

  const parsedDays = Number(days);
  const daysError =
    !keepForever && (!Number.isInteger(parsedDays) || parsedDays < audit.minRetentionDays)
      ? `Enter a whole number of days, at least ${audit.minRetentionDays}`
      : null;
  const next = keepForever ? null : parsedDays;
  const isDirty = next !== audit.auditRetentionDays;

  const handleSave = async (e) => {
    e.preventDefault();
    if (daysError) return;
    setIsSaving(true);
    try {
      await workspaceService.updateAuditSettings(audit.organizationId, next);
      await onChanged();
      toast.success(next === null ? 'Audit log will be kept forever' : `Audit log kept for ${next} days`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save audit settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3 border-t border-ink-700 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Audit log retention</p>
        <p className="mt-1 text-xs text-paper-500">
          How long {audit.organizationName}&apos;s workspace activity is kept. Older entries are deleted nightly.
          Minimum {audit.minRetentionDays} days, no maximum.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label className="field-label" htmlFor={`retention-${audit.organizationId}`}>
            Keep for (days)
          </label>
          <input
            id={`retention-${audit.organizationId}`}
            type="number"
            min={audit.minRetentionDays}
            step={1}
            className="input"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={keepForever}
            aria-invalid={Boolean(daysError)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-paper-300">
          <input type="checkbox" checked={keepForever} onChange={(e) => setKeepForever(e.target.checked)} />
          Keep forever
        </label>
      </div>
      {daysError && (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertTriangle size={12} />
          <span>{daysError}</span>
        </p>
      )}
      {!keepForever && !daysError && audit.auditRetentionDays !== null && parsedDays < audit.auditRetentionDays && (
        <p className="flex items-center gap-1 text-xs text-paper-400">
          <History size={12} />
          <span>Entries older than {parsedDays} days will be permanently deleted at the next nightly cleanup.</span>
        </p>
      )}

      <button type="submit" className="btn-secondary btn-sm" disabled={isSaving || !isDirty || Boolean(daysError)}>
        <Save size={13} /> {isSaving ? 'Saving…' : 'Save retention'}
      </button>
    </form>
  );
}
