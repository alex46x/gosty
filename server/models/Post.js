import mongoose from 'mongoose';

const postSchema = mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorUsername: {
    type: String
  },
  isAnonymous: {
    type: Boolean,
    default: true
  },
  toxicityScore: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  commentCount: {
    type: Number,
    default: 0
  },
  hashtags: [String],
  mentions: [String],
  sharedPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  isEdited: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// ─── Indexes for feed performance ────────────────────────────────────────────
//
// 1. Main feed: filter by createdAt range, sort by createdAt DESC
postSchema.index({ createdAt: -1 });

// 2. Profile feed: filter by authorId + isAnonymous, sort by createdAt
postSchema.index({ authorId: 1, isAnonymous: 1, createdAt: -1 });

// 3. Hashtag feed: filter by hashtags array element, sort by createdAt
postSchema.index({ hashtags: 1, createdAt: -1 });

// 4. Like lookup (for hasLiked checks)
postSchema.index({ likedBy: 1 });
// ─────────────────────────────────────────────────────────────────────────────

const Post = mongoose.model('Post', postSchema);
export default Post;
