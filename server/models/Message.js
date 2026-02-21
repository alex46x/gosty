import mongoose from 'mongoose';


const messageSchema = mongoose.Schema({
  conversationType: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct',
    index: true
  },
  messageType: {
    type: String,
    enum: ['user', 'system'],
    default: 'user'
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function () {
      return this.conversationType === 'group';
    },
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.conversationType === 'direct';
    }
  },
  // Reply reference
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    required: false
  },
  // Group/system plaintext content
  content: {
    type: String,
    required: function () {
      return this.conversationType === 'group';
    }
  },
  // System event metadata for group state changes
  systemAction: {
    type: String,
    enum: [
      'user_added',
      'user_removed',
      'user_left',
      'admin_promoted',
      'admin_demoted',
      'group_renamed'
    ],
    default: null
  },
  systemMeta: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  encryptedContent: {
    type: String,
    required: function () {
      return this.conversationType === 'direct';
    }
  },
  iv: {
    type: String,
    required: function () {
      return this.conversationType === 'direct';
    }
  },
  encryptedKeyForReceiver: {
    type: String,
    required: function () {
      return this.conversationType === 'direct';
    }
  },
  encryptedKeyForSender: {
    type: String,
    required: function () {
      return this.conversationType === 'direct';
    }
  },
  isRead: {
    type: Boolean,
    default: false
  },
  // Edit tracking
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  // "Delete for me" - array of user IDs who deleted this message
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // "Unsend for everyone"
  isUnsent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

messageSchema.index({ groupId: 1, createdAt: 1 });
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
