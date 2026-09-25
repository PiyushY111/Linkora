import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { ASSIGNABLE_BUILT_IN_ROLES } from '../../utils/roles';

/**
 * Email + role + Invite button. Clears the email once an invite is sent.
 * @param {{ onInvite: (email: string, role: string) => Promise<unknown>, isBusy?: boolean, defaultRole?: string,
 *   roleOptions?: { value: string, label: string, custom?: boolean }[] }} props
 *   onInvite resolves to something truthy on success (see useWorkspaceInvites);
 *   roleOptions defaults to the built-in roles (utils/roles.js roleOptions adds custom ones).
 */
export default function InviteForm({
  onInvite,
  isBusy = false,
  defaultRole = 'viewer',
  roleOptions = ASSIGNABLE_BUILT_IN_ROLES,
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(defaultRole);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (await onInvite(email, role)) setEmail('');
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        placeholder="teammate@company.com"
        className="input flex-1"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Teammate email"
        required
      />
      <select className="input sm:w-40" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
        {roleOptions.map(({ value, label, custom }) => (
          <option key={value} value={value}>
            {custom ? `${label} (custom)` : label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-secondary shrink-0" disabled={isBusy}>
        <UserPlus size={14} /> Invite
      </button>
    </form>
  );
}
