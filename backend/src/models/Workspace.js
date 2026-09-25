import mongoose from 'mongoose';

/**
 * RBAC roles:
 * - owner:   billing, SSO, workspace deletion
 * - admin:   domain config, user management, API keys
 * - creator: link generation, tags, analytics view
 * - viewer:  read-only analytics
 */
export const WORKSPACE_ROLES = ['owner', 'admin', 'creator', 'viewer'];

// A member's (or invite's) role: one of WORKSPACE_ROLES, or the id of one of
// the organization's custom roles (models/CustomRole.js). That the id
// belongs to this workspace's org is checked where roles are assigned.
const roleField = {
  type: String,
  required: true,
  validate: {
    validator: (role) => WORKSPACE_ROLES.includes(role) || /^[0-9a-f]{24}$/.test(role),
    message: 'role must be a built-in role or a custom role id',
  },
};

/**
 * An invitation to join, accepted via a link carrying a random token. Only
 * the token's SHA-256 hash is stored (like ApiKey.keyHash), so a leaked
 * database or API response can't be turned back into a working invite link.
 * Each entry keeps its _id so admins can revoke it without the raw token.
 */
const pendingInviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    role: roleField,
    tokenHash: { type: String, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  }
);

const workspaceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { ...roleField, default: 'viewer' },
        // 'scim' when the organization's directory added this membership:
        // it's managed by the identity provider, so it can't be removed (or
        // re-invited) by hand. See services/directorySyncService.js.
        managedBy: { type: String, enum: ['scim'] },
        _id: false,
      },
    ],
    pendingInvites: { type: [pendingInviteSchema], default: [] },

    // Defaults the link-creation UI pre-fills; each can be overridden per
    // link and none is enforced server-side. Validated in
    // workspaceController.updateSettings.
    defaultDomain: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomDomain', default: null },
    // Same shape as the QR studio's config (DEFAULT_QR_CONFIG in
    // frontend/src/utils/qrPresets.js), like Link.qrConfig.
    defaultQrStyle: { type: mongoose.Schema.Types.Mixed, default: null },
    defaultUtmParams: {
      type: new mongoose.Schema(
        { source: String, medium: String, campaign: String, term: String, content: String },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Never serialize invite token hashes into an API response.
      transform: (doc, ret) => {
        if (Array.isArray(ret.pendingInvites)) {
          ret.pendingInvites = ret.pendingInvites.map(({ tokenHash: _tokenHash, ...invite }) => invite);
        }
        return ret;
      },
    },
  }
);

workspaceSchema.index({ organization: 1, 'members.user': 1 });
// Unique across every workspace. Partial so the many workspaces with no
// invites don't all collide on a missing value.
workspaceSchema.index(
  { 'pendingInvites.tokenHash': 1 },
  { unique: true, partialFilterExpression: { 'pendingInvites.tokenHash': { $exists: true } } }
);

export default mongoose.model('Workspace', workspaceSchema);
