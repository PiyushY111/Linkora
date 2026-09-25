import mongoose from 'mongoose';

/**
 * RBAC roles:
 * - owner:   billing, SSO, workspace deletion
 * - admin:   domain config, user management, API keys
 * - creator: link generation, tags, analytics view
 * - viewer:  read-only analytics
 */
export const WORKSPACE_ROLES = ['owner', 'admin', 'creator', 'viewer'];

/**
 * An invitation to join, accepted via a link carrying a random token. Only
 * the token's SHA-256 hash is stored (like ApiKey.keyHash), so a leaked
 * database or API response can't be turned back into a working invite link.
 * Each entry keeps its _id so admins can revoke it without the raw token.
 */
const pendingInviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: WORKSPACE_ROLES, required: true },
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
        role: { type: String, enum: WORKSPACE_ROLES, required: true, default: 'viewer' },
        _id: false,
      },
    ],
    pendingInvites: { type: [pendingInviteSchema], default: [] },
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
