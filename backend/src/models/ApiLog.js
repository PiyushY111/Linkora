import mongoose from 'mongoose';

const apiLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Workspace the request acted in; the developer portal's metrics and
    // logs are scoped by it. Unset on logs written before workspaces.
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
    },
    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey',
      default: null,
      index: true,
    },
    apiKeyPrefix: {
      type: String,
      default: null,
    },
    method: {
      type: String,
      required: true,
      uppercase: true,
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Expire logs automatically after 30 days
apiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Compound index for user query filtering and sorting
apiLogSchema.index({ user: 1, createdAt: -1 });
apiLogSchema.index({ user: 1, statusCode: 1, createdAt: -1 });
apiLogSchema.index({ workspace: 1, createdAt: -1 });
apiLogSchema.index({ workspace: 1, statusCode: 1, createdAt: -1 });

const ApiLog = mongoose.model('ApiLog', apiLogSchema);

export default ApiLog;
