export interface User {
  id: string;
  username: string;
  createdAt: string;
  publicKey?: string; // Base64 encoded RSA Public Key
}

export interface UserProfile {
  username: string;
  createdAt: string;
  postCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface SearchResult {
  username: string;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  timestamp: string;
  authorId: string;
  parentId?: string;
}

export interface Post {
  id: string;
  content: string;
  timestamp: string;
  updatedAt?: string; // New: Track edit time
  isEdited?: boolean; // New: Flag for UI
  authorId?: string; 
  authorUsername?: string; 
  isAnonymous?: boolean; 
  likedBy?: string[]; 
  isMine?: boolean; // Helper computed by backend logic
  hasLiked?: boolean; 
  toxicityScore?: number;
  likes: number;
  commentCount: number;
  hashtags?: string[]; // Normalized lowercase hashtags
  mentions?: string[]; // Validated usernames mentioned
  sharedPostId?: string; // ID of the original post if this is a share
}

// E2EE Message Structure
export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  timestamp: string;
  isRead: boolean; // New field for read status
  
  // The actual content encrypted with AES-GCM
  encryptedContent: string; // Base64
  iv: string; // Base64 initialization vector
  
  // The AES key, encrypted with the Receiver's Public Key (RSA)
  encryptedKeyForReceiver: string; // Base64
  
  // The AES key, encrypted with the Sender's Public Key (RSA)
  // Required so the sender can read their own message history on other devices (if key is shared)
  encryptedKeyForSender: string; // Base64
  
  // New Fields
  replyTo?: Message;
  isEdited?: boolean;
  editedAt?: string;
  isUnsent?: boolean;
}

// Decrypted structure for frontend use
export interface DecryptedMessage extends Omit<Message, 'encryptedContent'> {
  content: string; // Plaintext
  isMine: boolean;
  sharedPostId?: string; // If the message is a shared post
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ConversationSummary {
  userId: string;
  username: string;
  unreadCount: number;
}

export enum NotificationType {
  LIKE = 'LIKE',
  COMMENT = 'COMMENT',
  REPLY = 'REPLY',
  MENTION = 'MENTION',
  SHARE = 'SHARE',
  FOLLOW = 'FOLLOW'
}

export interface Notification {
  id: string;
  recipientId: string;
  actorUsername: string; // "Anonymous" if the actor was anonymous (though usually we don't notify for anon interactions to be safe, or we mask it)
  type: NotificationType;
  referenceId: string; // ID of the Post
  isRead: boolean;
  timestamp: string;
}

export enum ViewState {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  FEED = 'FEED',
  CREATE = 'CREATE',
  PROFILE = 'PROFILE',
  SEARCH = 'SEARCH',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE',
  MESSAGES = 'MESSAGES',
  NOTIFICATIONS = 'NOTIFICATIONS',
  SINGLE_POST = 'SINGLE_POST',
  HASHTAG_FEED = 'HASHTAG_FEED'
}

export interface ApiError {
  message: string;
  code?: string;
}