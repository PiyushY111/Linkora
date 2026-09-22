import Organization from '../models/Organization.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';

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

// List workspaces the caller belongs to.
export const listMyWorkspaces = async (req, res) => {
  const workspaces = await Workspace.find({ 'members.user': req.user.id }).populate('organization').lean();
  res.status(200).json({ success: true, workspaces });
};

export const getWorkspace = async (req, res) => {
  // req.workspace (from loadWorkspaceMembership) is intentionally
  // unpopulated so membership.user.toString() comparisons keep working;
  // populate a fresh copy here purely for display.
  const populated = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  res.status(200).json({ success: true, workspace: populated, role: req.membership.role });
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

export default { createOrganization, listMyWorkspaces, getWorkspace, upsertMember, removeMember };
