import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';
import { getIO, getSocketId } from '../socketManager.js';

const router = express.Router();

// @desc    Send Message
// @route   POST /api/messages
// @access  Protected
router.post('/', protect, async (req, res) => {
    try {
        const { receiverId, encryptedContent, iv, encryptedKeyForReceiver, encryptedKeyForSender, replyTo } = req.body;

        if (!receiverId || !encryptedContent || !iv || !encryptedKeyForReceiver || !encryptedKeyForSender) {
            return res.status(400).json({ message: 'Missing fields' });
        }

        const message = await Message.create({
            conversationType: 'direct',
            senderId: req.user._id,
            receiverId,
            replyTo, // Optional linked message ID
            encryptedContent,
            iv,
            encryptedKeyForReceiver,
            encryptedKeyForSender,
            isRead: false
        });

        // -- Real-Time Delivery ---------------------------------------------
        // The server never decrypts. It just pushes the encrypted payload to
        // the receiver's open socket (if they are currently connected).
        const io = getIO();
        if (io) {
            const receiverSocketId = getSocketId(receiverId);
            if (receiverSocketId) {
                // Push the full encrypted message so receiver can decrypt client-side
                io.to(receiverSocketId).emit('receive_message', message);

                // Push updated unread count for the receiver's sidebar badge
                const unreadCount = await Message.countDocuments({
                    conversationType: 'direct',
                    senderId: req.user._id,
                    receiverId,
                    isRead: false
                });
                io.to(receiverSocketId).emit('unread_count_update', {
                    fromUserId: req.user._id.toString(),
                    fromUsername: req.user.username,
                    unreadCount,
                });
            }
        }

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
            conversationType: 'direct',
            $or: [
                { senderId: req.user._id, receiverId: req.params.otherUserId },
                { senderId: req.params.otherUserId, receiverId: req.user._id }
            ],
            // Filter out messages deleted by this user
            deletedFor: { $ne: req.user._id }
        }).sort({ createdAt: 1 })
          .populate('replyTo', 'senderId encryptedContent iv encryptedKeyForReceiver encryptedKeyForSender isUnsent');


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
         const sentTo = await Message.distinct('receiverId', {
             conversationType: 'direct',
             senderId: req.user._id
         });
         const receivedFrom = await Message.distinct('senderId', {
             conversationType: 'direct',
             receiverId: req.user._id
         });
         
         const contactIds = [...new Set([...sentTo, ...receivedFrom].map(id => id.toString()))];
         
         const conversations = [];
         
         for (const contactId of contactIds) {
             const user = await User.findById(contactId).select('username');
             if (user) {
                 const unreadCount = await Message.countDocuments({
                     conversationType: 'direct',
                     senderId: contactId,
                     receiverId: req.user._id,
                     isRead: false
                 });
                 const lastMessage = await Message.findOne({
                     conversationType: 'direct',
                     $or: [
                         { senderId: req.user._id, receiverId: contactId },
                         { senderId: contactId, receiverId: req.user._id }
                     ]
                 }).sort({ createdAt: -1 }).select('createdAt');
                 
                 conversations.push({
                     conversationType: 'direct',
                     userId: user._id,
                     username: user.username,
                     unreadCount,
                     lastMessageAt: lastMessage?.createdAt || null
                 });
             }
         }
         conversations.sort((a, b) => {
             const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
             const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
             return bt - at;
         });

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
            { conversationType: 'direct', senderId: req.params.senderId, receiverId: req.user._id, isRead: false },
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
            conversationType: 'direct',
            receiverId: req.user._id,
            isRead: false
        });
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Edit Message
// @route   PUT /api/messages/:id/edit
// @access  Protected
router.put('/:id/edit', protect, async (req, res) => {
    try {
        const { encryptedContent, iv, encryptedKeyForReceiver, encryptedKeyForSender } = req.body;
        const message = await Message.findById(req.params.id);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        if (message.conversationType !== 'direct') {
            return res.status(400).json({ message: 'Use group message endpoints for group chat messages' });
        }

        // Only sender can edit
        if (message.senderId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Optional: Time limit check (e.g. 15 mins)
        // const limit = 15 * 60 * 1000;
        // if (Date.now() - new Date(message.createdAt).getTime() > limit) {
        //    return res.status(400).json({ message: 'Edit time limit exceeded' });
        // }

        if (!encryptedContent || !iv || !encryptedKeyForReceiver || !encryptedKeyForSender) {
            return res.status(400).json({ message: 'Missing encrypted edit payload fields' });
        }

        message.encryptedContent = encryptedContent;
        message.iv = iv;
        message.encryptedKeyForReceiver = encryptedKeyForReceiver;
        message.encryptedKeyForSender = encryptedKeyForSender;
        message.isEdited = true;
        message.editedAt = Date.now();
        await message.save();

        // Real-time update
        const io = getIO();
        if (io) {
            const receiverSocketId = getSocketId(message.receiverId.toString());
            const senderSocketId = getSocketId(message.senderId.toString());
            
            const updatePayload = {
                messageId: message._id,
                encryptedContent: message.encryptedContent,
                iv: message.iv,
                encryptedKeyForReceiver: message.encryptedKeyForReceiver,
                encryptedKeyForSender: message.encryptedKeyForSender,
                isEdited: true,
                editedAt: message.editedAt
            };

            if (receiverSocketId) io.to(receiverSocketId).emit('message_updated', updatePayload);
            if (senderSocketId) io.to(senderSocketId).emit('message_updated', updatePayload);
        }

        res.json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Delete Message (Local - For Me)
// @route   PUT /api/messages/:id/delete
// @access  Protected
router.put('/:id/delete', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        if (message.conversationType !== 'direct') {
            return res.status(400).json({ message: 'Use group message endpoints for group chat messages' });
        }

        // Check if user is participant
        if (message.senderId.toString() !== req.user._id.toString() && 
            message.receiverId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Use $addToSet to avoid duplicates and handle missing array safely
        await Message.updateOne(
            { _id: message._id },
            { $addToSet: { deletedFor: req.user._id } }
        );

        res.json({ message: 'Message deleted for you' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Unsend Message (Global - Everyone)
// @route   PUT /api/messages/:id/unsend
// @access  Protected
router.put('/:id/unsend', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        if (message.conversationType !== 'direct') {
            return res.status(400).json({ message: 'Use group message endpoints for group chat messages' });
        }

        // Only sender can unsend
        if (message.senderId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Use updateOne to safely modify document without validation errors on legacy fields
        await Message.updateOne(
            { _id: message._id },
            { 
                $set: { 
                    isUnsent: true,
                    encryptedContent: '' // Clear content for security
                }
            }
        );

        // Real-time update
        const io = getIO();
        if (io) {
            const receiverSocketId = getSocketId(message.receiverId.toString());
            const senderSocketId = getSocketId(message.senderId.toString());
            
            const updatePayload = {
                messageId: message._id,
                isUnsent: true,
                encryptedContent: ''
            };

            if (receiverSocketId) io.to(receiverSocketId).emit('message_updated', updatePayload);
            if (senderSocketId) io.to(senderSocketId).emit('message_updated', updatePayload);
        }

        res.json({ message: 'Message unsent successfully', ...message.toObject(), isUnsent: true, encryptedContent: '' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
