const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const uniqueId = 'KFL-' + uuidv4().split('-')[0].toUpperCase();

    const newUser = new User({ fullName, email, password: hashedPassword, uniqueId });
    await newUser.save();

    res.status(201).json({
      message: 'Registration successful! Save your unique ID — it will not be shown again.',
      uniqueId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { uniqueId, password } = req.body;
    if (!uniqueId || !password) {
      return res.status(400).json({ error: 'Unique ID and password are required.' });
    }

    const user = await User.findOne({ uniqueId });
    if (!user) return res.status(400).json({ error: 'Invalid unique ID or password.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid unique ID or password.' });

    const token = jwt.sign(
      { userId: user._id, uniqueId: user.uniqueId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        fullName: user.fullName,
        uniqueId: user.uniqueId,
        isPremium: user.isPremium,
        profilePicture: user.profilePicture
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET my profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uniqueId: req.user.uniqueId }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching profile.' });
  }
});

// UPDATE profile (name and/or picture)
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName, profilePicture, bio } = req.body;
    const update = {};
    if (fullName !== undefined) update.fullName = fullName;
    if (profilePicture !== undefined) update.profilePicture = profilePicture;
    if (bio !== undefined) update.bio = bio.slice(0, 140);

    const user = await User.findOneAndUpdate(
      { uniqueId: req.user.uniqueId },
      update,
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});

// CHANGE password
router.patch('/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }

    const user = await User.findOne({ uniqueId: req.user.uniqueId });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

// GET last-seen for another user
router.get('/status/:uniqueId', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uniqueId: req.params.uniqueId }).select('lastSeen');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ lastSeen: user.lastSeen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching status.' });
  }
});

module.exports = router;

// UPLOAD profile picture
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, 'profile-' + req.user.uniqueId + '-' + Date.now() + path.extname(file.originalname))
});

const uploadProfile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  }
});

router.post('/upload-profile-pic', verifyToken, uploadProfile.single('profilePic'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    
    await User.findOneAndUpdate(
      { uniqueId: req.user.uniqueId },
      { profilePicture: imageUrl }
    );

    res.json({ message: 'Profile picture updated.', profilePicture: imageUrl });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload profile picture.' });
  }
});

// GET user profile by unique ID (for showing in chat/contacts)
router.get('/profile/:uniqueId', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uniqueId: req.params.uniqueId })
      .select('fullName uniqueId profilePicture isPremium');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      fullName: user.fullName,
      uniqueId: user.uniqueId,
      profilePicture: user.profilePicture,
      isPremium: user.isPremium
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Server error fetching profile.' });
  }
});

// BLOCK a user
router.patch('/block/:uniqueId', verifyToken, async (req, res) => {
  try {
    const blockedId = req.params.uniqueId;
    const myId = req.user.uniqueId;

    if (blockedId === myId) {
      return res.status(400).json({ error: "You can't block yourself." });
    }

    const user = await User.findOne({ uniqueId: myId });
    
    if (!user.blockedUsers.includes(blockedId)) {
      user.blockedUsers.push(blockedId);
      await user.save();
    }

    res.json({ message: 'User blocked.', blockedUsers: user.blockedUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error blocking user.' });
  }
});

// UNBLOCK a user
router.patch('/unblock/:uniqueId', verifyToken, async (req, res) => {
  try {
    const blockedId = req.params.uniqueId;
    const myId = req.user.uniqueId;

    const user = await User.findOne({ uniqueId: myId });
    user.blockedUsers = user.blockedUsers.filter(id => id !== blockedId);
    await user.save();

    res.json({ message: 'User unblocked.', blockedUsers: user.blockedUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error unblocking user.' });
  }
});

// GET blocked users list
router.get('/blocked', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uniqueId: req.user.uniqueId }).select('blockedUsers');
    res.json({ blockedUsers: user.blockedUsers || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching blocked users.' });
  }
});
