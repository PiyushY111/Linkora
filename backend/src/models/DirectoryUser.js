import mongoose from 'mongoose';

/**
 * One user of an organization's identity-provider directory (WorkOS
 * Directory Sync), mapped to the Linkora account it provisioned or invited.
 * Keyed by the directory's own user id, so a later update or delete finds
 * the right account even if the email changed; `lastEventAt` lets older,
 * out-of-order webhook deliveries be ignored.
 */
const directoryUserSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    directoryId: { type: String, required: true },
    directoryUserId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // provisioned: account created and added by the directory
    // invited: an existing account was sent an invite it must accept
    // linked: the account was already a member
    // deprovisioned: removed from the org by the directory
    state: { type: String, enum: ['provisioned', 'invited', 'linked', 'deprovisioned'], required: true },
    lastEventAt: { type: Date, required: true },
  },
  { timestamps: true }
);

directoryUserSchema.index({ organization: 1, directoryUserId: 1 }, { unique: true });
directoryUserSchema.index({ organization: 1, email: 1 });

export default mongoose.model('DirectoryUser', directoryUserSchema);
