const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const verifyToken = require('../middleware/verifyToken');

router.post('/:messageId/react', verifyToken, async (req, res) => {
  try {
    const { emoji } = req.body;
    const messageId = req.params.messageId;
    const userId = req.user.uniqueId;

    if (!emoji) return res.status(400).json({ error: 'Emoji required.' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found.' });

    message.reactions = message.reactions.filter(r => r.userId !== userId);
    message.reactions.push({ emoji, userId });
    await message.save();

    const io = req.app.get('io');
    if (message.groupId) io.to(message.groupId).emit('reactionAdded', { messageId, emoji, userId });
    else io.to(message.receiverId).emit('reactionAdded', { messageId, emoji, userId });

    res.json({ message: 'Reaction added.', reactions: message.reactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to react.' });
  }
});

module.exports = router;
