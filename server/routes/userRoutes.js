import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// IMPORTANT: Specific routes MUST be defined before the wildcard /:username route.
// Express matches top-to-bottom — if /:username comes first, it swallows all sub-paths
// like /key/..., /search/..., /id/... before they can be matched.

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

// @desc    Get user by ID (own profile)
// @route   GET /api/users/id/:id
// @access  Protected
router.get('/id/:id', protect, async (req, res) => {
    try {
        // Safety Check 1: Validate ID format
        if (!req.params.id || req.params.id === 'undefined' || req.params.id === 'null') {
             return res.status(400).json({ message: 'Invalid User ID provided' });
        }
        
        // Check for valid ObjectId (approximate check)
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid User ID format' });
        }

        const user = await User.findById(req.params.id).select('-password');
        
        // Safety Check 2: Handle Null User
        if (!user) return res.status(404).json({ message: 'User not found' });

        const postCount = await Post.countDocuments({ authorId: user._id });

        res.json({
            username: user.username,
            createdAt: user.createdAt,
            postCount,
            followersCount: user.followers?.length ?? 0,
            followingCount: user.following?.length ?? 0,
            isFollowing: false // Always false — can't follow yourself
        });
    } catch (error) {
        console.error('User ID Route Error:', error);
        
        // Safety Check 3: Handle Mongoose CastError explicitly
        if (error.name === 'CastError') {
             return res.status(400).json({ message: 'Invalid User ID format' });
        }
        
        res.status(500).json({ message: `User Error: ${error.message}` });
    }
});

// @desc    Follow a user
// @route   POST /api/users/:username/follow
// @access  Protected
// NOTE: Must be above GET /:username wildcard
router.post('/:username/follow', protect, async (req, res) => {
    try {
        const target = await User.findOne({ username: req.params.username });
        if (!target) return res.status(404).json({ message: 'User not found' });

        // Prevent self-follow
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        // Check if already following
        const alreadyFollowing = target.followers.some(
            id => id.toString() === req.user._id.toString()
        );
        if (alreadyFollowing) {
            return res.status(400).json({ message: 'Already following this user' });
        }

        // Atomic update on both sides — $addToSet prevents duplicates
        await User.findByIdAndUpdate(target._id, { $addToSet: { followers: req.user._id } });
        await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: target._id } });

        // Fire follow notification (best-effort, don't crash on failure)
        try {
            await Notification.create({
                recipientId: target._id,
                actorUsername: req.user.username,
                type: 'FOLLOW',
                referenceId: req.user.username // Reference is the follower's username
            });
        } catch (notifErr) {
            console.warn('[Follow] Notification creation failed:', notifErr.message);
        }

        const updatedTarget = await User.findById(target._id).select('followers');
        res.json({
            followersCount: updatedTarget.followers.length,
            isFollowing: true
        });
    } catch (error) {
        console.error('Follow Route Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Unfollow a user
// @route   POST /api/users/:username/unfollow
// @access  Protected
router.post('/:username/unfollow', protect, async (req, res) => {
    try {
        const target = await User.findOne({ username: req.params.username });
        if (!target) return res.status(404).json({ message: 'User not found' });

        // Prevent self-unfollow (edge case)
        if (target._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'Invalid operation' });
        }

        // Atomic removal on both sides
        await User.findByIdAndUpdate(target._id, { $pull: { followers: req.user._id } });
        await User.findByIdAndUpdate(req.user._id, { $pull: { following: target._id } });

        const updatedTarget = await User.findById(target._id).select('followers');
        res.json({
            followersCount: updatedTarget.followers.length,
            isFollowing: false
        });
    } catch (error) {
        console.error('Unfollow Route Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get user public profile
// @route   GET /api/users/:username
// @access  Public (optional JWT for isFollowing)
// NOTE: Wildcard route — must remain LAST in this file.
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const postCount = await Post.countDocuments({ authorId: user._id, isAnonymous: false });

    // Optional JWT check — determine isFollowing without requiring auth
    let isFollowing = false;
    if (req.headers.authorization?.startsWith('Bearer')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        isFollowing = user.followers.some(id => id.toString() === decoded.id.toString());
      } catch (_) { /* Invalid token — treat as guest */ }
    }

    res.json({
      username: user.username,
      createdAt: user.createdAt,
      postCount,
      followersCount: user.followers?.length ?? 0,
      followingCount: user.following?.length ?? 0,
      isFollowing
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
