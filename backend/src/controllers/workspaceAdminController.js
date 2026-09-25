import mongoose from 'mongoose';
import { z } from 'zod';
import Workspace from '../models/Workspace.js';
import CustomDomain from '../models/CustomDomain.js';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../utils/auditLogger.js';
import { getClientIp } from '../utils/helpers.js';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors.js';
import { workspaceSettingsPayload } from '../services/workspaceService.js';

const MAX_QR_STYLE_BYTES = 100 * 1024; // room for an embedded logo image
const ACTIVITY_DEFAULT_LIMIT = 25;
const ACTIVITY_MAX_LIMIT = 100;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'must be a hex color');
const utmValue = z.string().trim().max(100);

// Mirrors DEFAULT_QR_CONFIG in frontend/src/utils/qrPresets.js. Unknown keys
// are rejected so arbitrary data can't be parked in the workspace document.
const qrStyleSchema = z
  .object({
    dotsType: z.string().max(40),
    dotsColor: hexColor,
    bgColor: hexColor,
    isTransparent: z.boolean(),
    cornersSquareType: z.string().max(40),
    cornersSquareColor: hexColor,
    cornersDotType: z.string().max(40),
    cornersDotColor: hexColor,
    gradient: z
      .object({
        enabled: z.boolean(),
        type: z.enum(['linear', 'radial']),
        color1: hexColor,
        color2: hexColor,
        rotation: z.number().min(0).max(360),
      })
      .strict(),
    logo: z
      .string()
      .regex(/^(data:image\/(png|jpeg|gif|webp|svg\+xml);base64,|https:\/\/)/, 'must be an image data URL or https URL')
      .nullable(),
    logoSize: z.number().min(0).max(1),
    logoMargin: z.number().min(0).max(50),
    frame: z
      .object({
        type: z.string().max(40),
        text: z.string().max(60),
        subtext: z.string().max(60),
        color: hexColor,
        textColor: hexColor,
      })
      .strict(),
  })
  .partial()
  .strict()
  .refine((style) => Buffer.byteLength(JSON.stringify(style)) <= MAX_QR_STYLE_BYTES, 'QR style is too large');

const settingsSchema = z
  .object({
    defaultDomain: z.string().nullable(),
    defaultQrStyle: qrStyleSchema.nullable(),
    defaultUtmParams: z
      .object({ source: utmValue, medium: utmValue, campaign: utmValue, term: utmValue, content: utmValue })
      .partial()
      .strict()
      .nullable(),
  })
  .partial()
  .strict();

/**
 * PATCH /:workspaceId/settings ('settings:manage'). Only the keys present in
 * the body change; null clears a default. A default domain must be a
 * verified, active domain belonging to this workspace.
 */
export const updateSettings = async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(`${issue.path.join('.') || 'settings'}: ${issue.message}`);
  }
  const changes = parsed.data;
  if (Object.keys(changes).length === 0) throw new ValidationError('No settings to update');

  if (changes.defaultDomain) {
    if (!mongoose.isValidObjectId(changes.defaultDomain)) throw new ValidationError('defaultDomain: invalid id');
    const usable = await CustomDomain.exists({
      _id: changes.defaultDomain,
      workspace: req.workspace._id,
      isVerified: true,
      isActive: true,
    });
    if (!usable) throw new ValidationError('defaultDomain must be a verified domain in this workspace');
  }

  const updated = await Workspace.findByIdAndUpdate(req.workspace._id, { $set: changes }, { new: true }).lean();

  logAudit({
    action: 'workspace.settings.update',
    workspace: req.workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(req.workspace._id),
    ipAddress: getClientIp(req),
    // Which defaults changed; the QR style can be a large image payload.
    diff: {
      changedFields: Object.keys(changes),
      ...(changes.defaultUtmParams !== undefined && { defaultUtmParams: changes.defaultUtmParams }),
      ...(changes.defaultDomain !== undefined && { defaultDomain: changes.defaultDomain }),
    },
  });

  res.status(200).json({ success: true, settings: workspaceSettingsPayload(updated) });
};

/**
 * GET /:workspaceId/activity ('activity:read'): the workspace's audit log,
 * newest first. Actor IPs are recorded but not returned.
 */
export const listActivity = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || ACTIVITY_DEFAULT_LIMIT, 1), ACTIVITY_MAX_LIMIT);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const filter = { workspace: req.workspace._id };

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actorUserId', 'name email')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    activity: entries.map((entry) => ({
      id: entry._id,
      action: entry.action,
      actor: entry.actorUserId
        ? { id: entry.actorUserId._id, name: entry.actorUserId.name, email: entry.actorUserId.email }
        : null,
      targetResourceId: entry.targetResourceId ?? null,
      diff: entry.diff ?? null,
      timestamp: entry.timestamp,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

/**
 * POST /:workspaceId/transfer-ownership ('ownership:transfer'). Makes an
 * existing member an owner and demotes the caller to admin (they stay a
 * member). One conditional update, so it can't half-apply or race with a
 * concurrent role change.
 */
export const transferOwnership = async (req, res) => {
  const { newOwnerUserId } = req.body ?? {};
  if (!mongoose.isValidObjectId(newOwnerUserId)) throw new ValidationError('newOwnerUserId is required');
  if (String(newOwnerUserId) === String(req.user._id)) throw new ValidationError('You already own this workspace');

  const target = req.workspace.members.find((m) => String(m.user) === String(newOwnerUserId));
  if (!target) throw new NotFoundError('The new owner must already be a member of this workspace');
  if (target.role === 'owner') throw new ConflictError('That member is already an owner');

  const newOwnerId = new mongoose.Types.ObjectId(String(newOwnerUserId));
  const result = await Workspace.updateOne(
    {
      _id: req.workspace._id,
      members: { $elemMatch: { user: req.user._id, role: 'owner' } },
      'members.user': newOwnerId,
    },
    { $set: { 'members.$[newOwner].role': 'owner', 'members.$[previousOwner].role': 'admin' } },
    { arrayFilters: [{ 'newOwner.user': newOwnerId }, { 'previousOwner.user': req.user._id }] }
  );
  if (result.modifiedCount === 0) {
    throw new ConflictError('Membership changed while transferring; reload and try again');
  }

  logAudit({
    action: 'workspace.ownership.transfer',
    workspace: req.workspace._id,
    actorUserId: req.user.id,
    targetResourceId: String(req.workspace._id),
    ipAddress: getClientIp(req),
    diff: { from: String(req.user._id), to: String(newOwnerId), previousOwnerRole: 'admin' },
  });

  const workspace = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  res.status(200).json({ success: true, workspace });
};

export default { updateSettings, listActivity, transferOwnership };
