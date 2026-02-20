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

    // Read as text first — if the server returned HTML (e.g. a crash page),
    // res.json() would throw a useless "<!DOCTYPE" error. This gives us a
    // clean, readable error message instead.
    const text = await res.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        // Server returned non-JSON (HTML error page, network issue, etc.)
        console.error(`[API] Non-JSON response from ${endpoint}:`, text.slice(0, 200));
        throw new Error(
            res.ok
                ? 'Server returned an unexpected response. Please try again.'
                : `Server error (${res.status}): ${res.statusText}`
        );
    }

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

// Helper to normalize _id to id
const normalize = (data: any): any => {
    if (Array.isArray(data)) {
        return data.map(item => normalize(item));
    }
    if (data && typeof data === 'object') {
        const normalized = { ...data };
        if (normalized._id) {
            normalized.id = normalized._id;
            delete normalized._id;
        }
        // Fix: Map Mongoose 'createdAt' to 'timestamp' if missing
        if (!normalized.timestamp && normalized.createdAt) {
            normalized.timestamp = normalized.createdAt;
        }
        return normalized;
    }
    return data;
};

// --- SEARCH SERVICES ---

export const searchUsers = async (query: string, requesterId: string): Promise<SearchResult[]> => {
    if (!query || query.trim().length < 3) return [];
    return normalize(await fetchAPI(`/users/search/${query}`));
};

// --- PUBLIC PROFILE SERVICES ---

export const getUserPublicProfile = async (targetUsername: string): Promise<UserProfile> => {
    return normalize(await fetchAPI(`/users/${targetUsername}`));
};

export const translateText = async (text: string, targetLang: string = 'en'): Promise<{ translatedText: string, originalText: string, detectedLang: string }> => {
    return fetchAPI('/translate', {
        method: 'POST',
        body: JSON.stringify({ text, targetLang })
    });
};

export const getUserPublicPosts = async (targetUsername: string, viewerId?: string): Promise<Post[]> => {
    return normalize(await fetchAPI(`/posts?username=${targetUsername}`));
};

export const followUser = async (username: string): Promise<{ followersCount: number; isFollowing: boolean }> => {
    return fetchAPI(`/users/${username}/follow`, { method: 'POST' });
};

export const unfollowUser = async (username: string): Promise<{ followersCount: number; isFollowing: boolean }> => {
    return fetchAPI(`/users/${username}/unfollow`, { method: 'POST' });
};

// --- SELF PROFILE SERVICES ---

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
    return normalize(await fetchAPI(`/users/id/${userId}`));
};

export const getUserPosts = async (userId: string): Promise<Post[]> => {
    return normalize(await fetchAPI('/posts/mine')); 
};

// --- POSTING SERVICES ---

export const getFeed = async (currentUserId?: string): Promise<Post[]> => {
    return normalize(await fetchAPI('/posts'));
};

export const getPostsByHashtag = async (hashtag: string, currentUserId?: string): Promise<Post[]> => {
    const tag = hashtag.replace('#', '');
    return normalize(await fetchAPI(`/posts?hashtag=${tag}`));
};

export const getSinglePost = async (postId: string, currentUserId?: string): Promise<Post> => {
    return normalize(await fetchAPI(`/posts/${postId}`)); 
};

export const createPost = async (content: string, authorId: string, toxicityScore: number, isAnonymous: boolean = true): Promise<Post> => {
    return normalize(await fetchAPI('/posts', {
        method: 'POST',
        body: JSON.stringify({ content, toxicityScore, isAnonymous })
    }));
};

export const editPost = async (postId: string, userId: string, newContent: string): Promise<Post> => {
    return normalize(await fetchAPI(`/posts/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newContent })
    }));
};

export const deletePost = async (postId: string, userId: string): Promise<void> => {
    await fetchAPI(`/posts/${postId}`, {
        method: 'DELETE'
    });
};

export const sharePostToProfile = async (originalPostId: string, content: string, authorId: string): Promise<Post> => {
    return normalize(await fetchAPI(`/posts/share/${originalPostId}`, {
        method: 'POST',
        body: JSON.stringify({ content })
    }));
};

// --- INTERACTION SERVICES ---

export const toggleLikePost = async (postId: string, userId: string): Promise<{ likes: number; hasLiked: boolean }> => {
    return fetchAPI(`/posts/like/${postId}`, {
        method: 'PUT'
    });
};

export const addComment = async (postId: string, content: string, authorId: string, parentId?: string): Promise<Comment> => {
    return normalize(await fetchAPI(`/posts/comment/${postId}`, {
        method: 'POST',
        body: JSON.stringify({ content, parentId })
    }));
};

export const getComments = async (postId: string): Promise<Comment[]> => {
    return normalize(await fetchAPI(`/posts/comment/${postId}`)); 
};

export const updateComment = async (commentId: string, newContent: string): Promise<Comment> => {
    return normalize(await fetchAPI(`/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: newContent })
    }));
};

// --- NOTIFICATION UTILS ---

export const getNotifications = async (userId: string): Promise<Notification[]> => {
    return normalize(await fetchAPI('/notifications'));
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
  encryptedKeyForSender: string,
  replyTo?: string
): Promise<Message> => {
    return fetchAPI('/messages', {
        method: 'POST',
        body: JSON.stringify({
            receiverId,
            encryptedContent,
            iv,
            encryptedKeyForReceiver,
            encryptedKeyForSender,
            replyTo // Optional reply ID
        })
    });
};

// --- NEW MESSAGE ACTIONS ---

export const editMessage = async (
    messageId: string,
    encryptedContent: string,
    iv: string,
    encryptedKeyForReceiver: string,
    encryptedKeyForSender: string
): Promise<Message> => {
    return fetchAPI(`/messages/${messageId}/edit`, {
        method: 'PUT',
        body: JSON.stringify({
            encryptedContent,
            iv,
            encryptedKeyForReceiver,
            encryptedKeyForSender
        })
    });
};

export const deleteMessage = async (messageId: string): Promise<{ message: string }> => {
    return fetchAPI(`/messages/${messageId}/delete`, {
        method: 'PUT'
    });
};

export const unsendMessage = async (messageId: string): Promise<Message> => {
    return fetchAPI(`/messages/${messageId}/unsend`, {
        method: 'PUT'
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
