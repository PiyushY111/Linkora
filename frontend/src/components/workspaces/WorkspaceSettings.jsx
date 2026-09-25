import { useState } from 'react';
import { Save, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';
import useAuthStore from '../../context/authStore';
import OrganizationSsoSettings from './OrganizationSsoSettings';
import OrganizationIpAllowlistSettings from './OrganizationIpAllowlistSettings';
import OrganizationAuditSettings from './OrganizationAuditSettings';
import DirectorySyncSettings from './DirectorySyncSettings';

const UTM_FIELDS = [
  { key: 'source', label: 'Source', placeholder: 'newsletter' },
  { key: 'medium', label: 'Medium', placeholder: 'email' },
  { key: 'campaign', label: 'Campaign', placeholder: 'spring_launch' },
  { key: 'term', label: 'Term', placeholder: '' },
  { key: 'content', label: 'Content', placeholder: '' },
];

function emptyUtm() {
  return Object.fromEntries(UTM_FIELDS.map(({ key }) => [key, '']));
}

/**
 * Workspace-wide defaults (admin+). They pre-fill the create-link and QR
 * forms for everyone in the workspace; each link can still override them.
 * @param {{ workspaceId: string, detail: object, organizationSso?: object | null,
 *   organizationIpAllowlist?: object | null, organizationAudit?: object | null,
 *   organizationDirectorySync?: object | null, workspaceName?: string,
 *   customRoles?: { id: string, name: string }[], onChanged: () => Promise<void> }} props
 *   The organization* blocks are only present for owners.
 */
export default function WorkspaceSettings({
  workspaceId,
  detail,
  organizationSso,
  organizationIpAllowlist,
  organizationAudit,
  organizationDirectorySync,
  workspaceName = 'this workspace',
  customRoles = [],
  onChanged,
}) {
  const { activeWorkspace, setActiveWorkspace } = useAuthStore();
  const [utm, setUtm] = useState(() => ({ ...emptyUtm(), ...(detail.defaultUtmParams || {}) }));
  const [isSaving, setIsSaving] = useState(false);

  const save = async (changes, successMessage) => {
    setIsSaving(true);
    try {
      const data = await workspaceService.updateSettings(workspaceId, changes);
      // Keep the pre-fill defaults current if this is the workspace in use.
      if (activeWorkspace && String(activeWorkspace.id) === String(workspaceId)) {
        setActiveWorkspace({ ...activeWorkspace, settings: data.settings });
      }
      await onChanged();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveUtm = (e) => {
    e.preventDefault();
    const trimmed = Object.fromEntries(
      Object.entries(utm)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    );
    save({ defaultUtmParams: Object.keys(trimmed).length > 0 ? trimmed : null }, 'UTM defaults saved');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveUtm} className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Default UTM parameters</p>
          <p className="mt-1 text-xs text-paper-500">
            Pre-filled on every new link in this workspace, ahead of each member&apos;s personal defaults. Editable per link.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {UTM_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="field-label" htmlFor={`utm-${workspaceId}-${key}`}>
                {label}
              </label>
              <input
                id={`utm-${workspaceId}-${key}`}
                type="text"
                className="input"
                maxLength={100}
                placeholder={placeholder}
                value={utm[key]}
                onChange={(e) => setUtm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button type="submit" className="btn-secondary btn-sm" disabled={isSaving}>
          <Save size={13} /> {isSaving ? 'Saving…' : 'Save UTM defaults'}
        </button>
      </form>

      <div className="space-y-2 border-t border-ink-700 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Default QR style</p>
        <div className="flex flex-col gap-2 rounded-lg bg-ink-800/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-paper-300">
            <QrCode size={14} className="text-paper-500" />
            {detail.defaultQrStyle
              ? 'A custom style is set for new QR codes in this workspace.'
              : 'Using the built-in style. In the QR designer, choose “Make workspace default” to set one.'}
          </p>
          {detail.defaultQrStyle && (
            <button
              type="button"
              className="btn-secondary btn-sm shrink-0"
              disabled={isSaving}
              onClick={() => save({ defaultQrStyle: null }, 'QR default cleared')}
            >
              Reset to built-in
            </button>
          )}
        </div>
      </div>

      {organizationSso && <OrganizationSsoSettings sso={organizationSso} onChanged={onChanged} />}
      {organizationIpAllowlist && (
        <OrganizationIpAllowlistSettings
          // Remount after a save so the editor starts from what was stored.
          key={organizationIpAllowlist.entries.join(',')}
          allowlist={organizationIpAllowlist}
          onChanged={onChanged}
        />
      )}
      {organizationAudit && (
        <OrganizationAuditSettings
          // Remount after a save so the form starts from what was stored.
          key={String(organizationAudit.auditRetentionDays)}
          audit={organizationAudit}
          onChanged={onChanged}
        />
      )}
      {organizationDirectorySync && (
        <DirectorySyncSettings
          // Remount after a save so the form starts from what was stored.
          key={`${organizationDirectorySync.directoryId}-${organizationDirectorySync.defaultRole}`}
          sync={organizationDirectorySync}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          customRoles={customRoles}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
