import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Skeleton from '../ui/Skeleton';
import { workspaceService } from '../../services';
import { useConfirm } from '../../context/ConfirmContext';

const EMPTY_DRAFT = { id: null, name: '', permissions: [] };

/**
 * The organization's custom roles ('roles:manage'). Shared by every
 * workspace in the org; free and unlimited.
 * @param {{ workspaceId: string, roles: { id: string, name: string, permissions: string[] }[],
 *   availablePermissions: { key: string, description: string, builtInRole: string }[],
 *   heldPermissions: string[], isLoading: boolean, onChanged: () => Promise<void> }} props
 *   heldPermissions: the viewer's own permissions here. A role can only include those
 *   (the server enforces this; the editor shows the rest disabled).
 */
export default function CustomRolesSettings({ workspaceId, roles, availablePermissions, heldPermissions, isLoading, onChanged }) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(null); // null = editor closed
  const [isSaving, setIsSaving] = useState(false);

  const describe = (key) => availablePermissions.find((p) => p.key === key)?.description ?? key;

  const togglePermission = (key) =>
    setDraft((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key) ? prev.permissions.filter((p) => p !== key) : [...prev.permissions, key],
    }));

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body = { name: draft.name, permissions: draft.permissions };
      if (draft.id) await workspaceService.updateRole(workspaceId, draft.id, body);
      else await workspaceService.createRole(workspaceId, body);
      toast.success(draft.id ? 'Role updated' : 'Role created');
      setDraft(null);
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (role) => {
    const confirmed = await confirm({
      title: 'Delete role',
      message: `Delete the "${role.name}" role? This only works once nobody has it and no pending invite uses it.`,
      confirmText: 'Delete role',
      cancelText: 'Keep role',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await workspaceService.deleteRole(workspaceId, role.id);
      toast.success('Role deleted');
      await onChanged();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete role');
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Custom roles</p>
          <p className="mt-1 text-xs text-paper-500">
            Shared by every workspace in this organization, alongside Viewer, Creator, Admin and Owner.
          </p>
        </div>
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus size={13} /> New role
        </button>
      </div>

      {isLoading && roles.length === 0 ? (
        <Skeleton className="h-16" />
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 py-8 text-paper-500">
          <ShieldCheck size={22} className="mb-2 opacity-50" />
          <p className="text-sm font-medium text-paper-300">No custom roles yet</p>
          <p className="mt-0.5 text-xs">Create one for a specific set of permissions, like an analyst or a link editor.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {roles.map((role) => (
            <li key={role.id} className="flex items-start justify-between gap-3 rounded-lg bg-ink-800/50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-paper-200">{role.name}</p>
                <p className="text-xs text-paper-500">
                  {role.permissions.length === 0 ? 'No permissions' : role.permissions.map(describe).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setDraft({ id: role.id, name: role.name, permissions: [...role.permissions] })}
                  className="text-paper-500 hover:text-paper-200"
                  aria-label={`Edit ${role.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(role)}
                  className="text-paper-500 hover:text-danger"
                  aria-label={`Delete ${role.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? 'Edit role' : 'New custom role'}>
        {draft && (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="customRoleName">
                Role name
              </label>
              <input
                id="customRoleName"
                type="text"
                className="input"
                placeholder="Analyst"
                maxLength={50}
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <fieldset>
              <legend className="field-label">Permissions</legend>
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {availablePermissions.map(({ key, description, builtInRole }) => {
                  const canGrant = heldPermissions.includes(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${
                        canGrant ? 'cursor-pointer hover:bg-ink-800/60' : 'cursor-not-allowed opacity-50'
                      }`}
                      title={canGrant ? undefined : "You can't grant a permission you don't have"}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={draft.permissions.includes(key)}
                        onChange={() => togglePermission(key)}
                        disabled={!canGrant}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-paper-200">{description}</span>
                        <span className="block font-mono text-[11px] text-paper-500">
                          {key} · built-in: {builtInRole}+
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-paper-500">
                Owner-only abilities (ownership, SSO, deleting the workspace) stay with the Owner role.
              </p>
            </fieldset>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1" disabled={isSaving}>
                {isSaving ? 'Saving…' : draft.id ? 'Save role' : 'Create role'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
