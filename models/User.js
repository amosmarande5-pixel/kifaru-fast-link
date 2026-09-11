const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  uniqueId: { type: String, required: true, unique: true },
  isPremium: { type: Boolean, default: false },
  premiumExpiry: { type: Date, default: null },
  profilePicture: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  blockedUsers: [{ type: String }],
  bio: { type: String, default: '', maxlength: 140 },
  starredMessages: [{ type: String }]
});

module.exports = mongoose.model('User', userSchema);
