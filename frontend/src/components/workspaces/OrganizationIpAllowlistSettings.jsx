import { useState } from 'react';
import { AlertTriangle, Globe, Plus, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';
import { isValidAllowlistEntry } from '../../utils/ipAllowlist';

/**
 * Organization IP allowlist (owners only; the server enforces that). An
 * empty list means no restriction. Changes apply when saved.
 * @param {{ allowlist: { organizationId: string, organizationName: string, entries: string[], yourIp: string },
 *   onChanged: () => Promise<void> }} props
 *   allowlist: organizationIpAllowlist from GET /workspaces/:id.
 */
export default function OrganizationIpAllowlistSettings({ allowlist, onChanged }) {
  const [entries, setEntries] = useState(allowlist.entries);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = entries.join('\n') !== allowlist.entries.join('\n');

  const addEntry = (value) => {
    const entry = value.trim();
    if (!isValidAllowlistEntry(entry)) {
      setDraftError('Enter an IP address (203.0.113.7) or CIDR range (203.0.113.0/24)');
      return;
    }
    setDraftError(null);
    if (!entries.includes(entry)) setEntries((prev) => [...prev, entry]);
    setDraft('');
  };

  const handleAdd = (e) => {
    e.preventDefault();
    addEntry(draft);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await workspaceService.updateIpAllowlist(allowlist.organizationId, entries);
      await onChanged();
      toast.success(entries.length ? 'IP allowlist saved' : 'IP allowlist cleared: no restriction');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save the IP allowlist');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-ink-700 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">IP allowlist</p>
        <p className="mt-1 text-xs text-paper-500">
          When set, members and API keys can only act in {allowlist.organizationName}&apos;s workspaces from these
          addresses. Leave it empty for no restriction. Your current IP is{' '}
          <span className="font-mono text-paper-300">{allowlist.yourIp}</span>.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg bg-ink-800/50 px-3 py-2 text-xs text-paper-400">No restriction: any IP address can connect.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry} className="flex items-center justify-between rounded-lg bg-ink-800/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-mono text-paper-200">
                <Globe size={13} className="text-paper-500" />
                {entry}
              </span>
              <button
                type="button"
                onClick={() => setEntries((prev) => prev.filter((e) => e !== entry))}
                className="text-paper-500 hover:text-danger"
                aria-label={`Remove ${entry}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <input
            type="text"
            className="input font-mono"
            placeholder="203.0.113.0/24"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (draftError) setDraftError(null);
            }}
            aria-label="IP address or CIDR range"
            aria-invalid={Boolean(draftError)}
            aria-describedby={draftError ? `ip-error-${allowlist.organizationId}` : undefined}
          />
          {draftError && (
            <p id={`ip-error-${allowlist.organizationId}`} className="mt-1.5 flex items-center gap-1 text-xs text-danger">
              <AlertTriangle size={12} />
              <span>{draftError}</span>
            </p>
          )}
        </div>
        <button type="submit" className="btn-secondary btn-sm shrink-0">
          <Plus size={13} /> Add
        </button>
        {!entries.includes(allowlist.yourIp) && (
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => addEntry(allowlist.yourIp)}>
            <Plus size={13} /> Add my IP
          </button>
        )}
      </form>

      <button type="button" className="btn-primary btn-sm" onClick={handleSave} disabled={isSaving || !isDirty}>
        <Save size={13} /> {isSaving ? 'Saving…' : 'Save allowlist'}
      </button>
    </div>
  );
}
