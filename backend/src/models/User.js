import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    links: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Link',
      },
    ],
    customDomains: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomDomain',
      },
    ],
    activeWorkspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    },
    totalClicks: {
      type: Number,
      default: 0,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    // Custom hourly link-creation quota for enterprise plans; ignored otherwise.
    rateLimitOverride: {
      type: Number,
      default: null,
    },
    apiKey: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpire: Date,
    passwordResetToken: String,
    passwordResetExpire: Date,
    avatarColor: {
      type: String,
      default: 'accent', // 'accent' | 'indigo' | 'violet' | 'cyan' | 'rose'
    },
    defaultLinkCategory: {
      type: String,
      enum: ['marketing', 'sales', 'product', 'social', 'personal', 'other'],
      default: 'marketing',
    },
    defaultExpirationDays: {
      type: Number,
      default: 0, // 0 means no expiration
    },
    defaultUtm: {
      source: { type: String, default: '' },
      medium: { type: String, default: '' },
      campaign: { type: String, default: '' },
    },
    defaultAnalyticsRange: {
      type: String,
      enum: ['24h', '7d', '30d', 'all'],
      default: '7d',
    },
    anonymizeVisitorIps: {
      type: Boolean,
      default: false,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'dark',
      },
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      publicProfile: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate API Key
userSchema.methods.generateApiKey = function () {
  const apiKey = `lnk_${crypto.randomBytes(24).toString('hex')}`;
  this.apiKey = apiKey;
  return apiKey;
};

export default mongoose.model('User', userSchema);
