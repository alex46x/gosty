import express from 'express';
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';
import { getIO, getSocketId } from '../socketManager.js';

const router = express.Router();

const roomForGroup = (groupId) => `group:${groupId.toString()}`;
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const emitToUser = (io, userId, event, payload) => {
  const socketId = getSocketId(userId.toString());
  if (socketId) io.to(socketId).emit(event, payload);
};

const joinUserToRoom = (io, userId, groupId) => {
  const socketId = getSocketId(userId.toString());
  if (!socketId) return;
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.join(roomForGroup(groupId));
};

const removeUserFromRoom = (io, userId, groupId) => {
  const socketId = getSocketId(userId.toString());
  if (!socketId) return;
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.leave(roomForGroup(groupId));
};

const getActiveMembership = async (groupId, userId) => {
  return GroupMember.findOne({ groupId, userId, status: 'active' });
};

const assertMember = async (groupId, userId) => {
  const membership = await getActiveMembership(groupId, userId);
  if (!membership) {
    const err = new Error('Only active members can perform this action');
    err.statusCode = 403;
    throw err;
  }
  return membership;
};

const assertAdmin = async (groupId, userId) => {
  const membership = await assertMember(groupId, userId);
  if (membership.role !== 'admin') {
    const err = new Error('Only admins can perform this action');
    err.statusCode = 403;
    throw err;
  }
  return membership;
};

const touchGroupLastMessage = async (groupId, preview, createdAt = new Date()) => {
  await Group.findByIdAndUpdate(groupId, {
    $set: { lastMessageAt: createdAt, lastMessagePreview: preview || '' }
  });
};

const updateGroupCounters = async (groupId) => {
  const [memberCount, adminCount] = await Promise.all([
    GroupMember.countDocuments({ groupId, status: 'active' }),
    GroupMember.countDocuments({ groupId, status: 'active', role: 'admin' })
  ]);
  await Group.findByIdAndUpdate(groupId, { memberCount, adminCount });
};

const createSystemMessage = async ({ groupId, actorId, action, content, meta = null }) => {
  const msg = await Message.create({
    conversationType: 'group',
    messageType: 'system',
    groupId,
    senderId: actorId,
    content,
    systemAction: action,
    systemMeta: meta
  });
  await touchGroupLastMessage(groupId, content, msg.createdAt);
  return msg;
};

const toConversationSummary = async (group, userId) => {
  const membership = await GroupMember.findOne({ groupId: group._id, userId, status: 'active' })
    .select('role lastReadAt');
  const unreadCount = await Message.countDocuments({
    conversationType: 'group',
    groupId: group._id,
    senderId: { $ne: userId },
    deletedFor: { $ne: userId },
    createdAt: membership?.lastReadAt ? { $gt: membership.lastReadAt } : { $gte: group.createdAt }
  });

  return {
    conversationType: 'group',
    conversationId: group._id,
    groupId: group._id,
    isGroup: true,
    userId: group._id,
    username: group.name,
    name: group.name,
    avatarUrl: group.avatarUrl,
    unreadCount,
    memberCount: group.memberCount,
    isAdmin: membership?.role === 'admin',
    lastMessageAt: group.lastMessageAt
  };
};

