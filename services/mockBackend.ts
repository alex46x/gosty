import { User, Post, AuthResponse, Comment, UserProfile, SearchResult, Message, ConversationSummary, Notification, NotificationType } from '../types';

/**
 * REAL BACKEND SERVICE
 * 
 * Replaces the mock backend with real API calls to the Node.js/Express server.
 */

const API_URL = 'http://localhost:5000/api';

// Helper to get headers with Auth Token
const getHeaders = () => {
    const token = localStorage.getItem('ghost_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

// Generic Fetch Wrapper
const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...getHeaders(), ...options.headers }
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'API Error');
    }
    return data;
};

// --- AUTH SERVICES ---

export const register = async (username: string, password: string, publicKey: string): Promise<AuthResponse> => {
    return fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, publicKey })
    });
};

export const login = async (username: string, password: string): Promise<AuthResponse> => {
    return fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
};

// --- SEARCH SERVICES ---

export const searchUsers = async (query: string, requesterId: string): Promise<SearchResult[]> => {
    if (!query || query.trim().length < 3) return [];
    return fetchAPI(`/users/search/${query}`);
};

// --- PUBLIC PROFILE SERVICES ---

export const getUserPublicProfile = async (targetUsername: string): Promise<UserProfile> => {
    return fetchAPI(`/users/${targetUsername}`);
};

export const getUserPublicPosts = async (targetUsername: string, viewerId?: string): Promise<Post[]> => {
    return fetchAPI(`/posts?username=${targetUsername}`);
};

// --- SELF PROFILE SERVICES ---

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
    return fetchAPI(`/users/id/${userId}`);
};

export const getUserPosts = async (userId: string): Promise<Post[]> => {
    return fetchAPI('/posts/mine'); // filtered by auth token in backend
};

// --- POSTING SERVICES ---

export const getFeed = async (currentUserId?: string): Promise<Post[]> => {
    return fetchAPI('/posts');
};

export const getPostsByHashtag = async (hashtag: string, currentUserId?: string): Promise<Post[]> => {
    const tag = hashtag.replace('#', '');
    return fetchAPI(`/posts?hashtag=${tag}`);
};

export const getSinglePost = async (postId: string, currentUserId?: string): Promise<Post> => {
    // I missed GET /api/posts/:id in postRoutes.js!
    // I'll add it in next turn.
    return fetchAPI(`/posts/${postId}`); 
};

export const createPost = async (content: string, authorId: string, toxicityScore: number, isAnonymous: boolean = true): Promise<Post> => {
    return fetchAPI('/posts', {
        method: 'POST',
        body: JSON.stringify({ content, toxicityScore, isAnonymous })
    });
};

export const editPost = async (postId: string, userId: string, newContent: string): Promise<Post> => {
    return fetchAPI(`/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newContent })
    });
};

export const deletePost = async (postId: string, userId: string): Promise<void> => {
    await fetchAPI(`/posts/${postId}`, {
        method: 'DELETE'
    });
};

export const sharePostToProfile = async (originalPostId: string, content: string, authorId: string): Promise<Post> => {
    return fetchAPI(`/posts/share/${originalPostId}`, {
        method: 'POST',
        body: JSON.stringify({ content })
    });
};

// --- INTERACTION SERVICES ---

export const toggleLikePost = async (postId: string, userId: string): Promise<{ likes: number; hasLiked: boolean }> => {
    return fetchAPI(`/posts/like/${postId}`, {
        method: 'PUT'
    });
};

export const addComment = async (postId: string, content: string, authorId: string, parentId?: string): Promise<Comment> => {
    return fetchAPI(`/posts/comment/${postId}`, {
        method: 'POST',
        body: JSON.stringify({ content, parentId })
    });
};

export const getComments = async (postId: string): Promise<Comment[]> => {
    return fetchAPI(`/posts/comment/${postId}`); // or /api/comments?postId=... depending on route
};

export const updateComment = async (commentId: string, newContent: string): Promise<Comment> => {
    return fetchAPI(`/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newContent })
    });
};

// --- NOTIFICATION UTILS ---

export const getNotifications = async (userId: string): Promise<Notification[]> => {
    return fetchAPI('/notifications');
};

export const markNotificationsRead = async (userId: string, notificationId?: string): Promise<void> => {
    const id = notificationId || 'all';
    await fetchAPI(`/notifications/${id}`, {
        method: 'PUT'
    });
};

export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
    const data = await fetchAPI('/notifications/unread/count');
    return data.count;
};

// --- MESSAGING SERVICES ---

export const getUserPublicKey = async (username: string): Promise<{ id: string; publicKey: string }> => {
    return fetchAPI(`/users/key/${username}`);
};

export const sendMessage = async (
  senderId: string,
  receiverId: string,
  encryptedContent: string,
  iv: string,
  encryptedKeyForReceiver: string,
  encryptedKeyForSender: string
): Promise<Message> => {
    return fetchAPI('/messages', {
        method: 'POST',
        body: JSON.stringify({
            receiverId,
            encryptedContent,
            iv,
            encryptedKeyForReceiver,
            encryptedKeyForSender
        })
    });
};

export const getMessages = async (userId: string, otherUserId: string): Promise<Message[]> => {
    return fetchAPI(`/messages/${otherUserId}`);
};

export const getConversations = async (userId: string): Promise<ConversationSummary[]> => {
    return fetchAPI('/messages/conversations/list');
};

export const markMessagesRead = async (userId: string, senderId: string): Promise<void> => {
    await fetchAPI(`/messages/read/${senderId}`, {
        method: 'PUT'
    });
};

export const getTotalUnreadCount = async (userId: string): Promise<number> => {
    const data = await fetchAPI('/messages/unread/count');
    return data.count;
};

// Legacy
export const likePost = async (postId: string): Promise<number> => {
  console.warn("Deprecated: use toggleLikePost");
  return 0;
};