import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetResourceId: String,
    ipAddress: String,
    timestamp: { type: Date, default: Date.now },
    diff: mongoose.Schema.Types.Mixed,
  },
  { timestamps: false }
);

auditLogSchema.index({ actorUserId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
