const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// Search users by unique ID
router.get('/user/:uniqueId', verifyToken, async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const myId = req.user.uniqueId;

    if (!uniqueId) {
      return res.status(400).json({ error: 'Unique ID is required.' });
    }

    if (uniqueId === myId) {
      return res.status(400).json({ error: "You can't search for yourself." });
    }

    const user = await User.findOne({ uniqueId }).select('fullName uniqueId lastSeen isPremium profilePicture');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isOnline = false;

    res.json({
      fullName: user.fullName,
      uniqueId: user.uniqueId,
      lastSeen: user.lastSeen,
      isPremium: user.isPremium,
      profilePicture: user.profilePicture,
      isOnline
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error searching user.' });
  }
});

module.exports = router;
