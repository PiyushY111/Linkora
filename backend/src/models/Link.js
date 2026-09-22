import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

const linkSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: [true, 'Please provide original URL'],
      trim: true,
    },
    shortCode: {
      type: String,
      required: true,
      lowercase: true,
    },
    shortUrl: {
      type: String,
      required: true,
      unique: true,
    },
    customAlias: {
      type: String,
      lowercase: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    tags: [String],
    category: {
      type: String,
      enum: ['business', 'personal', 'social', 'marketing', 'other'],
      default: 'other',
    },
    customDomain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomDomain',
      default: null,
    },
    qrCode: {
      type: String,
      default: null,
    },
    expiryDate: Date,
    password: String, // Optional password protection; bcrypt-hashed (see pre-save hook below)
    isActive: {
      type: Boolean,
      default: true,
    },
    abuseFlag: {
      type: Boolean,
      default: false,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    analytics: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analytics',
    },
    utm: {
      source: String,
      medium: String,
      campaign: String,
    },
    lastAccessedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Create short URL before saving
linkSchema.pre('save', async function (next) {
  // Always set shortUrl if shortCode exists and shortUrl is not set
  if (this.shortCode && !this.shortUrl) {
    const baseDomain = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.shortUrl = `${baseDomain}/${this.shortCode}`;
  }

  // Hash a newly-set or newly-migrated plaintext password. Already-hashed
  // values (bcrypt) pass through untouched so this is safe to run on every
  // save, including the plaintext-match migration path in analyticsController.
  if (this.isModified('password') && this.password && !BCRYPT_HASH_PATTERN.test(this.password)) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  next();
});

// Indexes
linkSchema.index({ shortCode: 1 }, { unique: true });
linkSchema.index({ customAlias: 1 }, { unique: true, sparse: true });
linkSchema.index({ user: 1, createdAt: -1 });
linkSchema.index({ user: 1, isActive: 1 });

export default mongoose.model('Link', linkSchema);
