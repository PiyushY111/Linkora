import mongoose from 'mongoose';
import CustomRole from '../models/CustomRole.js';
import Workspace from '../models/Workspace.js';
import Organization from '../models/Organization.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  CUSTOM_ROLE_PERMISSIONS,
  isFixedRole,
  holdsAll,
} from '../utils/permissions.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';

const NAME_MAX = 50;

function rolePayload(role) {
  return {
    id: role._id,
    name: role.name,
    permissions: role.permissions,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/** Every permission a custom role may include, with its description, for the editor. */
function availablePermissions() {
  return CUSTOM_ROLE_PERMISSIONS.map((key) => ({
    key,
    description: PERMISSION_DESCRIPTIONS[key],
    builtInRole: PERMISSIONS[key], // lowest built-in role that has it
  }));
}

function parseName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > NAME_MAX) throw new ValidationError(`name must be 1-${NAME_MAX} characters`);
  if (isFixedRole(trimmed.toLowerCase())) throw new ValidationError('name cannot be a built-in role name');
  return trimmed;
}

/**
 * Validates a permission list and applies the grant rule: only non-owner
 * permissions, and only ones the caller holds themselves.
 */
function parsePermissions(permissions, actor) {
  if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== 'string')) {
    throw new ValidationError('permissions must be an array of permission keys');
  }
  const unique = [...new Set(permissions)];
  const invalid = unique.filter((p) => !CUSTOM_ROLE_PERMISSIONS.includes(p));
  if (invalid.length > 0) throw new ValidationError(`Not allowed in a custom role: ${invalid.join(', ')}`);
  if (!holdsAll(actor.permissions, unique)) {
    throw new ForbiddenError("You can't give a role permissions you don't have");
  }
  return unique;
}

async function findRole(req) {
  const { roleId } = req.params;
  if (!mongoose.isValidObjectId(roleId)) throw new NotFoundError('Role not found');
  const role = await CustomRole.findOne({ _id: roleId, organization: req.workspace.organization });
  if (!role) throw new NotFoundError('Role not found');
  return role;
}

/** Org-level change: record it in each of the org's workspaces' activity. */
async function auditOrgWide(req, action, role, diff) {
  const workspaceIds = await Workspace.find({ organization: req.workspace.organization }).distinct('_id');
  for (const workspace of workspaceIds) {
    logAudit({
      action,
      workspace,
      actorUserId: req.user.id,
      targetResourceId: String(role._id),
      ipAddress: getClientIp(req),
      diff,
    });
  }
}

const duplicateName = (err) => err?.code === 11000;

// GET /:workspaceId/roles — any member: role names show in member lists.
export const listRoles = async (req, res) => {
  const roles = await CustomRole.find({ organization: req.workspace.organization }).sort({ name: 1 }).lean();
  res.status(200).json({ success: true, roles: roles.map(rolePayload), availablePermissions: availablePermissions() });
};

// POST /:workspaceId/roles ('roles:manage')
export const createRole = async (req, res) => {
  const name = parseName(req.body?.name);
  const permissions = parsePermissions(req.body?.permissions ?? [], req.membership);

  let role;
  try {
    role = await CustomRole.create({ organization: req.workspace.organization, name, permissions, createdBy: req.user._id });
  } catch (err) {
    if (duplicateName(err)) throw new ConflictError('A role with that name already exists in this organization');
    throw err;
  }

  await auditOrgWide(req, 'organization.role.create', role, { name, permissions });
  res.status(201).json({ success: true, role: rolePayload(role) });
};

// PATCH /:workspaceId/roles/:roleId ('roles:manage'). Changes apply to
// everyone holding the role on their next request.
export const updateRole = async (req, res) => {
  const role = await findRole(req);
  const { name, permissions } = req.body ?? {};
  if (name === undefined && permissions === undefined) throw new ValidationError('Nothing to update');

  // Editing a role is granting (or removing) its permissions from everyone
  // who has it, so the caller must hold its current permissions too.
  if (!holdsAll(req.membership.permissions, role.permissions)) {
    throw new ForbiddenError("You can't edit a role with permissions you don't have");
  }

  const before = { name: role.name, permissions: [...role.permissions] };
  if (name !== undefined) role.name = parseName(name);
  if (permissions !== undefined) role.permissions = parsePermissions(permissions, req.membership);

  try {
    await role.save();
  } catch (err) {
    if (duplicateName(err)) throw new ConflictError('A role with that name already exists in this organization');
    throw err;
  }

  await auditOrgWide(req, 'organization.role.update', role, {
    before,
    after: { name: role.name, permissions: role.permissions },
  });
  res.status(200).json({ success: true, role: rolePayload(role) });
};

// DELETE /:workspaceId/roles/:roleId ('roles:manage'). Refused while any
// member or pending invite in the organization still has the role.
export const deleteRole = async (req, res) => {
  const role = await findRole(req);
  if (!holdsAll(req.membership.permissions, role.permissions)) {
    throw new ForbiddenError("You can't delete a role with permissions you don't have");
  }

  const roleId = String(role._id);
  const inUse = await Workspace.find({
    organization: req.workspace.organization,
    $or: [{ 'members.role': roleId }, { 'pendingInvites.role': roleId }],
  }).lean();
  // Also refused while directory sync hands this role to new members.
  if (await Organization.exists({ _id: req.workspace.organization, 'directorySync.defaultRole': roleId })) {
    throw new ConflictError('This role is the default role for directory-provisioned members. Change that first.');
  }
  if (inUse.length > 0) {
    const members = inUse.reduce((n, w) => n + w.members.filter((m) => m.role === roleId).length, 0);
    const invites = inUse.reduce((n, w) => n + (w.pendingInvites || []).filter((i) => i.role === roleId).length, 0);
    throw new ConflictError(
      `This role is still assigned to ${members} member(s) and ${invites} pending invite(s). Change their role first.`
    );
  }

  await CustomRole.deleteOne({ _id: role._id });
  await auditOrgWide(req, 'organization.role.delete', role, { name: role.name, permissions: role.permissions });
  res.status(200).json({ success: true, message: 'Role deleted' });
};

export default { listRoles, createRole, updateRole, deleteRole };
