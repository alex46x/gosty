import express from 'express';
import Post from '../models/Post.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Comment from '../models/Comment.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Helper to extract hashtags and mentions
const extractTags = (content) => {
    const hashtags = (content.match(/#[a-zA-Z0-9_]+/g) || []).map(tag => tag.toLowerCase());
    const mentions = (content.match(/@[a-zA-Z0-9_]+/g) || []).map(mention => mention.substring(1)); // Remove @
    return { hashtags, mentions };
};

// Helper to filter privacy (hide author if anonymous)
const privacyFilter = (post, viewerId) => {
    const isMine = viewerId && post.authorId.toString() === viewerId.toString();
    const isAuthorUnknown = post.isAnonymous && !isMine;

    return {
        ...post.toObject(),
        authorId: isAuthorUnknown ? undefined : post.authorId,
        authorUsername: isAuthorUnknown ? undefined : post.authorUsername,
        isMine,
        hasLiked: viewerId ? post.likedBy.includes(viewerId) : false,
        likedBy: undefined // Don't send whole array to frontend for performance/privacy
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
         
         if (username) {
             const user = await User.findOne({ username: username });
             if (user) {
                 query.authorId = user._id;
                 query.isAnonymous = false; // Public profiles only show public posts
             } else {
                 return res.json([]); // User not found
             }
         } else if (hashtag) {
             query.hashtags = hashtag.toLowerCase();
             query.isAnonymous = false; // Usually hashtags are public? Or maybe both? 
             // Requirement says: "filter(p => !p.isAnonymous && p.hashtags...)" in mockBackend
         }

         // If we are getting the main feed (no filters), we typically only show public posts + maybe anonymous ones?
         // MockBackend logic: 
         // getFeed: returns all posts (privacy filtered)
         // getPostsByHashtag: returns !isAnonymous
         // getUserPublicPosts: returns !isAnonymous
         
         const posts = await Post.find(query).sort({ createdAt: -1 }).limit(50);

        const safePosts = posts.map(p => {
             const isAnon = p.isAnonymous;
             // We don't have the viewer ID here easily without auth middleware on public route.
             // But for public feed data, redaction is key.
             return {
                 ...p.toObject(),
                 authorId: isAnon ? undefined : p.authorId,
                 authorUsername: isAnon ? undefined : p.authorUsername,
                 likedBy: undefined
                 // isMine will be false default, frontend can check against its own known ID if needed or we fix later
             };
         });
         
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
        
        const isAnon = post.isAnonymous;
        const safePost = {
            ...post.toObject(),
            authorId: isAnon ? undefined : post.authorId,
            authorUsername: isAnon ? undefined : post.authorUsername,
            likedBy: undefined
        };
        
        res.json(safePost);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @desc    Get My Posts
// @route   GET /api/posts/mine
// @access  Protected
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

// @desc    Get Comments (Moved from here, but keeping for compatibility if specific post comments needed)
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