// Create group
router.post('/', protect, async (req, res) => {
  try {
    const { name, avatarUrl, memberIds = [], memberUsernames = [] } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Group name is required' });

    const idsFromBody = (Array.isArray(memberIds) ? memberIds : [])
      .filter(isValidObjectId)
      .map(String);
    const usersFromNames = Array.isArray(memberUsernames) && memberUsernames.length
      ? await User.find({ username: { $in: memberUsernames } }).select('_id')
      : [];
    const idsFromNames = usersFromNames.map(u => u._id.toString());

    const allMemberIds = Array.from(new Set([
      req.user._id.toString(),
      ...idsFromBody,
      ...idsFromNames
    ]));

    const group = await Group.create({
      name: name.trim(),
      avatarUrl: avatarUrl || null,
      creatorId: req.user._id,
      memberCount: allMemberIds.length,
      adminCount: 1
    });

    await GroupMember.insertMany(allMemberIds.map(uid => ({
      groupId: group._id,
      userId: uid,
      role: uid === req.user._id.toString() ? 'admin' : 'member',
      status: 'active',
      addedBy: req.user._id,
      joinedAt: new Date(),
      lastReadAt: new Date()
    })));

    const systemMsg = await createSystemMessage({
      groupId: group._id,
      actorId: req.user._id,
      action: 'user_added',
      content: `${req.user.username} created the group`,
      meta: { createdBy: req.user._id.toString() }
    });

    const io = getIO();
    if (io) {
      for (const uid of allMemberIds) {
        joinUserToRoom(io, uid, group._id);
        const summary = await toConversationSummary(group, uid);
        emitToUser(io, uid, 'group:create', { group: summary });
      }
      io.to(roomForGroup(group._id)).emit('group:system', systemMsg);
    }

    res.status(201).json(await toConversationSummary(group, req.user._id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// List groups as conversation summaries
router.get('/conversations', protect, async (req, res) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user._id, status: 'active' }).select('groupId');
    const groups = await Group.find({ _id: { $in: memberships.map(m => m.groupId) } });
    const summaries = [];
    for (const group of groups) summaries.push(await toConversationSummary(group, req.user._id));
    summaries.sort((a, b) => (new Date(b.lastMessageAt || 0)).getTime() - (new Date(a.lastMessageAt || 0)).getTime());
    res.json(summaries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Group details
router.get('/:groupId', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    await assertMember(groupId, req.user._id);

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const members = await GroupMember.find({ groupId, status: 'active' })
      .populate('userId', 'username')
      .select('userId role joinedAt status');
    res.json({ ...(await toConversationSummary(group, req.user._id)), members });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Send group message
router.post('/:groupId/messages', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, replyTo } = req.body;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    if (!content || !content.trim()) return res.status(400).json({ message: 'Message content is required' });
    await assertMember(groupId, req.user._id);

    const msg = await Message.create({
      conversationType: 'group',
      messageType: 'user',
      groupId,
      senderId: req.user._id,
      content: content.trim(),
      replyTo: replyTo || null
    });
    await touchGroupLastMessage(groupId, msg.content, msg.createdAt);

    const full = await Message.findById(msg._id).populate('senderId', 'username');
    const io = getIO();
    if (io) io.to(roomForGroup(groupId)).emit('group:message', full);
    res.status(201).json(full);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Get group messages
router.get('/:groupId/messages', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    await assertMember(groupId, req.user._id);

    const messages = await Message.find({
      conversationType: 'group',
      groupId,
      deletedFor: { $ne: req.user._id }
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'username')
      .populate('replyTo', 'senderId content messageType');
    res.json(messages);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Mark group read
router.put('/:groupId/read', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    const membership = await assertMember(groupId, req.user._id);
    membership.lastReadAt = new Date();
    await membership.save();
    res.json({ message: 'Group marked as read' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Rename group (admin only)
router.put('/:groupId/rename', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    if (!name || !name.trim()) return res.status(400).json({ message: 'Group name is required' });

    await assertAdmin(groupId, req.user._id);
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const oldName = group.name;
    group.name = name.trim();
    await group.save();

    const systemMsg = await createSystemMessage({
      groupId,
      actorId: req.user._id,
      action: 'group_renamed',
      content: `${req.user.username} renamed the group`,
      meta: { oldName, newName: group.name }
    });

    const io = getIO();
    if (io) {
      io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
    }

    res.json(await toConversationSummary(group, req.user._id));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Add members (admin only)
router.put('/:groupId/members/add', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds = [], usernames = [] } = req.body;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    await assertAdmin(groupId, req.user._id);

    const idsFromBody = (Array.isArray(userIds) ? userIds : [])
      .filter(isValidObjectId)
      .map(String);
    const usersFromNames = Array.isArray(usernames) && usernames.length
      ? await User.find({ username: { $in: usernames } }).select('_id username')
      : [];
    const idsFromNames = usersFromNames.map(u => u._id.toString());
    const allIds = Array.from(new Set([...idsFromBody, ...idsFromNames]))
      .filter(uid => uid !== req.user._id.toString());

    if (!allIds.length) return res.status(400).json({ message: 'No valid members to add' });

    const io = getIO();
    const added = [];
    for (const uid of allIds) {
      const existing = await GroupMember.findOne({ groupId, userId: uid });
      if (existing && existing.status === 'active') continue;

      if (!existing) {
        await GroupMember.create({
          groupId,
          userId: uid,
          role: 'member',
          status: 'active',
          addedBy: req.user._id,
          joinedAt: new Date(),
          lastReadAt: new Date()
        });
      } else {
        existing.status = 'active';
        existing.role = 'member';
        existing.addedBy = req.user._id;
        existing.joinedAt = new Date();
        existing.leftAt = null;
        existing.removedAt = null;
        existing.removedBy = null;
        existing.lastReadAt = new Date();
        await existing.save();
      }

      added.push(uid);
      const targetUser = await User.findById(uid).select('username');
      const systemMsg = await createSystemMessage({
        groupId,
        actorId: req.user._id,
        action: 'user_added',
        content: `${req.user.username} added ${targetUser?.username || 'a user'}`,
        meta: { userId: uid }
      });

      if (io) {
        joinUserToRoom(io, uid, groupId);
        io.to(roomForGroup(groupId)).emit('group:addMember', {
          groupId,
          userId: uid,
          addedBy: req.user._id.toString()
        });
        io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
      }
    }

    await updateGroupCounters(groupId);
    const group = await Group.findById(groupId);
    if (io && group) {
      for (const uid of added) {
        emitToUser(io, uid, 'group:create', { group: await toConversationSummary(group, uid) });
      }
    }

    res.json({ addedUserIds: added });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Remove member (admin only)
router.put('/:groupId/members/remove', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    if (!isValidObjectId(groupId) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid IDs' });
    }
    await assertAdmin(groupId, req.user._id);
    if (userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use leave endpoint for your own account' });
    }

    const target = await GroupMember.findOne({ groupId, userId, status: 'active' });
    if (!target) return res.status(404).json({ message: 'Active member not found' });

    target.status = 'removed';
    target.role = 'member';
    target.removedAt = new Date();
    target.removedBy = req.user._id;
    await target.save();
    await updateGroupCounters(groupId);

    const targetUser = await User.findById(userId).select('username');
    const systemMsg = await createSystemMessage({
      groupId,
      actorId: req.user._id,
      action: 'user_removed',
      content: `${req.user.username} removed ${targetUser?.username || 'a user'}`,
      meta: { userId: userId.toString() }
    });

    const io = getIO();
    if (io) {
      io.to(roomForGroup(groupId)).emit('group:removeMember', {
        groupId,
        userId: userId.toString(),
        removedBy: req.user._id.toString()
      });
      io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
      removeUserFromRoom(io, userId, groupId);
      emitToUser(io, userId, 'group:removed', { groupId, removedBy: req.user._id.toString() });
    }

    res.json({ message: 'Member removed' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Promote member to admin
router.put('/:groupId/admins/promote', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    if (!isValidObjectId(groupId) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid IDs' });
    }
    await assertAdmin(groupId, req.user._id);

    const target = await GroupMember.findOne({ groupId, userId, status: 'active' });
    if (!target) return res.status(404).json({ message: 'Active member not found' });
    if (target.role === 'admin') return res.status(400).json({ message: 'User is already admin' });

    target.role = 'admin';
    await target.save();
    await updateGroupCounters(groupId);

    const targetUser = await User.findById(userId).select('username');
    const systemMsg = await createSystemMessage({
      groupId,
      actorId: req.user._id,
      action: 'admin_promoted',
      content: `${req.user.username} promoted ${targetUser?.username || 'a user'} to admin`,
      meta: { userId: userId.toString() }
    });

    const io = getIO();
    if (io) io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
    res.json({ message: 'User promoted to admin' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Demote admin to member
router.put('/:groupId/admins/demote', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    if (!isValidObjectId(groupId) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid IDs' });
    }
    await assertAdmin(groupId, req.user._id);

    const target = await GroupMember.findOne({ groupId, userId, status: 'active' });
    if (!target) return res.status(404).json({ message: 'Active member not found' });
    if (target.role !== 'admin') return res.status(400).json({ message: 'User is not an admin' });

    const activeAdminCount = await GroupMember.countDocuments({ groupId, status: 'active', role: 'admin' });
    if (activeAdminCount <= 1) return res.status(400).json({ message: 'Group must have at least one admin' });

    target.role = 'member';
    await target.save();
    await updateGroupCounters(groupId);

    const targetUser = await User.findById(userId).select('username');
    const systemMsg = await createSystemMessage({
      groupId,
      actorId: req.user._id,
      action: 'admin_demoted',
      content: `${req.user.username} demoted ${targetUser?.username || 'a user'} from admin`,
      meta: { userId: userId.toString() }
    });

    const io = getIO();
    if (io) io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
    res.json({ message: 'Admin demoted to member' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Leave group
router.put('/:groupId/leave', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) return res.status(400).json({ message: 'Invalid group ID' });
    const membership = await assertMember(groupId, req.user._id);

    if (membership.role === 'admin') {
      const adminCount = await GroupMember.countDocuments({ groupId, status: 'active', role: 'admin' });
      const memberCount = await GroupMember.countDocuments({ groupId, status: 'active' });
      if (adminCount <= 1 && memberCount > 1) {
        return res.status(400).json({ message: 'Transfer admin role before leaving the group' });
      }
    }

    membership.status = 'left';
    membership.leftAt = new Date();
    await membership.save();
    await updateGroupCounters(groupId);

    const systemMsg = await createSystemMessage({
      groupId,
      actorId: req.user._id,
      action: 'user_left',
      content: `${req.user.username} left the group`,
      meta: { userId: req.user._id.toString() }
    });

    const io = getIO();
    if (io) {
      io.to(roomForGroup(groupId)).emit('group:leave', { groupId, userId: req.user._id.toString() });
      io.to(roomForGroup(groupId)).emit('group:system', systemMsg);
      removeUserFromRoom(io, req.user._id, groupId);
    }

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Edit own group message
router.put('/messages/:id/edit', protect, async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.conversationType !== 'group') return res.status(400).json({ message: 'Not a group message' });
    if (message.messageType === 'system') return res.status(400).json({ message: 'System messages cannot be edited' });
    if (message.senderId.toString() !== req.user._id.toString()) return res.status(401).json({ message: 'Not authorized' });
    if (!content || !content.trim()) return res.status(400).json({ message: 'Message content is required' });

    await assertMember(message.groupId, req.user._id);

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();
    await touchGroupLastMessage(message.groupId, message.content, new Date());

    const io = getIO();
    if (io) {
      io.to(roomForGroup(message.groupId)).emit('group:message:update', {
        messageId: message._id.toString(),
        groupId: message.groupId.toString(),
        content: message.content,
        isEdited: true,
        editedAt: message.editedAt
      });
    }

    res.json(message);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Delete group message for current user only
router.put('/messages/:id/delete', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.conversationType !== 'group') return res.status(400).json({ message: 'Not a group message' });

    await assertMember(message.groupId, req.user._id);

    await Message.updateOne(
      { _id: message._id },
      { $addToSet: { deletedFor: req.user._id } }
    );

    res.json({ message: 'Message deleted for you' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Unsend own group message for everyone
router.put('/messages/:id/unsend', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.conversationType !== 'group') return res.status(400).json({ message: 'Not a group message' });
    if (message.messageType === 'system') return res.status(400).json({ message: 'System messages cannot be unsent' });
    if (message.senderId.toString() !== req.user._id.toString()) return res.status(401).json({ message: 'Not authorized' });

    await assertMember(message.groupId, req.user._id);

    await Message.updateOne(
      { _id: message._id },
      { $set: { isUnsent: true, content: '' } }
    );

    const io = getIO();
    if (io) {
      io.to(roomForGroup(message.groupId)).emit('group:message:update', {
        messageId: message._id.toString(),
        groupId: message.groupId.toString(),
        isUnsent: true,
        content: ''
      });
    }

    res.json({ message: 'Message unsent successfully' });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
