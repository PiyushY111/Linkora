import mongoose from 'mongoose';

const customDomainSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, 'Please provide a valid domain'],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    dnsRecords: [
      {
        type: String,
        name: String,
        value: String,
      },
    ],
    linksCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiryDate: Date,
    ssl: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

customDomainSchema.index({ user: 1 });

export default mongoose.model('CustomDomain', customDomainSchema);
