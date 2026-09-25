import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import { logger } from '../config/logger.js';

export const PERSONAL_WORKSPACE_NAME = 'Personal';

// Same slug shape as workspaceController's createOrganization.
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function personalOrgName(user) {
  const name = user.name?.trim();
  return name ? `${name}'s Organization` : PERSONAL_WORKSPACE_NAME;
}

// Date.now() alone isn't unique across users provisioned in the same
// millisecond, so the user id's tail is appended to keep slugs distinct.
function personalOrgSlug(orgName, userId) {
  const base = slugify(orgName) || 'org';
  return `${base}-${Date.now().toString(36)}-${String(userId).slice(-6)}`;
}

function findMembership(workspace, userId) {
  return workspace?.members.find((m) => String(m.user) === String(userId)) ?? null;
}

/**
 * Returns the user's personal workspace, creating it (and its org) if needed.
 * Reuses leftovers of an interrupted earlier attempt first: a "Personal"
 * workspace the user owns inside an org they own, or an org of the expected
 * name that never got its workspace.
 * @returns {Promise<{ workspace: import('mongoose').Document, created: boolean }>}
 */
export async function findOrCreatePersonalWorkspace(user) {
  const orgName = personalOrgName(user);
  const ownedOrgIds = await Organization.find({ owner: user._id }).distinct('_id');

  const existing = await Workspace.findOne({
    organization: { $in: ownedOrgIds },
    name: PERSONAL_WORKSPACE_NAME,
    members: { $elemMatch: { user: user._id, role: 'owner' } },
  });
  if (existing) return { workspace: existing, created: false };

  const orgsWithWorkspaces = await Workspace.find({ organization: { $in: ownedOrgIds } }).distinct('organization');
  const orphanOrg = await Organization.findOne({
    _id: { $in: ownedOrgIds, $nin: orgsWithWorkspaces },
    name: orgName,
  });

  const org =
    orphanOrg ??
    (await Organization.create({ name: orgName, slug: personalOrgSlug(orgName, user._id), owner: user._id }));

  const workspace = await Workspace.create({
    organization: org._id,
    name: PERSONAL_WORKSPACE_NAME,
    members: [{ user: user._id, role: 'owner' }],
  });
  return { workspace, created: true };
}

/**
 * Picks the workspace a user should act in when their stored
 * activeWorkspace is missing or no longer includes them: the oldest
 * workspace they're still a member of, otherwise their personal one.
 */
async function pickFallbackWorkspace(user) {
  const member = await Workspace.findOne({ 'members.user': user._id }).sort({ createdAt: 1 });
  if (member) return { workspace: member, created: false };
  return findOrCreatePersonalWorkspace(user);
}

/**
 * Resolves the workspace the user is currently acting in, plus their
 * membership in it. A stored activeWorkspace is only honoured while the
 * user is still a member; otherwise one is picked (or provisioned) and
 * persisted. The write is compare-and-set on the value we read, so two
 * concurrent first requests can't leave the user pointing at different
 * workspaces: the loser re-resolves from what the winner stored.
 * @param {{ _id: unknown, name?: string, activeWorkspace?: unknown }} user
 * @returns {Promise<{ workspace: import('mongoose').Document, membership: { user: unknown, role: string } }>}
 */
export async function resolveActiveWorkspace(user, { retries = 1 } = {}) {
  if (user.activeWorkspace) {
    const workspace = await Workspace.findById(user.activeWorkspace);
    const membership = findMembership(workspace, user._id);
    if (membership) return { workspace, membership };
  }

  const { workspace, created } = await pickFallbackWorkspace(user);
  const { modifiedCount } = await User.updateOne(
    { _id: user._id, activeWorkspace: user.activeWorkspace ?? null },
    { $set: { activeWorkspace: workspace._id } }
  );

  if (modifiedCount === 0 && retries > 0) {
    // Lost the race to a concurrent request. Drop the workspace we just
    // made (its org is picked up as an orphan by the next provisioning)
    // and use whatever the winner stored.
    if (created) await Workspace.deleteOne({ _id: workspace._id });
    const fresh = await User.findById(user._id).select('_id name activeWorkspace');
    if (!fresh) throw new Error('User disappeared while resolving active workspace');
    return resolveActiveWorkspace(fresh, { retries: retries - 1 });
  }

  logger.info(
    { userId: user._id, previous: user.activeWorkspace ?? null, workspaceId: workspace._id, created },
    'Set active workspace for user'
  );
  return { workspace, membership: findMembership(workspace, user._id) };
}

export default { findOrCreatePersonalWorkspace, resolveActiveWorkspace, PERSONAL_WORKSPACE_NAME };
