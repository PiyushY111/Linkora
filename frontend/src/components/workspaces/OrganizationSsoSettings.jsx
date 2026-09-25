import { useState } from 'react';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import ToggleRow from '../ui/ToggleRow';
import { authService, workspaceService } from '../../services';
import { useConfirm } from '../../context/ConfirmContext';
import { goToSso } from '../../utils/sso';

/**
 * Organization-wide SSO (owners only; the server enforces that). Covers
 * every workspace in the organization, not just this one.
 * @param {{ sso: { id: string, name: string, slug: string, ssoConnectionId: string | null, ssoEnforced: boolean,
 *   yourSession: { authMethod: string, ssoConnectionId: string | null } }, onChanged: () => Promise<void> }} props
 *   sso: organizationSso from GET /workspaces/:id.
 */
export default function OrganizationSsoSettings({ sso, onChanged }) {
  const confirm = useConfirm();
  const [connectionId, setConnectionId] = useState(sso.ssoConnectionId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingSso, setIsStartingSso] = useState(false);

  const signedInThroughConnection =
    sso.yourSession?.authMethod === 'sso' &&
    Boolean(sso.ssoConnectionId) &&
    sso.yourSession.ssoConnectionId === sso.ssoConnectionId;

  const save = async (changes, successMessage) => {
    setIsSaving(true);
    try {
      const data = await workspaceService.updateSsoSettings(sso.id, changes);
      await onChanged();
      const revoked = data.revokedSessions ? ` ${data.revokedSessions} password session(s) signed out.` : '';
      toast.success(`${successMessage}.${revoked}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update SSO settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConnection = (e) => {
    e.preventDefault();
    save({ ssoConnectionId: connectionId.trim() || null }, 'SSO connection saved');
  };

  const handleToggleEnforced = async () => {
    if (!sso.ssoEnforced) {
      const confirmed = await confirm({
        title: 'Require single sign-on',
        message: `Members of ${sso.name} will only be able to sign in with SSO. Anyone signed in with a password is signed out now. API keys keep working.`,
        confirmText: 'Require SSO',
        cancelText: 'Cancel',
        variant: 'warning',
      });
      if (!confirmed) return;
    }
    save({ ssoEnforced: !sso.ssoEnforced }, sso.ssoEnforced ? 'SSO is now optional' : 'SSO is now required');
  };

  const handleSignInWithSso = async () => {
    setIsStartingSso(true);
    try {
      const data = await authService.startSso(sso.slug);
      if (!goToSso(data.url)) toast.error('Could not start single sign-on');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start single sign-on');
    } finally {
      setIsStartingSso(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-ink-700 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Single sign-on</p>
        <p className="mt-1 text-xs text-paper-500">
          Applies to every workspace in <span className="text-paper-300">{sso.name}</span>. Members start SSO from the
          login page with the organization ID <span className="font-mono text-paper-300">{sso.slug}</span>.
        </p>
      </div>

      <form onSubmit={handleSaveConnection} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="field-label" htmlFor={`sso-conn-${sso.id}`}>
            WorkOS connection ID
          </label>
          <input
            id={`sso-conn-${sso.id}`}
            type="text"
            className="input font-mono"
            placeholder="conn_01H..."
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            disabled={sso.ssoEnforced}
          />
        </div>
        <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={isSaving || sso.ssoEnforced}>
          <Save size={13} /> Save connection
        </button>
      </form>
      {sso.ssoEnforced && <p className="text-xs text-paper-500">To change the connection, turn off “Require SSO” first.</p>}

      <ToggleRow
        icon={<ShieldCheck size={16} className="text-accent-400" />}
        title="Require SSO"
        checked={sso.ssoEnforced}
        onToggle={handleToggleEnforced}
        disabled={isSaving || (!sso.ssoEnforced && !signedInThroughConnection)}
      >
        When on, members can&apos;t sign in with a password. Free for every organization.
      </ToggleRow>

      {!sso.ssoEnforced && sso.ssoConnectionId && !signedInThroughConnection && (
        <div className="flex flex-col gap-2 rounded-lg bg-ink-800/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-paper-300">
            To make sure this connection works before requiring it, sign in through it first. You&apos;re currently
            signed in {sso.yourSession?.authMethod === 'sso' ? 'through a different connection' : 'with a password'}.
          </p>
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={handleSignInWithSso}
            disabled={isStartingSso}
          >
            <KeyRound size={13} /> {isStartingSso ? 'Redirecting…' : 'Sign in with SSO'}
          </button>
        </div>
      )}
    </div>
  );
}
