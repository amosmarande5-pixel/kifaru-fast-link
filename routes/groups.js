const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// CREATE a group
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const creatorId = req.user.uniqueId;

    if (!name || !memberIds || memberIds.length === 0) {
      return res.status(400).json({ error: 'Group name and members are required.' });
    }

    // Check premium status for group size limits
    const creator = await User.findOne({ uniqueId: creatorId });
    const isPremium = creator?.isPremium || false;
    const maxMembers = isPremium ? 100 : 20;

    if (memberIds.length > maxMembers) {
      return res.status(400).json({ 
        error: isPremium 
          ? `Maximum ${maxMembers} members allowed.` 
          : `Free users can create groups with up to ${maxMembers} members. Upgrade to Premium for ${100} members.`
      });
    }

    // Check if group with same name already exists for this user
    const existing = await Group.findOne({ name, creatorId });
    if (existing) {
      return res.status(400).json({ error: 'A group with this name already exists.' });
    }

    const group = new Group({
      name,
      creatorId,
      members: [creatorId, ...memberIds]
    });
    await group.save();

    res.status(201).json({
      groupId: group.groupId,
      name: group.name,
      creatorId: group.creatorId,
      members: group.members
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating group.' });
  }
});

// GET my groups
router.get('/mine', verifyToken, async (req, res) => {
  try {
    const myId = req.user.uniqueId;
    const groups = await Group.find({ members: myId });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching groups.' });
  }
});

// GET group details
router.get('/:groupId', verifyToken, async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (!group.members.includes(req.user.uniqueId)) {
      return res.status(403).json({ error: 'Not a member of this group.' });
    }
    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching group.' });
  }
});

// RENAME group
router.patch('/:groupId/rename', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.creatorId !== req.user.uniqueId) {
      return res.status(403).json({ error: 'Only the creator can rename the group.' });
    }

    group.name = name;
    await group.save();

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error renaming group.' });
  }
});

// ADD member to group
router.patch('/:groupId/add', verifyToken, async (req, res) => {
  try {
    const { memberId } = req.body;
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.creatorId !== req.user.uniqueId) {
      return res.status(403).json({ error: 'Only the creator can add members.' });
    }

    // Check premium status for group size limits
    const creator = await User.findOne({ uniqueId: group.creatorId });
    const isPremium = creator?.isPremium || false;
    const maxMembers = isPremium ? 100 : 20;

    if (group.members.length >= maxMembers) {
      return res.status(400).json({ 
        error: isPremium 
          ? `Maximum ${maxMembers} members reached.` 
          : `Free groups are limited to ${maxMembers} members. Upgrade to Premium for ${100} members.`
      });
    }

    if (group.members.includes(memberId)) {
      return res.status(400).json({ error: 'Member already in group.' });
    }

    group.members.push(memberId);
    await group.save();

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding member.' });
  }
});

// REMOVE member from group
router.patch('/:groupId/remove', verifyToken, async (req, res) => {
  try {
    const { memberId } = req.body;
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.creatorId !== req.user.uniqueId) {
      return res.status(403).json({ error: 'Only the creator can remove members.' });
    }

    if (memberId === group.creatorId) {
      return res.status(400).json({ error: 'Cannot remove the creator.' });
    }

    group.members = group.members.filter(id => id !== memberId);
    await group.save();

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error removing member.' });
  }
});

module.exports = router;
