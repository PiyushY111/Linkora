import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import { logger } from '../config/logger.js';
import { withPermissions } from './roleService.js';

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
function orgSlug(orgName, userId) {
  const base = slugify(orgName) || 'org';
  return `${base}-${Date.now().toString(36)}-${String(userId).slice(-6)}`;
}

function findMembership(workspace, userId) {
  return workspace?.members.find((m) => String(m.user) === String(userId)) ?? null;
}

/**
 * Returns the first workspace for a new (or not yet migrated) user, creating
 * it and its organization if needed. With no options this is the personal
 * setup: org "{name}'s Organization" (or "Personal" for a blank name) and a
 * workspace named "Personal". Signup passes both names for a team account.
 *
 * Reuses leftovers of an interrupted earlier attempt first: a workspace of
 * that name the user owns inside an org they own, or an org of the expected
 * name that never got its workspace.
 * @param {{ _id: unknown, name?: string }} user
 * @param {{ orgName?: string, workspaceName?: string }} [names]
 * @returns {Promise<{ workspace: import('mongoose').Document, created: boolean }>}
 */
export async function createWorkspaceForNewUser(
  user,
  { orgName = personalOrgName(user), workspaceName = PERSONAL_WORKSPACE_NAME } = {}
) {
  const ownedOrgIds = await Organization.find({ owner: user._id }).distinct('_id');

  const existing = await Workspace.findOne({
    organization: { $in: ownedOrgIds },
    name: workspaceName,
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
    (await Organization.create({ name: orgName, slug: orgSlug(orgName, user._id), owner: user._id }));

  const workspace = await Workspace.create({
    organization: org._id,
    name: workspaceName,
    members: [{ user: user._id, role: 'owner' }],
  });
  return { workspace, created: true };
}

/**
 * Signup: create the user's first workspace (see createWorkspaceForNewUser
 * for `names`) and make it their active one.
 * @returns {Promise<{ workspace: import('mongoose').Document, membership: { user: unknown, role: string } }>}
 */
export async function setUpNewUserWorkspace(user, names) {
  const { workspace } = await createWorkspaceForNewUser(user, names);
  await User.updateOne({ _id: user._id }, { $set: { activeWorkspace: workspace._id } });
  return { workspace, membership: await withPermissions(findMembership(workspace, user._id), workspace.organization) };
}

/**
 * Picks the workspace a user should act in when their stored
 * activeWorkspace is missing or no longer includes them: the oldest
 * workspace they're still a member of, otherwise their personal one.
 */
async function pickFallbackWorkspace(user) {
  const member = await Workspace.findOne({ 'members.user': user._id }).sort({ createdAt: 1 });
  if (member) return { workspace: member, created: false };
  return createWorkspaceForNewUser(user);
}

/**
 * Resolves the workspace the user is currently acting in, plus their
 * membership in it. A stored activeWorkspace is only honoured while the
 * user is still a member; otherwise one is picked (or provisioned) and
 * persisted. The write is compare-and-set on the value we read, so two
 * concurrent first requests can't leave the user pointing at different
 * workspaces: the loser re-resolves from what the winner stored.
 * @param {{ _id: unknown, name?: string, activeWorkspace?: unknown }} user
 * The membership comes back resolved (roleService.withPermissions):
 * { user, role, roleName, permissions }, for fixed and custom roles alike.
 * @returns {Promise<{ workspace: import('mongoose').Document, membership: { user: unknown, role: string, roleName: string, permissions: string[] } }>}
 */
export async function resolveActiveWorkspace(user, { retries = 1 } = {}) {
  if (user.activeWorkspace) {
    const workspace = await Workspace.findById(user.activeWorkspace);
    const membership = findMembership(workspace, user._id);
    if (membership) return { workspace, membership: await withPermissions(membership, workspace.organization) };
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
  return { workspace, membership: await withPermissions(findMembership(workspace, user._id), workspace.organization) };
}

/** A workspace's link-creation defaults, as returned to clients. */
export function workspaceSettingsPayload(workspace) {
  return {
    defaultDomain: workspace.defaultDomain ?? null,
    defaultQrStyle: workspace.defaultQrStyle ?? null,
    defaultUtmParams: workspace.defaultUtmParams ?? null,
  };
}

/**
 * The active-workspace block auth responses carry alongside the user.
 * `permissions` lists the actions the role allows, so the frontend can hide
 * controls without its own copy of the matrix; `role` is a built-in role
 * name or a custom role id, `roleName` is for display; `settings` holds the
 * defaults the link-creation UI pre-fills.
 * @param {object} workspace
 * @param {{ role: string, roleName: string, permissions: string[] }} membership - resolved (roleService.withPermissions)
 * @returns {{ id: unknown, name: string, role: string, roleName: string, permissions: string[], settings: object }}
 */
export function toActiveWorkspacePayload(workspace, membership) {
  return {
    id: workspace._id,
    name: workspace.name,
    role: membership.role,
    roleName: membership.roleName,
    permissions: membership.permissions,
    settings: workspaceSettingsPayload(workspace),
  };
}

export default {
  createWorkspaceForNewUser,
  setUpNewUserWorkspace,
  resolveActiveWorkspace,
  toActiveWorkspacePayload,
  workspaceSettingsPayload,
  PERSONAL_WORKSPACE_NAME,
};
