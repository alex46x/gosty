import mongoose from 'mongoose';

const groupMemberSchema = mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['member', 'admin'],
      default: 'member'
    },
    status: {
      type: String,
      enum: ['active', 'left', 'removed'],
      default: 'active',
      index: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    removedAt: {
      type: Date,
      default: null
    },
    lastReadAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const GroupMember = mongoose.model('GroupMember', groupMemberSchema);
export default GroupMember;

