import validator from 'validator';
import Organization from '../models/Organization.js';
import Workspace, { WORKSPACE_ROLES } from '../models/Workspace.js';
import User from '../models/User.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { ROLE_RANK } from '../middleware/rbac.js';
import { generateInvite, hashInviteToken, inviteUrl, deliverInviteEmail } from '../services/inviteService.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError, GoneError } from '../lib/errors.js';

/**
 * Same normalization register applies (validator.normalizeEmail), so an
 * invite and the account created for it compare equal.
 * @returns {string | null} null if not a valid email
 */
function normalizeInviteEmail(email) {
  if (typeof email !== 'string' || !validator.isEmail(email.trim())) return null;
  return validator.normalizeEmail(email.trim()) || null;
}

function invitePayload(invite) {
  return {
    id: invite._id,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invitedBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  };
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Create an organization + a default workspace, with the caller as owner.
export const createOrganization = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });

  const org = await Organization.create({ name, slug: `${slugify(name)}-${Date.now().toString(36)}`, owner: req.user.id });
  const workspace = await Workspace.create({
    organization: org._id,
    name: 'Default',
    members: [{ user: req.user.id, role: 'owner' }],
  });

  logAudit({ action: 'organization.create', actorUserId: req.user.id, targetResourceId: String(org._id), ipAddress: getClientIp(req) });

  res.status(201).json({ success: true, organization: org, workspace });
};

// List workspaces the caller belongs to. Pending invites are excluded: this
// is visible to every member, and .lean() skips the toJSON transform.
export const listMyWorkspaces = async (req, res) => {
  const workspaces = await Workspace.find({ 'members.user': req.user.id })
    .select('-pendingInvites')
    .populate('organization')
    .lean();
  res.status(200).json({ success: true, workspaces });
};

export const getWorkspace = async (req, res) => {
  // req.workspace (from loadWorkspaceMembership) is intentionally
  // unpopulated so membership.user.toString() comparisons keep working;
  // populate a fresh copy here purely for display.
  const populated = await Workspace.findById(req.workspace._id)
    .populate('members.user', 'name email')
    .populate('pendingInvites.invitedBy', 'name email');
  const workspace = populated.toJSON();

  // Only admins manage invites; others don't see who's been invited.
  const canManageInvites = ROLE_RANK[req.membership.role] >= ROLE_RANK.admin;
  const now = Date.now();
  workspace.pendingInvites = canManageInvites
    ? workspace.pendingInvites.filter((i) => new Date(i.expiresAt).getTime() > now).map(invitePayload)
    : [];

  res.status(200).json({ success: true, workspace, role: req.membership.role });
};

// Add or update a member's role. Requires admin+ (checked by route middleware).
export const upsertMember = async (req, res) => {
  const { email, role } = req.body;
  const { workspace } = req;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const existing = workspace.members.find((m) => m.user.toString() === String(user._id));
  if (existing) {
    existing.role = role;
  } else {
    workspace.members.push({ user: user._id, role });
  }
  await workspace.save();

  logAudit({
    action: 'workspace.member.upsert',
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { member: user.email, role },
  });

  res.status(200).json({ success: true, workspace });
};

// Remove a member. Requires admin+; only an owner can remove another owner.
export const removeMember = async (req, res) => {
  const { userId } = req.params;
  const { workspace } = req;

  const target = workspace.members.find((m) => m.user.toString() === userId);
  if (!target) return res.status(404).json({ success: false, message: 'Member not found' });

  if (target.role === 'owner' && req.membership.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Only an owner can remove another owner' });
  }

  workspace.members = workspace.members.filter((m) => m.user.toString() !== userId);
  await workspace.save();

  logAudit({
    action: 'workspace.member.remove',
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { removedUser: userId },
  });

  res.status(200).json({ success: true, workspace });
};

/**
 * Invite someone to the workspace by email. Requires admin+ (route). Always
 * creates a pending invite, even for an email that already has an account,
 * so the response never reveals whether an account exists and nobody is
 * added without accepting. Inviting an email that already has a pending
 * invite replaces it (new token, fresh expiry): that's the resend.
 */
