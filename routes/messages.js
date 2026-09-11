const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Group = require('../models/Group');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});

// Different file size limits for free vs premium
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB (premium limit)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only image, audio, or video files are allowed.'));
  }
});

// Middleware to check file size limits based on premium status
async function checkFileLimit(req, res, next) {
  try {
    const user = await User.findOne({ uniqueId: req.user.uniqueId });
    const isPremium = user?.isPremium || false;
    
    // Free users: 5MB for images, 10MB for video/audio
    // Premium users: 10MB for images, 50MB for video/audio
    const maxImageSize = isPremium ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxVideoSize = isPremium ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    
    if (req.file) {
      const isImage = req.file.mimetype.startsWith('image/');
      const isVideo = req.file.mimetype.startsWith('video/');
      
      if (isImage && req.file.size > maxImageSize) {
        return res.status(400).json({ 
          error: isPremium 
            ? 'Image exceeds 10MB limit.' 
            : 'Free users can only send images up to 5MB. Upgrade to Premium for 10MB.'
        });
      }
      
      if (isVideo && req.file.size > maxVideoSize) {
        return res.status(400).json({ 
          error: isPremium 
            ? 'Video exceeds 50MB limit.' 
            : 'Free users can only send videos up to 10MB. Upgrade to Premium for 50MB.'
        });
      }
    }
    
    next();
  } catch (err) {
    console.error('File limit check error:', err);
    res.status(500).json({ error: 'Server error checking file limits.' });
  }
}

// SEND a 1-on-1 message
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { receiverId, text, imageUrl, audioUrl, videoUrl, replyTo } = req.body;
    const senderId = req.user.uniqueId;
    if (!receiverId || (!text && !imageUrl && !audioUrl && !videoUrl)) {
      return res.status(400).json({ error: 'receiverId and text, imageUrl, audioUrl, or videoUrl are required.' });
    }

    const User = require('../models/User');
    const receiver = await User.findOne({ uniqueId: receiverId }).select('blockedUsers');
    if (receiver?.blockedUsers?.includes(senderId)) {
      return res.status(403).json({ error: 'You are blocked by this user.' });
    }
    const sender = await User.findOne({ uniqueId: senderId }).select('blockedUsers');
    if (sender?.blockedUsers?.includes(receiverId)) {
      return res.status(403).json({ error: "You've blocked this user. Unblock them to send messages." });
    }

    const message = new Message({
      senderId, receiverId,
      text: text || '', imageUrl: imageUrl || '', audioUrl: audioUrl || '', videoUrl: videoUrl || '',
      replyTo: replyTo || undefined
    });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error sending message.' });
  }
});

// UPLOAD a file (image, audio, or video), returns its URL
router.post('/upload', verifyToken, upload.single('image'), checkFileLimit, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// SEND a message to a group
router.post('/group/send', verifyToken, async (req, res) => {
  try {
    const { groupId, text, imageUrl, audioUrl, videoUrl, replyTo } = req.body;
    const senderId = req.user.uniqueId;
    if (!groupId || (!text && !imageUrl && !audioUrl && !videoUrl)) {
      return res.status(400).json({ error: 'groupId and text, imageUrl, audioUrl, or videoUrl are required.' });
    }

    const message = new Message({
      senderId, groupId,
      text: text || '', imageUrl: imageUrl || '', audioUrl: audioUrl || '', videoUrl: videoUrl || '',
      readBy: [senderId],
      replyTo: replyTo || undefined
    });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error sending group message.' });
  }
});

// GET a group's message history
router.get('/group/:groupId', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ groupId: req.params.groupId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching group messages.' });
  }
});

// MARK a group's messages as read by me
router.patch('/group/:groupId/read', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    await Message.updateMany(
      { groupId: req.params.groupId, readBy: { $ne: myId } },
      { $addToSet: { readBy: myId } }
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error marking group read.' });
  }
});

// GROUP inbox summary: last message + unread count per group
router.get('/group-inbox/summary', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const groups = await Group.find({ members: myId });

    const summary = [];
    for (const group of groups) {
      const lastMsg = await Message.findOne({ groupId: group.groupId }).sort({ timestamp: -1 });
      const unreadCount = await Message.countDocuments({ groupId: group.groupId, readBy: { $ne: myId } });
      summary.push({
        groupId: group.groupId,
        name: group.name,
        lastMessage: lastMsg?.imageUrl ? '📷 Photo' : lastMsg?.audioUrl ? '🎤 Voice message' : lastMsg?.videoUrl ? '🎥 Video' : lastMsg?.text || '',
        lastTimestamp: lastMsg?.timestamp || group.createdAt,
        unreadCount
      });
    }

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching group inbox.' });
  }
});

