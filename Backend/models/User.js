/**
 * User Model
 * Stores credentials and profile — passwords are bcrypt hashed
 * Plain-text passwords are NEVER stored
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Name is required'],
      trim:      true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },

    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    // bcrypt hash — raw password never persisted
    password: {
      type:     String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select:   false, // Never returned in queries by default
    },

    // Optional Ethereum address (no longer required for auth)
    ethereumAddress: {
      type:      String,
      default:   null,
      lowercase: true,
      match:     [/^(0x[a-fA-F0-9]{40})?$/, 'Invalid Ethereum address'],
    },

    isVerified: { type: Boolean, default: false },
    lastLogin:  { type: Date,    default: null  },

    // Refresh token hash stored for rotation
    refreshTokenHash: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

// ── Hash password before saving ───────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12); // 12 rounds — secure & fast enough
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare password ────────────────────────────────────────
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Sanitize output — never leak password hash ────────────────────────────────
UserSchema.methods.toSafeObject = function () {
  return {
    id:              this._id,
    name:            this.name,
    email:           this.email,
    ethereumAddress: this.ethereumAddress,
    isVerified:      this.isVerified,
    lastLogin:       this.lastLogin,
    createdAt:       this.createdAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
