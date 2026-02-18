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

const Post = mongoose.model('Post', postSchema);
export default Post;
