import mongoose from 'mongoose';

const groupSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    avatarUrl: {
      type: String,
      default: null
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    lastMessagePreview: {
      type: String,
      default: ''
    },
    memberCount: {
      type: Number,
      default: 0
    },
    adminCount: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

groupSchema.index({ updatedAt: -1 });

const Group = mongoose.model('Group', groupSchema);
export default Group;

