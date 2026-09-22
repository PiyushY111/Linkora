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
  },
  { timestamps: true }
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ owner: 1 });

export default mongoose.model('Organization', organizationSchema);
