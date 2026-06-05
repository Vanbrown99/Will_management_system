/**
 * Will Model — Updated for email/JWT auth
 * ownerAddress replaced with userId + optional ethereumAddress
 */

const mongoose = require('mongoose');

const BeneficiarySchema = new mongoose.Schema({
  // Beneficiary identified by email or wallet (both optional individually)
  email: {
    type:  String,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    default: null,
  },
  walletAddress: {
    type:      String,
    lowercase: true,
    match:     [/^(0x[a-fA-F0-9]{40})?$/, 'Invalid Ethereum address'],
    default:   null,
  },
  allocationPercent: {
    type: Number, required: true, min: 0, max: 100,
  },
  label: { type: String, maxlength: 50, default: 'Beneficiary' },
});

const WillSchema = new mongoose.Schema(
  {
    willId:    { type: String, required: true, unique: true, index: true },

    // Link to authenticated user (replaces ownerAddress as primary key)
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },

    // Optional — user may or may not have a wallet
    ownerAddress: {
      type:      String,
      default:   null,
      lowercase: true,
    },

    title:       { type: String, maxlength: 120, default: 'My Will' },
    description: { type: String, maxlength: 500, default: '' },

    ipfsCid:         { type: String, default: null },
    contractAddress: { type: String, default: null, lowercase: true },
    transactionHash: { type: String, default: null },

    status: {
      type:    String,
      enum:    ['draft', 'active', 'executed', 'revoked'],
      default: 'draft',
      index:   true,
    },

    beneficiaries: [BeneficiarySchema],

    deadManSwitch: {
      inactivityDays: { type: Number, default: 30, min: 1, max: 3650 },
      lastPing:       { type: Date,   default: Date.now },
      triggerDate: {
        type: Date,
        default: () => { const d = new Date(); d.setDate(d.getDate() + 30); return d; },
      },
      isEnabled: { type: Boolean, default: true },
    },

    network: {
      type:    String,
      enum:    ['localhost', 'mumbai', 'polygon', 'goerli', 'mainnet'],
      default: 'localhost',
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => { delete ret.__v; delete ret._id; return ret; },
    },
  }
);

WillSchema.index({ userId: 1, status: 1 });
WillSchema.index({ 'deadManSwitch.triggerDate': 1, status: 1, isDeleted: 1 });

WillSchema.methods.updatePing = function () {
  const now = new Date();
  this.deadManSwitch.lastPing = now;
  const trigger = new Date(now);
  trigger.setDate(trigger.getDate() + this.deadManSwitch.inactivityDays);
  this.deadManSwitch.triggerDate = trigger;
  return this.save();
};

WillSchema.methods.shouldTrigger = function () {
  if (!this.deadManSwitch.isEnabled) return false;
  if (this.status !== 'active') return false;
  return new Date() >= this.deadManSwitch.triggerDate;
};

WillSchema.statics.findExpiredWills = function () {
  return this.find({
    status: 'active', isDeleted: false,
    'deadManSwitch.isEnabled': true,
    'deadManSwitch.triggerDate': { $lte: new Date() },
  });
};

module.exports = mongoose.model('Will', WillSchema);
