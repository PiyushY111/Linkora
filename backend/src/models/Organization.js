import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sso: {
      provider: { type: String, enum: ['none', 'workos'], default: 'none' },
      workosOrganizationId: String,
    },
    // The WorkOS connection this org signs in through. Each connection can
    // belong to one org only (unique index below): signing in through it is
    // what lets an existing account in via SSO (see ssoService).
    ssoConnectionId: { type: String, trim: true },
    // When true, members may not sign in with a password, only via
    // ssoConnectionId. Free for every org; see ssoController.
    ssoEnforced: { type: Boolean, default: false },
    // IPs / CIDR ranges allowed to act in this org's workspaces (members'
    // sessions and API keys). Empty = no restriction. Canonicalized by
    // utils/ipAllowlist.js; managed by owners (ipAllowlistController).
    ipAllowlist: { type: [String], default: [] },
    // How long this org's workspace audit entries are kept, in days; null
    // keeps them forever. Owners set it (auditController), no plan cap; the
    // nightly cleanup (services/auditRetentionService.js) applies it.
    auditRetentionDays: { type: Number, default: 365, min: 30 },
    // Automatic provisioning from the org's identity provider via WorkOS
    // Directory Sync (SCIM). Managed by owners (directorySyncController);
    // applied by services/directorySyncService.js.
    directorySync: {
      enabled: { type: Boolean, default: false },
      directoryId: { type: String, trim: true }, // WorkOS directory_...; one org per directory
      defaultRole: { type: String, default: 'creator' }, // built-in role or custom role id
      workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }, // where users are added; default: oldest
      lastEventAt: { type: Date },
    },
  },
  { timestamps: true }
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ owner: 1 });
organizationSchema.index(
  { 'directorySync.directoryId': 1 },
  { unique: true, partialFilterExpression: { 'directorySync.directoryId': { $type: 'string' } } }
);
organizationSchema.index(
  { ssoConnectionId: 1 },
  { unique: true, partialFilterExpression: { ssoConnectionId: { $type: 'string' } } }
);

export default mongoose.model('Organization', organizationSchema);