// INBOX SUMMARY: last message + unread count per contact
router.get('/inbox/summary', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;

    const conversations = await Message.aggregate([
      { $match: { $or: [{ senderId: myId }, { receiverId: myId }] } },
      { $sort: { timestamp: -1 } },
      { $group: {
          _id: { $cond: [{ $eq: ['$senderId', myId] }, '$receiverId', '$senderId'] },
          lastMessage: { $first: '$text' },
          lastTimestamp: { $first: '$timestamp' }
      }}
    ]);

    const unread = await Message.aggregate([
      { $match: { receiverId: myId, read: false } },
      { $group: { _id: '$senderId', count: { $sum: 1 } } }
    ]);
    const unreadMap = {};
    unread.forEach(u => unreadMap[u._id] = u.count);

    const summary = conversations.map(c => ({
      otherId: c._id,
      lastMessage: c.lastMessage,
      lastTimestamp: c.lastTimestamp,
      unreadCount: unreadMap[c._id] || 0
    }));

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching inbox summary.' });
  }
});

// MARK a 1-on-1 conversation as read
router.patch('/read/:otherUserId', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const otherId = req.params.otherUserId;
    await Message.updateMany(
      { senderId: otherId, receiverId: myId, read: false },
      { $set: { read: true } }
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error marking messages read.' });
  }
});

// EDIT a message
router.patch('/:messageId', verifyToken, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.senderId !== req.user.uniqueId) return res.status(403).json({ error: 'Not your message.' });

    message.text = req.body.text;
    message.edited = true;
    await message.save();

    const io = req.app.get('io');
    if (message.groupId) {
      io.to(message.groupId).emit('messageEdited', { messageId: message._id, text: message.text });
    } else {
      io.to(message.receiverId).emit('messageEdited', { messageId: message._id, text: message.text });
    }

    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error editing message.' });
  }
});

// DELETE a message
router.delete('/:messageId', verifyToken, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.senderId !== req.user.uniqueId) return res.status(403).json({ error: 'Not your message.' });

    await message.deleteOne();

    const io = req.app.get('io');
    if (message.groupId) {
      io.to(message.groupId).emit('messageDeleted', { messageId: message._id });
    } else {
      io.to(message.receiverId).emit('messageDeleted', { messageId: message._id });
    }

    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting message.' });
  }
});

// STAR a message (toggle)
router.post('/:messageId/star', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const messageId = req.params.messageId;
    const user = await User.findOne({ uniqueId: myId });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const starred = user.starredMessages || [];
    const idx = starred.indexOf(messageId);
    let nowStarred;
    if (idx >= 0) {
      user.starredMessages = starred.filter(id => id !== messageId);
      nowStarred = false;
    } else {
      user.starredMessages.push(messageId);
      nowStarred = true;
    }
    await user.save();
    res.json({ starred: nowStarred });
  } catch (err) {
    console.error('Star error:', err);
    res.status(500).json({ error: 'Failed to toggle star.' });
  }
});

// GET all my starred messages
router.get('/starred/list', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const user = await User.findOne({ uniqueId: myId }).select('starredMessages');
    const ids = user?.starredMessages || [];
    if (ids.length === 0) return res.json([]);
    const messages = await Message.find({ _id: { $in: ids } }).sort({ timestamp: -1 });
    res.json(messages);
  } catch (err) {
    console.error('Starred list error:', err);
    res.status(500).json({ error: 'Failed to load starred messages.' });
  }
});

// GET chat history between the logged-in user and another user
router.get('/:otherUserId', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const otherId = req.params.otherUserId;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherId },
        { senderId: otherId, receiverId: myId }
      ]
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching messages.' });
  }
});

module.exports = router;

// ADD reaction to message
router.patch('/:messageId/react', verifyToken, async (req, res) => {
  try {
    const { emoji } = req.body;
    const myId = req.user.uniqueId;
    const message = await Message.findById(req.params.messageId);
    
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    
    // Remove existing reaction from this user if any
    message.reactions = message.reactions.filter(r => r.userId !== myId);
    
    // Add new reaction if emoji is provided
    if (emoji) {
      message.reactions.push({ emoji, userId: myId });
    }
    
    await message.save();
    
    const io = req.app.get('io');
    if (message.groupId) {
      io.to(message.groupId).emit('messageReacted', { 
        messageId: message._id, 
        reactions: message.reactions 
      });
    } else {
      io.to(message.receiverId).emit('messageReacted', { 
        messageId: message._id, 
        reactions: message.reactions 
      });
    }
    
    res.json({ reactions: message.reactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding reaction.' });
  }
});
