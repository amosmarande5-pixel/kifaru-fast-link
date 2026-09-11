const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

router.post('/block/:uniqueId', verifyToken, async (req, res) => {
  try {
    const blockerId = req.user.uniqueId;
    const blockedId = req.params.uniqueId;
    if (blockerId === blockedId) return res.status(400).json({ error: "Can't block yourself." });

    const user = await User.findOne({ uniqueId: blockerId });
    if (!user.blockedUsers) user.blockedUsers = [];
    if (user.blockedUsers.includes(blockedId)) return res.status(400).json({ error: 'Already blocked.' });

    user.blockedUsers.push(blockedId);
    await user.save();
    res.json({ message: `Blocked ${blockedId}.` });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Failed to block.' });
  }
});

router.post('/unblock/:uniqueId', verifyToken, async (req, res) => {
  try {
    const blockerId = req.user.uniqueId;
    const blockedId = req.params.uniqueId;
    const user = await User.findOne({ uniqueId: blockerId });
    if (!user.blockedUsers) return res.status(400).json({ error: 'No blocked users.' });

    user.blockedUsers = user.blockedUsers.filter(id => id !== blockedId);
    await user.save();
    res.json({ message: `Unblocked ${blockedId}.` });
  } catch (err) {
    console.error('Unblock error:', err);
    res.status(500).json({ error: 'Failed to unblock.' });
  }
});

router.get('/list', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uniqueId: req.user.uniqueId }).select('blockedUsers');
    res.json({ blockedUsers: user.blockedUsers || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get blocked users.' });
  }
});

module.exports = router;
