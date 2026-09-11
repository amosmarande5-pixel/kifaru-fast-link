const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  callerId: { type: String, required: true, index: true },
  callerName: { type: String, required: true },
  receiverId: { type: String, required: true, index: true },
  receiverName: { type: String, default: '' },
  callType: { type: String, enum: ['voice', 'video'], required: true },
  status: { type: String, enum: ['answered', 'missed', 'rejected', 'failed', 'cancelled'], required: true },
  duration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('CallLog', callLogSchema);
