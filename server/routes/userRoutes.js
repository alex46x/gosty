import express from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get user public profile
// @route   GET /api/users/:username
// @access  Public
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const postCount = await Post.countDocuments({ authorId: user._id, isAnonymous: false });

    res.json({
      username: user.username,
      createdAt: user.createdAt,
      postCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get public key for E2EE
// @route   GET /api/users/key/:username
// @access  Protected
router.get('/key/:username', protect, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.publicKey) return res.status(400).json({ message: 'User key not found' });

        res.json({ id: user._id, publicKey: user.publicKey });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Search users
// @route   GET /api/users/search/:query
// @access  Protected
router.get('/search/:query', protect, async (req, res) => {
    try {
        const query = req.params.query;
        if (!query || query.length < 3) return res.json([]);

        const users = await User.find({
            username: { $regex: query, $options: 'i' },
            _id: { $ne: req.user._id }
        }).select('username').limit(5);

        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get user by ID
// @route   GET /api/users/id/:id
// @access  Protected
router.get('/id/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const postCount = await Post.countDocuments({ authorId: user._id });

        res.json({
            username: user.username,
            createdAt: user.createdAt,
            postCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
