import express from 'express';
import jwt from 'jsonwebtoken';
import Post from '../models/Post.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Comment from '../models/Comment.js';
import { protect } from '../middleware/authMiddleware.js';
import { rankFeed } from '../services/feedRankingService.js';

const router = express.Router();

// Helper to extract hashtags and mentions
const extractTags = (content) => {
    const hashtags = (content.match(/#[a-zA-Z0-9_]+/g) || []).map(tag => tag.toLowerCase());
    const mentions = (content.match(/@[a-zA-Z0-9_]+/g) || []).map(mention => mention.substring(1)); // Remove @
    return { hashtags, mentions };
};

// Helper to filter privacy (hide author if anonymous)
// Works with both Mongoose documents (needs .toObject()) and plain lean objects
const privacyFilter = (post, viewerId) => {
    const doc = typeof post.toObject === 'function' ? post.toObject() : post;
    const isMine = viewerId && doc.authorId && doc.authorId.toString() === viewerId.toString();
    const isAuthorUnknown = doc.isAnonymous && !isMine;

    return {
        ...doc,
        authorId: isAuthorUnknown ? undefined : doc.authorId,
        authorUsername: isAuthorUnknown ? undefined : doc.authorUsername,
        isMine,
        hasLiked: viewerId ? (doc.likedBy || []).some(id => id && id.toString() === viewerId.toString()) : false,
        likedBy: undefined // Don't send the full array to frontend
    };
};


// @desc    Create a post
// @route   POST /api/posts
// @access  Protected
router.post('/', protect, async (req, res) => {
    try {
        const { content, toxicityScore, isAnonymous } = req.body;
        const { hashtags, mentions } = extractTags(content);

        const newPost = await Post.create({
            content,
            authorId: req.user._id,
            authorUsername: req.user.username,
            toxicityScore,
            isAnonymous,
            hashtags,
            mentions,
            likes: 0,
            commentCount: 0
        });
        
        // Notifications for Mentions (only if public)
        if (!isAnonymous && mentions && mentions.length > 0) {
           for (const username of mentions) {
               const mentionedUser = await User.findOne({ username });
               if (mentionedUser && mentionedUser._id.toString() !== req.user._id.toString()) {
                   await Notification.create({
                       recipientId: mentionedUser._id,
                       actorUsername: req.user.username,
                       type: 'MENTION',
                       referenceId: newPost._id
                   });
               }
           }
        }

        res.status(201).json(privacyFilter(newPost, req.user._id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Feed (All, User, or Hashtag)
// @route   GET /api/posts
// @access  Public
router.get('/', async (req, res) => {
    try {
         const { username, hashtag } = req.query;
         let query = {};
         
         // Identify Viewer for privacy filtering, "hasLiked" status, and personalization
         let viewerId = null;
         let viewerFollowing = []; // IDs of users the viewer follows

         if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
             try {
                 const token = req.headers.authorization.split(' ')[1];
                 const decoded = jwt.verify(token, process.env.JWT_SECRET);
                 viewerId = decoded.id;

                 // Load following list for personalized ranking
                 const viewerUser = await User.findById(viewerId).select('following').lean();
                 if (viewerUser) {
                     viewerFollowing = viewerUser.following || [];
                 }
             } catch (e) {
                 console.warn("Feed access with invalid token");
             }
         }
         
         // ── Profile Feed (by username) ──
         if (username) {
             const user = await User.findOne({ username }).lean();
             if (user) {
                 query.authorId = user._id;
                 query.isAnonymous = false;
             } else {
                 return res.json([]);
             }

             const posts = await Post.find(query).sort({ createdAt: -1 }).limit(50);
             const safePosts = posts.map(p => privacyFilter(p, viewerId));
             return res.json(safePosts);
         }

         // ── Hashtag Feed ──
         if (hashtag) {
             const tag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
             query.hashtags = tag.toLowerCase();
             console.log(`[DEBUG] Searching for hashtag: ${query.hashtags}`);

             const posts = await Post.find(query).sort({ createdAt: -1 }).limit(50);
             console.log(`[DEBUG] Found ${posts.length} posts for query:`, query);
             const safePosts = posts.map(p => privacyFilter(p, viewerId));
             return res.json(safePosts);
         }

         // ── Smart Ranked Main Feed ──
         //
         // Fetch a larger pool so the ranking algorithm has enough posts to work with.
         // We fetch 100, rank them, and return the top 50.
         // For guests (no viewerId), fall back to simple recency.

         const POOL_SIZE = 100;
         const FEED_SIZE = 50;

         // Only look at posts from the last 7 days in the pool to keep things fresh.
         const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
         const pool = await Post.find({ createdAt: { $gte: sevenDaysAgo } })
             .sort({ createdAt: -1 })
             .limit(POOL_SIZE)
             .lean();

         let ranked;
         if (viewerId && viewerFollowing.length > 0) {
             // Authenticated user: run personalized ranking
             ranked = rankFeed(pool, viewerFollowing);
         } else if (viewerId) {
             // Logged in but follows nobody: light engagement-based sort (still better than pure recency)
             ranked = rankFeed(pool, []);
         } else {
             // Guest: simple recency (pool is already sorted newest-first)
             ranked = pool;
         }

         const feedPosts = ranked.slice(0, FEED_SIZE);
         const safePosts = feedPosts.map(p => privacyFilter(p, viewerId));
         res.json(safePosts);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// @desc    Get My Posts
// @route   GET /api/posts/mine
// @access  Protected
// NOTE: This MUST be defined before GET /:id — Express matches top-to-bottom,
// and /mine would be swallowed by /:id (with id="mine" → CastError) if placed after.
router.get('/mine', protect, async (req, res) => {
    try {
        const posts = await Post.find({ authorId: req.user._id }).sort({ createdAt: -1 });
        // No privacy filter needed for own posts, but we can stick to format
        const safePosts = posts.map(p => ({
            ...p.toObject(),
            isMine: true
        }));
        res.json(safePosts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get Single Post
// @route   GET /api/posts/:id
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        
        let viewerId = null;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                viewerId = decoded.id;
            } catch (e) {
                // Ignore invalid token
            }
        }

        res.json(privacyFilter(post, viewerId));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Toggle Like
// @route   PUT /api/posts/like/:id
// @access  Protected
router.put('/like/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        if (!Array.isArray(post.likedBy)) {
            post.likedBy = [];
        }

        const isLiked = post.likedBy.some(id => id && id.toString() === req.user._id.toString());

        if (isLiked) {
            post.likedBy = post.likedBy.filter(id => id && id.toString() !== req.user._id.toString());
            post.likes = Math.max(0, post.likes - 1); // Prevent negative likes
        } else {
            post.likedBy.push(req.user._id);
            post.likes++;
            
            // Notification
            if (!post.isAnonymous && post.authorId.toString() !== req.user._id.toString()) {
                await Notification.create({
                    recipientId: post.authorId,
                    actorUsername: req.user.username,
                    type: 'LIKE',
                    referenceId: post._id
                });
            }
        }

        await post.save();
        res.json({ likes: post.likes, hasLiked: !isLiked });
    } catch (error) {
        console.error('Like Route Error:', error);
        res.status(500).json({ message: `Like Error: ${error.message}` });
    }
});

// @desc    Add Comment
// @route   POST /api/posts/comment/:id
// @access  Protected
router.post('/comment/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if(!post) return res.status(404).json({message: 'Post not found'});
        
        const { content, parentId } = req.body;
        
        const comment = await Comment.create({
            postId: post._id,
            authorId: req.user._id,
            content,
            parentId: parentId || null
        });
        
        post.commentCount++;
        await post.save();
        
        // Notifications
        if (!post.isAnonymous && post.authorId.toString() !== req.user._id.toString()) {
            await Notification.create({
                recipientId: post.authorId,
                actorUsername: req.user.username,
                type: 'COMMENT',
                referenceId: post._id
            });
        }

        res.json(comment);
    } catch (error) {
        console.error('Comment Route Error:', error);
        res.status(500).json({ message: `Comment Error: ${error.message}` });
    }
});

// NOTE: GET /comment/:id is defined here (after /mine but still reached before /:id
// handles only exact /:id for single posts — comment/:id is specific enough to be safe.
// @desc    Get Comments
// @route   GET /api/posts/comment/:id
// @access  Public
router.get('/comment/:id', async (req, res) => {
    try {
        const comments = await Comment.find({ postId: req.params.id }).sort({ createdAt: 1 });
        res.json(comments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Edit Post
// @route   PUT /api/posts/:id
// @access  Protected
router.put('/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        if (post.authorId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const { content } = req.body;
        const { hashtags, mentions } = extractTags(content || post.content);
        
        post.content = content || post.content;
        post.hashtags = hashtags || post.hashtags;
        post.mentions = mentions || post.mentions; // Note: editing mentions logic is complex, just updating for now
        post.isEdited = true;

        await post.save();
        res.json(privacyFilter(post, req.user._id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Delete Post
// @route   DELETE /api/posts/:id
// @access  Protected
router.delete('/:id', protect, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        if (post.authorId.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await post.deleteOne();
        await Comment.deleteMany({ postId: post._id });
        // Optionally delete notifications
        
        res.json({ message: 'Post removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Share Post
// @route   POST /api/posts/share/:id
// @access  Protected
router.post('/share/:id', protect, async (req, res) => {
    try {
        const originalPost = await Post.findById(req.params.id);
        if (!originalPost) return res.status(404).json({ message: 'Original post not found' });
        if (originalPost.isAnonymous) return res.status(400).json({ message: 'Cannot share anonymous posts' });

        const { content } = req.body;
        const { hashtags, mentions } = extractTags(content || "");

        const newPost = await Post.create({
            content: content || "",
            authorId: req.user._id,
            authorUsername: req.user.username,
            isAnonymous: false,
            sharedPostId: originalPost._id,
            hashtags,
            mentions,
            likes: 0,
            commentCount: 0
        });

        // Notify original author
        if (originalPost.authorId.toString() !== req.user._id.toString()) {
            await Notification.create({
                recipientId: originalPost.authorId,
                actorUsername: req.user.username,
                type: 'SHARE',
                referenceId: newPost._id
            });
        }

        res.status(201).json(privacyFilter(newPost, req.user._id));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
