const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true
  },
  receiverId: {
    type: String,
    required: false
  },
  groupId: {
    type: String,
    required: false
  },
  readBy: [{
    type: String
  }],

 text: {
    type: String,
    required: false,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
read: {
    type: Boolean,
    default: false
  },
edited: {
    type: Boolean,
    default: false
  },
imageUrl: {
    type: String,
    default: ''
  },
audioUrl: {
    type: String,
    default: ''
  },
videoUrl: {
    type: String,
    default: ''
  },
reactions: [{
    emoji: { type: String, required: true },
    userId: { type: String, required: true }
  }],
  replyTo: {
    messageId: { type: String, default: null },
    text: { type: String, default: '' },
    senderId: { type: String, default: '' },
    senderName: { type: String, default: '' }
  }
});

module.exports = mongoose.model('Message', messageSchema);