export const createInvite = async (req, res) => {
  const { workspace, membership } = req;
  const email = normalizeInviteEmail(req.body.email);
  const { role } = req.body;

  if (!email) throw new ValidationError('A valid email is required');
  if (!WORKSPACE_ROLES.includes(role)) throw new ValidationError(`role must be one of: ${WORKSPACE_ROLES.join(', ')}`);
  if (role === 'owner' && membership.role !== 'owner') {
    throw new ForbiddenError('Only an owner can invite another owner');
  }

  const memberIds = workspace.members.map((m) => m.user);
  if (await User.exists({ _id: { $in: memberIds }, email })) {
    throw new ConflictError('That person is already a member of this workspace');
  }

  const { token, tokenHash, expiresAt } = generateInvite();
  const fields = { role, tokenHash, invitedBy: req.user._id, createdAt: new Date(), expiresAt };
  const now = new Date();

  // Drop expired invites while we're here, then either refresh this email's
  // existing invite in place (resend) or add a new one. Two conditional
  // updates rather than read-modify-write, so concurrent invites to the
  // same email can't produce two entries.
  await Workspace.updateOne({ _id: workspace._id }, { $pull: { pendingInvites: { expiresAt: { $lte: now } } } });
  const refreshed = await Workspace.updateOne(
    { _id: workspace._id, 'pendingInvites.email': email },
    { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`pendingInvites.$.${k}`, v])) }
  );
  const resent = refreshed.matchedCount > 0;
  if (!resent) {
    const added = await Workspace.updateOne(
      { _id: workspace._id, 'pendingInvites.email': { $ne: email } },
      { $push: { pendingInvites: { email, ...fields } } }
    );
    if (added.matchedCount === 0) throw new ConflictError('An invite for this email was just created; try again');
  }

  const stored = await Workspace.findOne(
    { _id: workspace._id },
    { pendingInvites: { $elemMatch: { tokenHash } } }
  ).lean();
  const invite = stored.pendingInvites[0];
  const url = inviteUrl(token);

  const { delivered } = await deliverInviteEmail({
    to: email,
    url,
    workspaceName: workspace.name,
    inviterName: req.user.name,
    role,
    inviteId: String(invite._id),
  });

  logAudit({
    action: 'workspace.invite.create',
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId: String(invite._id), email, role, resent },
  });

  res.status(201).json({ success: true, invite: invitePayload(invite), inviteUrl: url, emailSent: delivered, resent });
};

/**
 * Finds the workspace holding the invite for this raw token, projecting just
 * that invite. Throws 404 if there's none and 410 if it has expired.
 */
async function findInviteByToken(token) {
  const tokenHash = hashInviteToken(token);
  const workspace = await Workspace.findOne(
    { 'pendingInvites.tokenHash': tokenHash },
    { name: 1, organization: 1, pendingInvites: { $elemMatch: { tokenHash } } }
  )
    .populate('organization', 'name')
    .lean();

  const invite = workspace?.pendingInvites?.[0];
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.expiresAt.getTime() <= Date.now()) throw new GoneError('This invite has expired');
  return { workspace, invite, tokenHash };
}

// Public: what an invite link is for, so the landing page can say
// "you've been invited to X as Y" before the invitee signs in.
export const getInvite = async (req, res) => {
  const { workspace, invite } = await findInviteByToken(req.params.token);
  res.status(200).json({
    success: true,
    invite: {
      workspace: { name: workspace.name },
      organization: { name: workspace.organization?.name ?? '' },
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
  });
};

/**
 * Accept an invite as the signed-in user, whose email must be the one
 * invited. Joining and consuming the invite are one conditional update, so
 * a token can't be redeemed twice. The workspace becomes the caller's
 * active one.
 */
export const acceptInvite = async (req, res) => {
  const { workspace, invite, tokenHash } = await findInviteByToken(req.params.token);

  if (normalizeInviteEmail(req.user.email) !== invite.email) {
    throw new ForbiddenError('This invite was sent to a different email address');
  }

  const joined = await Workspace.updateOne(
    {
      _id: workspace._id,
      'members.user': { $ne: req.user._id },
      pendingInvites: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } },
    },
    {
      $pull: { pendingInvites: { tokenHash } },
      $push: { members: { user: req.user._id, role: invite.role } },
    }
  );

  if (joined.modifiedCount === 0) {
    const alreadyMember = await Workspace.exists({ _id: workspace._id, 'members.user': req.user._id });
    if (alreadyMember) throw new ConflictError("You're already a member of this workspace");
    throw new NotFoundError('Invite not found');
  }

  await User.updateOne({ _id: req.user._id }, { $set: { activeWorkspace: workspace._id } });

  logAudit({
    action: 'workspace.invite.accept',
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId: String(invite._id), role: invite.role },
  });

  res.status(200).json({
    success: true,
    activeWorkspace: { id: workspace._id, name: workspace.name, role: invite.role },
  });
};

// Revoke a pending invite by its id. Requires admin+ (route).
export const revokeInvite = async (req, res) => {
  const { workspace } = req;
  const { inviteId } = req.params;

  const invite = workspace.pendingInvites.find((i) => String(i._id) === inviteId);
  if (!invite) throw new NotFoundError('Invite not found');

  await Workspace.updateOne({ _id: workspace._id }, { $pull: { pendingInvites: { _id: invite._id } } });

  logAudit({
    action: 'workspace.invite.revoke',
    actorUserId: req.user.id,
    targetResourceId: String(workspace._id),
    ipAddress: getClientIp(req),
    diff: { inviteId, email: invite.email },
  });

  res.status(200).json({ success: true, message: 'Invite revoked' });
};

export default {
  createOrganization,
  listMyWorkspaces,
  getWorkspace,
  upsertMember,
  removeMember,
  createInvite,
  getInvite,
  acceptInvite,
  revokeInvite,
};
