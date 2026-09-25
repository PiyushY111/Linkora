import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Workspace the action happened in, for the workspace activity feed.
    // Unset for account-level actions (login, profile) and entries written
    // before workspaces were recorded here.
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
    targetResourceId: String,
    ipAddress: String,
    timestamp: { type: Date, default: Date.now },
    diff: mongoose.Schema.Types.Mixed,
  },
  { timestamps: false }
);

auditLogSchema.index({ actorUserId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ workspace: 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
