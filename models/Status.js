const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  uniqueId: { type: String, required: true, index: true },
  type: { type: String, enum: ['text', 'image'], required: true },
  content: { type: String, required: true }, // text content or image URL
  createdAt: { type: Date, default: Date.now, index: true },
expiresAt: { type: Date, required: true }, // 24 hours from creation
  viewedBy: [{ type: String }]
});

// Auto-delete expired statuses
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Status', statusSchema);
