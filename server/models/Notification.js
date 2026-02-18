import mongoose from 'mongoose';

const notificationSchema = mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorUsername: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['LIKE', 'COMMENT', 'REPLY', 'MENTION', 'SHARE'],
    required: true
  },
  referenceId: {
    type: String, // Post ID or other reference
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// TTL Index: Automatically delete notifications after 48 hours
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
