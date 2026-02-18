import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Send Message
// @route   POST /api/messages
// @access  Protected
router.post('/', protect, async (req, res) => {
    try {
        const { receiverId, encryptedContent, iv, encryptedKeyForReceiver, encryptedKeyForSender } = req.body;

        if (!receiverId || !encryptedContent || !iv || !encryptedKeyForReceiver || !encryptedKeyForSender) {
            return res.status(400).json({ message: 'Missing fields' });
        }

        const message = await Message.create({
            senderId: req.user._id,
            receiverId,
            encryptedContent,
            iv,
            encryptedKeyForReceiver,
            encryptedKeyForSender,
            isRead: false
        });

        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Messages between current user and another user
// @route   GET /api/messages/:otherUserId
// @access  Protected
router.get('/:otherUserId', protect, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { senderId: req.user._id, receiverId: req.params.otherUserId },
                { senderId: req.params.otherUserId, receiverId: req.user._id }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Conversations (Summary)
// @route   GET /api/messages/conversations
// @access  Protected
router.get('/conversations/list', protect, async (req, res) => {
    try {
         // Find all unique users interacted with
         const sentTo = await Message.distinct('receiverId', { senderId: req.user._id });
         const receivedFrom = await Message.distinct('senderId', { receiverId: req.user._id });
         
         const contactIds = [...new Set([...sentTo, ...receivedFrom].map(id => id.toString()))];
         
         const conversations = [];
         
         for (const contactId of contactIds) {
             const user = await User.findById(contactId).select('username');
             if (user) {
                 const unreadCount = await Message.countDocuments({
                     senderId: contactId,
                     receiverId: req.user._id,
                     isRead: false
                 });
                 
                 conversations.push({
                     userId: user._id,
                     username: user.username,
                     unreadCount
                 });
             }
         }
         
         res.json(conversations);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Mark messages as read
// @route   PUT /api/messages/read/:senderId
// @access  Protected
router.put('/read/:senderId', protect, async (req, res) => {
    try {
        await Message.updateMany(
            { senderId: req.params.senderId, receiverId: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ message: 'Messages marked as read' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Total Unread Count
// @route   GET /api/messages/unread/count
// @access  Protected
router.get('/unread/count', protect, async (req, res) => {
    try {
        const count = await Message.countDocuments({
            receiverId: req.user._id,
            isRead: false
        });
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
