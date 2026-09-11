const express = require('express');
const router = express.Router();
const Status = require('../models/Status');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, 'status-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

// POST a status (text or image)
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { type, content } = req.body;
    const userId = req.user.userId;
    const uniqueId = req.user.uniqueId;

    if (!type || !content) {
      return res.status(400).json({ error: 'Type and content are required.' });
    }

    await Status.deleteMany({ uniqueId });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const status = new Status({
      userId,
      uniqueId,
      type,
      content,
      expiresAt
    });
    await status.save();

    res.status(201).json({
      message: 'Status posted!',
      status: { _id: status._id, type: status.type, content: status.content, createdAt: status.createdAt, expiresAt: status.expiresAt }
    });
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: 'Failed to post status.' });
  }
});

// POST image status
router.post('/upload', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const userId = req.user.userId;
    const uniqueId = req.user.uniqueId;

    await Status.deleteMany({ uniqueId });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const status = new Status({
      userId,
      uniqueId,
      type: 'image',
      content: `/uploads/${req.file.filename}`,
      expiresAt
    });
    await status.save();

    res.status(201).json({
      message: 'Status posted!',
      status: { _id: status._id, type: status.type, content: status.content }
    });
  } catch (err) {
    console.error('Status upload error:', err);
    res.status(500).json({ error: 'Failed to upload status.' });
  }
});

// GET all active statuses
router.get('/feed', verifyToken, async (req, res) => {
  try {
    const contacts = JSON.parse(req.query.contacts || '[]');
    const contactIds = contacts.map(c => c.id);

    const statuses = await Status.find({
      uniqueId: { $in: contactIds },
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    const result = [];
    for (const status of statuses) {
      const user = await User.findOne({ uniqueId: status.uniqueId }).select('fullName profilePicture');
      result.push({
        _id: status._id,
        type: status.type,
        content: status.content,
        createdAt: status.createdAt,
        expiresAt: status.expiresAt,
        user: { uniqueId: status.uniqueId, fullName: user?.fullName || 'Unknown', profilePicture: user?.profilePicture || '' }
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Status feed error:', err);
    res.status(500).json({ error: 'Failed to fetch statuses.' });
  }
});

// GET my status
router.get('/my', verifyToken, async (req, res) => {
  try {
    const uniqueId = req.user.uniqueId;
    const status = await Status.findOne({ uniqueId, expiresAt: { $gt: new Date() } });
    if (!status) return res.json(null);
    res.json({ _id: status._id, type: status.type, content: status.content, createdAt: status.createdAt, expiresAt: status.expiresAt });
  } catch (err) {
    console.error('My status error:', err);
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

// DELETE my status
router.delete('/my', verifyToken, async (req, res) => {
  try {
    const uniqueId = req.user.uniqueId;
    await Status.deleteMany({ uniqueId });
    res.json({ message: 'Status deleted.' });
  } catch (err) {
    console.error('Status delete error:', err);
    res.status(500).json({ error: 'Failed to delete status.' });
  }
});

// Mark a status as viewed by me
router.post('/:statusId/view', verifyToken, async (req, res) => {
  try {
    const viewerId = req.user.uniqueId;
    const status = await Status.findById(req.params.statusId);
    if (!status) return res.status(404).json({ error: 'Status not found.' });

    if (status.uniqueId !== viewerId && !status.viewedBy.includes(viewerId)) {
      status.viewedBy.push(viewerId);
      await status.save();
    }
    res.json({ message: 'Marked as viewed.' });
  } catch (err) {
    console.error('View tracking error:', err);
    res.status(500).json({ error: 'Failed to mark as viewed.' });
  }
});

// Get viewers of my status (only the owner can see this)
router.get('/:statusId/viewers', verifyToken, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if (!status) return res.status(404).json({ error: 'Status not found.' });
    if (status.uniqueId !== req.user.uniqueId) return res.status(403).json({ error: 'Not your status.' });

    const viewers = [];
    for (const id of status.viewedBy) {
      const user = await User.findOne({ uniqueId: id }).select('fullName uniqueId');
      viewers.push({ uniqueId: id, fullName: user?.fullName || id });
    }
    res.json(viewers);
  } catch (err) {
    console.error('Viewers fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch viewers.' });
  }
});

module.exports = router;
