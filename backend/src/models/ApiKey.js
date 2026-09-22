import mongoose from 'mongoose';

export const API_SCOPES = [
  'links:read',
  'links:write',
  'links:delete',
  'analytics:read',
  'webhooks:read',
  'webhooks:write',
];

const apiKeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'API Key name is required'],
      trim: true,
      maxlength: [100, 'API Key name cannot exceed 100 characters'],
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    prefix: {
      type: String,
      required: true,
    },
    maskedKey: {
      type: String,
      required: true,
    },
    lastFour: {
      type: String,
      required: true,
    },
    environment: {
      type: String,
      enum: ['live', 'test'],
      default: 'live',
    },
    scopes: {
      type: [String],
      default: ['*'],
    },
    rateLimit: {
      capacity: {
        type: Number,
        default: 30, // Default burst capacity
      },
      refillPerSecond: {
        type: Number,
        default: 10, // Refill rate per second
      },
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastUsedIp: {
      type: String,
      default: null,
    },
    totalRequests: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying user's active keys
apiKeySchema.index({ user: 1, status: 1, createdAt: -1 });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

export default ApiKey;
