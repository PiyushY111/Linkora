/**
 * Turns a workspace audit entry ({ action, diff, targetResourceId }) into a
 * short label and a target for the Activity tab. Unknown actions fall back
 * to the raw action name, so new audit actions still show up.
 */
const code = (diff) => (diff?.shortCode ? `/${diff.shortCode}` : 'a link');

const DESCRIBERS = {
  'link.create': (d) => ['Created link', code(d)],
  'link.update': (d) => ['Edited link', code(d)],
  'link.delete': (d) => ['Deleted link', code(d)],
  'link.toggle_status': (d) => [d?.isActive ? 'Activated link' : 'Paused link', null],
  'link.transfer.in': (d) => ['Moved link in from another workspace', code(d)],
  'link.transfer.out': (d) => ['Moved link to another workspace', code(d)],
  'api.link.create': (d) => ['Created link via API', code(d)],
  'api.link.update': () => ['Edited link via API', null],
  'api.link.delete': () => ['Deleted link via API', null],
  'api.link.bulk_create': (d) => [`Bulk-created ${d?.succeeded ?? 0} of ${d?.requested ?? 0} links via API`, null],
  'apikey.create': (d) => ['Created API key', d?.name ?? null],
  'apikey.update': (d) => ['Updated API key', d?.name ?? null],
  'apikey.roll': () => ['Rolled an API key secret', null],
  'apikey.revoke': () => ['Revoked an API key', null],
  'webhook.create': (d) => ['Added webhook', d?.url ?? null],
  'webhook.update': (d) => ['Updated webhook', d?.url ?? null],
  'webhook.delete': () => ['Deleted a webhook', null],
  'webhook.rotateSecret': () => ['Rotated a webhook secret', null],
  'workspace.member.upsert': (d) => [`Set member role to ${d?.role ?? '?'}`, d?.member ?? null],
  'workspace.member.remove': () => ['Removed a member', null],
  'workspace.invite.create': (d) => [`${d?.resent ? 'Resent invite' : 'Invited'} as ${d?.role ?? '?'}`, d?.email ?? null],
  'workspace.invite.accept': (d) => [`Joined as ${d?.role ?? '?'}`, null],
  'workspace.invite.revoke': (d) => ['Revoked invite', d?.email ?? null],
  'workspace.settings.update': (d) => ['Updated workspace defaults', (d?.changedFields || []).join(', ') || null],
  'workspace.ownership.transfer': () => ['Transferred ownership', null],
  'organization.create': () => ['Created the organization', null],
};

/**
 * @param {{ action: string, diff?: object | null, targetResourceId?: string | null }} entry
 * @returns {{ label: string, target: string | null }}
 */
export function describeActivity(entry) {
  const describe = DESCRIBERS[entry.action];
  if (!describe) return { label: entry.action, target: entry.targetResourceId ?? null };
  const [label, target] = describe(entry.diff);
  return { label, target };
}

export default describeActivity;
