const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// Log a call event
router.post('/log', verifyToken, async (req, res) => {
  try {
    const { receiverId, callType, status, duration } = req.body;
    const callerId = req.user.uniqueId;

    if (!receiverId || !callType || !status) {
      return res.status(400).json({ error: 'receiverId, callType, status required.' });
    }

    const caller = await User.findOne({ uniqueId: callerId }).select('fullName');
    const receiver = await User.findOne({ uniqueId: receiverId }).select('fullName');

    const log = new CallLog({
      callerId,
      callerName: caller?.fullName || callerId,
      receiverId,
      receiverName: receiver?.fullName || receiverId,
      callType,
      status,
      duration: Math.max(0, Math.floor(duration || 0))
    });
    await log.save();
    res.json(log);
  } catch (err) {
    console.error('Call log error:', err);
    res.status(500).json({ error: 'Failed to log call.' });
  }
});

// Get call history (both incoming and outgoing)
router.get('/history', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const logs = await CallLog.find({
      $or: [{ callerId: myId }, { receiverId: myId }]
    }).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    console.error('Call history error:', err);
    res.status(500).json({ error: 'Failed to load call history.' });
  }
});

// Clear call history
router.delete('/history', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    await CallLog.deleteMany({ $or: [{ callerId: myId }, { receiverId: myId }] });
    res.json({ message: 'Call history cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history.' });
  }
});

module.exports = router;
