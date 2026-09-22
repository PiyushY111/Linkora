import mongoose from 'mongoose';

/**
 * RBAC roles (Phase 7.1):
 * - owner:   billing, SSO, workspace deletion
 * - admin:   domain config, user management, API keys
 * - creator: link generation, tags, analytics view
 * - viewer:  read-only analytics
 */
export const WORKSPACE_ROLES = ['owner', 'admin', 'creator', 'viewer'];

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
  },
  { timestamps: true }
);

workspaceSchema.index({ organization: 1, 'members.user': 1 });

export default mongoose.model('Workspace', workspaceSchema);
