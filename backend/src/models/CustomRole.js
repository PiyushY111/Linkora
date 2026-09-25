import mongoose from 'mongoose';
import { CUSTOM_ROLE_PERMISSIONS, isFixedRole } from '../utils/permissions.js';

/**
 * An organization-defined role: a named subset of the non-owner permissions
 * in utils/permissions.js. Assigned by storing its id as a workspace
 * member's (or pending invite's) `role`. Free and unlimited for every org.
 */
const customRoleSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
      validate: {
        validator: (name) => !isFixedRole(name.toLowerCase()),
        message: 'A custom role cannot use a built-in role name',
      },
    },
    // Lowercased copy of `name` for the per-org uniqueness index.
    nameKey: { type: String, required: true },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (permissions) => permissions.every((p) => CUSTOM_ROLE_PERMISSIONS.includes(p)),
        message: 'Unknown or owner-only permission in a custom role',
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

customRoleSchema.pre('validate', function setNameKey(next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});

customRoleSchema.index({ organization: 1, nameKey: 1 }, { unique: true });

export default mongoose.model('CustomRole', customRoleSchema);
