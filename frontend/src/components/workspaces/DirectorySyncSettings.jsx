import { useState } from 'react';
import { Copy, Network, Save } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import ToggleRow from '../ui/ToggleRow';
import { workspaceService } from '../../services';
import { getApiOrigin } from '../../services/api';
import { roleOptions } from '../../utils/roles';

const STATE_LABELS = { provisioned: 'provisioned', invited: 'invited', linked: 'linked', deprovisioned: 'removed' };

/**
 * Automatic provisioning from the organization's identity provider via
 * WorkOS Directory Sync (SCIM). Owners only; the server enforces that.
 * @param {{ sync: object, workspaceId: string, workspaceName: string,
 *   customRoles: { id: string, name: string }[], onChanged: () => Promise<void> }} props
 *   sync: organizationDirectorySync from GET /workspaces/:id.
 */
export default function DirectorySyncSettings({ sync, workspaceId, workspaceName, customRoles, onChanged }) {
  const [directoryId, setDirectoryId] = useState(sync.directoryId ?? '');
  const [defaultRole, setDefaultRole] = useState(sync.defaultRole);
  const [isSaving, setIsSaving] = useState(false);

  // The receiver lives on the API server; the SPA may be served elsewhere.
  const webhookUrl = `${getApiOrigin() || window.location.origin}${sync.webhookPath}`;
  const targetsThisWorkspace = String(sync.workspaceId ?? '') === String(workspaceId);
  const counts = Object.entries(sync.counts ?? {}).filter(([, n]) => n > 0);

  const save = async (changes, message) => {
    setIsSaving(true);
    try {
      await workspaceService.updateDirectorySync(sync.organizationId, changes);
      await onChanged();
      toast.success(message);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update directory sync');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    save({ directoryId: directoryId.trim() || null, defaultRole }, 'Directory sync settings saved');
  };

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success('Webhook URL copied');
    } catch {
      toast.error('Could not copy; select the URL and copy it manually');
    }
  };

  return (
    <div className="space-y-3 border-t border-ink-700 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Directory sync (SCIM)</p>
        <p className="mt-1 text-xs text-paper-500">
          Add and remove {sync.organizationName}&apos;s members automatically from your identity provider (Okta, Azure AD,
          …) through WorkOS. People already on Linkora get an invite to accept instead of being added directly.
        </p>
      </div>

      {!sync.serverConfigured && (
        <p className="rounded-lg bg-ink-800/60 px-3 py-2 text-xs text-paper-300">
          This deployment isn&apos;t set up to receive directory events yet (the server needs a WorkOS webhook secret).
        </p>
      )}

      <form onSubmit={handleSave} className="grid gap-2 sm:grid-cols-2 sm:items-end">
        <div>
          <label className="field-label" htmlFor={`dir-${sync.organizationId}`}>
            WorkOS directory ID
          </label>
          <input
            id={`dir-${sync.organizationId}`}
            type="text"
            className="input font-mono"
            placeholder="directory_01H..."
            value={directoryId}
            onChange={(e) => setDirectoryId(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`dir-role-${sync.organizationId}`}>
            Role for new members
          </label>
          <select
            id={`dir-role-${sync.organizationId}`}
            className="input"
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value)}
          >
            {roleOptions(customRoles).map(({ value, label, custom }) => (
              <option key={value} value={value}>
                {custom ? `${label} (custom)` : label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary btn-sm sm:col-span-2 sm:w-fit" disabled={isSaving}>
          <Save size={13} /> Save
        </button>
      </form>

      <ToggleRow
        icon={<Network size={16} className="text-accent-400" />}
        title="Provision members from the directory"
        checked={sync.enabled}
        onToggle={() => save({ enabled: !sync.enabled }, sync.enabled ? 'Directory sync turned off' : 'Directory sync turned on')}
        disabled={isSaving || (!sync.enabled && (!sync.directoryId || !sync.serverConfigured))}
      >
        New people are added to {targetsThisWorkspace ? workspaceName : 'the organization’s first workspace'} as{' '}
        {sync.defaultRoleName}. People removed from the directory lose access to every workspace in the organization.
      </ToggleRow>

      {!targetsThisWorkspace && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={isSaving}
          onClick={() => save({ workspaceId }, `New members will be added to ${workspaceName}`)}
        >
          Add new members to {workspaceName} instead
        </button>
      )}

      <div className="space-y-1.5 rounded-lg bg-ink-800/50 px-3 py-2.5 text-xs text-paper-300">
        <p>
          In WorkOS, send Directory Sync events to:
          <button type="button" onClick={copyWebhookUrl} className="ml-1.5 inline-flex items-center gap-1 font-mono text-paper-100 hover:text-accent-400">
            {webhookUrl} <Copy size={11} />
          </button>
        </p>
        <p className="text-paper-500">
          {sync.lastEventAt
            ? `Last event ${formatDistanceToNow(new Date(sync.lastEventAt), { addSuffix: true })}`
            : 'No events received yet'}
          {counts.length > 0 && ` · ${counts.map(([state, n]) => `${n} ${STATE_LABELS[state] ?? state}`).join(', ')}`}
        </p>
      </div>
    </div>
  );
}
