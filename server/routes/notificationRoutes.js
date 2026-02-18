import express from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get Notifications
// @route   GET /api/notifications
// @access  Protected
router.get('/', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipientId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Mark as Read
// @route   PUT /api/notifications/:id
// @access  Protected
router.put('/:id', protect, async (req, res) => {
    try {
        // If ID is 'all', mark all as read
        if (req.params.id === 'all') {
             await Notification.updateMany(
                 { recipientId: req.user._id, isRead: false },
                 { $set: { isRead: true } }
             );
             return res.json({ message: 'All marked as read' });
        }

        const notification = await Notification.findById(req.params.id);
        if (!notification) return res.status(404).json({ message: 'Not found' });
        
        if (notification.recipientId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Unread Count
// @route   GET /api/notifications/unread/count
// @access  Protected
router.get('/unread/count', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            recipientId: req.user._id,
            isRead: false
        });
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
