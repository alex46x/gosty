import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Send, User, AlertTriangle, ShieldCheck, ExternalLink, ArrowLeft, Repeat, Edit3, Search, Reply, MoreVertical, Trash2, X, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getConversations, getMessages, sendMessage, getUserPublicKey, markMessagesRead, getSinglePost, editMessage, deleteMessage, unsendMessage } from '../services/mockBackend';
import { encryptMessage, decryptMessage } from '../services/cryptoService';
import { Message, DecryptedMessage, ConversationSummary, Post } from '../types';
import { PostCard } from '../components/PostCard';


interface MessagesProps {
  initialChatUsername?: string;
  onViewProfile: (username: string) => void;
  onNavigateToPost?: (postId: string) => void; // New prop for navigation
}

// ─── Compact Shared Post Preview ───
const SharedPostPreview: React.FC<{ post: Post; onClick: () => void }> = ({ post, onClick }) => {
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="mt-2 text-left bg-black/40 border border-white/10 rounded-lg overflow-hidden cursor-pointer hover:bg-black/60 transition-colors group"
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center text-[10px] text-white font-bold border border-white/10">
             {post.authorUsername?.slice(0,1).toUpperCase() || '?'}
          </div>
          <span className="text-xs font-bold text-white group-hover:underline">
            {post.authorUsername || 'Anonymous'}
          </span>
          <span className="text-[10px] text-gray-500">• {new Date(post.timestamp).toLocaleDateString()}</span>
        </div>
        <p className="text-sm text-gray-300 line-clamp-2 md:line-clamp-3 leading-relaxed font-normal">
          {post.content}
        </p>
      </div>
      <div className="px-3 py-1.5 bg-white/5 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
           <Repeat className="w-3 h-3" /> Shared Signal
        </span>
        <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-white" />
      </div>
    </div>
  );
};

export const Messages: React.FC<MessagesProps> = ({ initialChatUsername, onViewProfile, onNavigateToPost }) => {
  const { user, privateKey } = useAuth();
  const { socket } = useSocket();
  
  // UI State
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  
  // Shared Post Data Cache: value is Post object or 'ERROR' if fetch failed
  const [sharedPostsCache, setSharedPostsCache] = useState<Record<string, Post | 'ERROR'>>({});

  // Message Actions State
  const [replyingTo, setReplyingTo] = useState<DecryptedMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DecryptedMessage | null>(null);
  const [contextMenuId, setContextMenuId] = useState<string | null>(null); // ID of message with open menu

  // Close context menu on any click outside — use mousedown to avoid
  // interfering with input focus (mousedown fires before focus events).
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenuId !== null) setContextMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenuId]);

  // Logic State
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [showNewChatInput, setShowNewChatInput] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');

  // Derived: filter conversations by search query.
  // Source of truth is always `conversations` — never filter an already-filtered list.
  // Null-safe: c.username may be undefined for socket-received conversations not yet normalized.
  const filteredConversations = messageSearchQuery.trim()
    ? conversations.filter(c => {
        const q = messageSearchQuery.toLowerCase();
        const nameMatch = (c?.username ?? '').toLowerCase().includes(q);
        const msgMatch = (c as any)?.lastMessage?.toLowerCase().includes(q) ?? false;
        return nameMatch || msgMatch;
      })
    : conversations;

  // Typing indicator
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Keep a ref to activeChat for use inside socket listeners (avoids stale closure)
  const activeChatRef = useRef<ConversationSummary | null>(null);
  activeChatRef.current = activeChat;

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sharedPostsCache]);

  // ── Real-Time Socket Listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !user || !privateKey) return;

    // receive_message: decrypt the incoming E2EE message and append it
    const handleReceiveMessage = async (msg: Message) => {
      const isMine = msg.senderId === user.id;
      const encryptedKey = isMine ? msg.encryptedKeyForSender : msg.encryptedKeyForReceiver;

      let content = '[[Decryption Error]]';
      let sharedPostId: string | undefined;

      try {
        content = await decryptMessage(msg.encryptedContent, msg.iv, encryptedKey, privateKey);
        try {
          const trimmed = content.trim();
          if (trimmed.startsWith('{') && trimmed.includes('SHARE_POST')) {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === 'SHARE_POST' && parsed.postId) {
              sharedPostId = parsed.postId;
              content = parsed.comment || '';
            }
          }
        } catch (_) { /* Not JSON */ }
      } catch (e) {
        console.error('[Socket] Failed to decrypt incoming message');
      }

      // Normalize _id -> id to prevent optimistic + socket duplicates
      const normalizedId = (msg as any)._id ?? msg.id ?? `temp-${Date.now()}-${Math.random()}`; // Fallback ID
      const decrypted: DecryptedMessage = { ...msg, id: normalizedId, content, isMine, sharedPostId };

      // Only append if this message belongs to the active conversation
      const chat = activeChatRef.current;
      if (chat && (msg.senderId === chat.userId || msg.receiverId === chat.userId)) {
        setMessages(prev => {
          if (prev.some(m => m.id === normalizedId)) return prev;
          return [...prev, decrypted];
        });
      }

      // Move or add sender to top of conversations with updated unread
      setConversations(prev => {
        const senderId = msg.senderId;
        const existing = prev.find(c => c.userId === senderId);
        if (existing) {
          const active = activeChatRef.current;
          // Update existing conversation
          return prev.map(c =>
            c.userId === senderId
              ? { ...c, unreadCount: active?.userId === senderId ? 0 : c.unreadCount + 1 }
              : c
          );
        }
        
        // New conversation — safely add to list
        const newConvo: ConversationSummary = {
          userId: senderId,
          username: (msg as any).senderUsername || 'Unknown', 
          unreadCount: 1
        };
        return [...prev, newConvo];
      });

      // If we don't have the user in our list, we might want to reload to get their full profile/username correctly
      // But we do this OUTSIDE the state setter to avoid conflicts
      const senderId = msg.senderId;
      if (!conversations.some(c => c.userId === senderId)) {
          // Debounce or just let the silent update happen? 
          // For now, let's just let the optimistic update hold. 
          // If we really need to sync, we can call loadConvos() here, but NOT waiting for it.
          loadConvos();
      }
    };

    // unread_count_update: update badge in sidebar without full refetch
    const handleUnreadUpdate = ({ fromUserId, unreadCount }: { fromUserId: string; fromUsername: string; unreadCount: number }) => {
      const activeUserId = activeChatRef.current?.userId;
      setConversations(prev =>
        prev.map(c =>
          c.userId === fromUserId
            ? { ...c, unreadCount: activeUserId === fromUserId ? 0 : unreadCount }
            : c
        )
      );
    };

    // typing indicator
    const handleTyping = ({ senderId }: { senderId: string }) => {
      if (senderId === activeChatRef.current?.userId) {
        setIsOtherTyping(true);
        if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
        stopTypingTimerRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
      }
    };

    const handleStopTyping = ({ senderId }: { senderId: string }) => {
      if (senderId === activeChatRef.current?.userId) setIsOtherTyping(false);
    };

    // message_updated: handle edits and unsend events
    const handleMessageUpdated = (updatedMsg: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id === updatedMsg.messageId || (m as any)._id === updatedMsg.messageId) {
           return { 
             ...m, 
             ...updatedMsg,
             // If unsent, clear content
             content: updatedMsg.isUnsent ? '' : (updatedMsg.isEdited ? (updatedMsg.encryptedContent || m.content) : m.content), 
             // Ideally we re-decrypt here. For now we assume optimistic update or refetch.
             isEdited: updatedMsg.isEdited || m.isEdited,
             isUnsent: updatedMsg.isUnsent || m.isUnsent
           }; 
        }
        return m;
      }));
      
      // If we were editing this message, stop editing mode
      if (editingMessage?.id === updatedMsg.messageId) {
          setEditingMessage(null);
          setNewMessage('');
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('unread_count_update', handleUnreadUpdate);
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('unread_count_update', handleUnreadUpdate);
      socket.off('typing', handleTyping);
      socket.off('typing', handleTyping);
      socket.off('stop_typing', handleStopTyping);
      socket.off('message_updated', handleMessageUpdated);
    };
  }, [socket, user, privateKey]);

  // Load conversations list
  const loadConvos = async () => {
    if (!user) return;
    try {
      const convos = await getConversations(user.id);
      setConversations(convos);
      return convos;
    } catch (err) {
      console.error("Failed to load conversations");
      return [];
    }
  };

  useEffect(() => {
    loadConvos();
  }, [user]);

  // Handle Initial Chat Prop (From Profile Button) - ONE TIME SETUP
  // Fix: changed dependency array to only trigger when prop actually changes, and guarded against unnecessary resets
  useEffect(() => {
    if (!initialChatUsername || !user) return;
    
    // Don't reset if we are already chatting with this user
    if (activeChat?.username.toLowerCase() === initialChatUsername.toLowerCase()) return;

    const initChat = async () => {
      const currentConvos = await loadConvos();
      const existing = currentConvos?.find(c => c.username.toLowerCase() === initialChatUsername.toLowerCase());
      
      if (existing) {
        setActiveChat(existing);
      } else {
        try {
            const keyData = await getUserPublicKey(initialChatUsername);
            setActiveChat({ userId: keyData.id, username: initialChatUsername, unreadCount: 0 });
        } catch (e) {
            setError(`Cannot message ${initialChatUsername}. User key not found.`);
        }
      }
    };
    initChat();
  }, [initialChatUsername, user?.id]); // Depend on user.id not full user object to prevent loop

  // Load active chat messages & Mark Read
  useEffect(() => {
    if (!user || !activeChat || !privateKey) return;

    const loadMessages = async () => {
      setLoading(true);
      try {
        const encryptedMsgs = await getMessages(user.id, activeChat.userId);
        
          // Decrypt messages
        const decryptedPromises = encryptedMsgs.map(async (msg) => {
          const isMine = msg.senderId === user.id;
          const encryptedKey = isMine ? msg.encryptedKeyForSender : msg.encryptedKeyForReceiver;
          
          let content = "[[Decryption Error]]";
          let sharedPostId = undefined;

          try {
            content = await decryptMessage(msg.encryptedContent, msg.iv, encryptedKey, privateKey);
            
            // CHECK IF PAYLOAD IS A SHARED POST
            try {
              const trimmedContent = content.trim();
              if (trimmedContent.startsWith('{') && trimmedContent.includes('SHARE_POST')) {
                const parsed = JSON.parse(trimmedContent);
                if (parsed.type === 'SHARE_POST' && parsed.postId) {
                  sharedPostId = parsed.postId;
                  content = parsed.comment || ''; // Show comment as text, post below
                }
              }
            } catch (jsonErr) {
              // Not JSON, ignore
            }

          } catch (e) {
            console.error("Failed to decrypt msg", msg.id);
          }

          // Normalize _id -> id (Critical check for historical messages)
          const normalizedId = (msg as any)._id ?? msg.id;

          return {
            ...msg,
            id: normalizedId, // Ensure ID is present
            content: msg.isUnsent ? '' : content, // Don't show content if unsent
            isMine,
            sharedPostId
          } as DecryptedMessage;
        });

        const decrypted = await Promise.all(decryptedPromises);
        setMessages(decrypted);

        // Fetch shared post data (with error state tracking)
        const postIdsToFetch = decrypted
          .filter(m => m.sharedPostId)
          .map(m => m.sharedPostId as string);

        if (postIdsToFetch.length > 0) {
          postIdsToFetch.forEach(pid => {
             if (!sharedPostsCache[pid]) {
               getSinglePost(pid)
                 .then(p => setSharedPostsCache(prev => ({ ...prev, [pid]: p })))
                 .catch(() => setSharedPostsCache(prev => ({ ...prev, [pid]: 'ERROR' })));
             }
          });
        }

        // Mark messages as read if there are unread ones
        if (activeChat.unreadCount > 0) {
           await markMessagesRead(user.id, activeChat.userId);
           loadConvos();
        }

      } catch (err) {
        setError("Failed to load messages.");
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [activeChat, user, privateKey]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !user || !privateKey) return;

    setSending(true);
    setError(null);

    // Stop typing indicator on send
    if (socket && activeChat) {
      socket.emit('stop_typing', { recipientId: activeChat.userId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      // ─── EDIT MODE ───
      if (editingMessage) {
         const recipientData = await getUserPublicKey(activeChat.username);
         const encryptedPayload = await encryptMessage(newMessage, recipientData.publicKey, user.publicKey!);
         
         await editMessage(editingMessage.id, encryptedPayload.encryptedContent);
         
         // Optimistic Update
         setMessages(prev => prev.map(m => m.id === editingMessage.id ? { ...m, content: newMessage, isEdited: true } : m));
         setEditingMessage(null);
         setNewMessage('');
         setSending(false);
         return;
      }

      // ─── SEND MODE ───
      const recipientData = await getUserPublicKey(activeChat.username);
      if (!user.publicKey) throw new Error('You do not have a public key. Please re-register.');

      const encryptedPayload = await encryptMessage(
        newMessage,
        recipientData.publicKey,
        user.publicKey
      );

      const msg = await sendMessage(
        user.id,
        activeChat.userId,
        encryptedPayload.encryptedContent,
        encryptedPayload.iv,
        encryptedPayload.encryptedKeyForReceiver,
        encryptedPayload.encryptedKeyForSender,
        replyingTo?.id // Include reply ID
      );

      // Optimistic UI: use canonical id to prevent duplicate with socket echo
      const decryptedMsg: DecryptedMessage = {
        ...msg,
        id: msg.id || (msg as any)._id,
        content: newMessage,
        isMine: true,
        replyTo: replyingTo ? (replyingTo as any) : undefined, // Optimistic reply reference
        isUnsent: false
      };
      
      setMessages(prev => {
        if (prev.some(m => m.id === decryptedMsg.id)) return prev;
        return [...prev, decryptedMsg];
      });
      setNewMessage('');
      setReplyingTo(null); // Clear reply
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleReply = (msg: DecryptedMessage) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    setContextMenuId(null);
    // Focus input (optional ref needed)
  };

  const handleEdit = (msg: DecryptedMessage) => {
    setEditingMessage(msg);
    setNewMessage(msg.content);
    setReplyingTo(null);
    setContextMenuId(null);
  };

  const handleDelete = async (msg: DecryptedMessage) => {
    if (!window.confirm("Delete this message just for you?")) return;
    try {
        await deleteMessage(msg.id);
        // Remove locally
        setMessages(prev => prev.filter(m => m.id !== msg.id));
    } catch (e: any) {
        console.error("Delete failed:", e);
        alert(`Failed to delete: ${e.message || 'Unknown error'}`);
    }
    setContextMenuId(null);
  };

  const handleUnsend = async (msg: DecryptedMessage) => {
    if (!window.confirm("Unsend for everyone?")) return;
    try {
        await unsendMessage(msg.id);
        // Update locally
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isUnsent: true, content: '' } : m));
    } catch (e: any) {
        console.error("Unsend failed:", e);
        alert(`Failed to unsend: ${e.message || 'Unknown error'}`);
    }
    setContextMenuId(null);
  };

  // Emit typing events (debounced — one emit per 1.5s while typing)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (!socket || !activeChat) return;

    // Emit typing
    if (!typingTimeoutRef.current) {
      socket.emit('typing', { recipientId: activeChat.userId });
    }
    // Reset debounce
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { recipientId: activeChat.userId });
      typingTimeoutRef.current = null;
    }, 1500);
  };

  const [startingChat, setStartingChat] = useState(false);

  const startNewChat = async () => {
    const trimmed = newChatUsername.trim();
    if (!trimmed) return;
    
    console.log('[Messages] startNewChat called with username:', trimmed);
    setStartingChat(true);
    setError(null);
    
    try {
      console.log('[Messages] Calling getUserPublicKey for:', trimmed);
      const recipient = await getUserPublicKey(trimmed);
      console.log('[Messages] Got recipient:', recipient);
      
      const newContact: ConversationSummary = { userId: recipient.id, username: trimmed, unreadCount: 0 };
      
      if (!conversations.find(c => c.userId === recipient.id)) {
        setConversations(prev => [...prev, newContact]);
      }
      setActiveChat(newContact);
      setShowNewChatInput(false);
      setNewChatUsername('');
    } catch (err: any) {
      console.error('[Messages] startNewChat failed:', err);
      setError(err.message || "User not found or secure messaging disabled.");
    } finally {
      setStartingChat(false);
    }
  };

  if (!privateKey) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Decryption Key Missing</h2>
        <p className="text-gray-400 text-sm max-w-sm">Your private identity key is not present on this device. Existing encrypted messages cannot be read.</p>
        <p className="mt-3 text-xs text-gray-600">To fix: Login from the device where you registered, or create a new identity.</p>
      </div>
    );
  }

  // Helper to get initials for avatar
  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  /**
   * Safe timestamp formatter.
   * Covers msg.timestamp AND msg.createdAt (MongoDB field name).
   * Returns empty string on invalid date so nothing is rendered.
   */
  const formatTime = (msg: DecryptedMessage): string => {
    const raw = (msg as any).createdAt ?? msg.timestamp;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Guard: catch raw SHARE_POST JSON that slipped through parsing.
   * If this returns true, the text must NOT be rendered in the bubble.
   */
  const looksLikeShareJson = (text: string): boolean => {
    const t = text.trim();
    return t.startsWith('{') && t.includes('SHARE_POST');
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100dvh-130px)] md:h-[calc(100dvh-140px)] min-h-[420px] rounded-2xl border border-white/8 bg-[#111111]">

      {/* ── SIDEBAR ── */}
      <div className={`flex flex-col bg-[#111111] md:w-[320px] shrink-0 md:border-r border-white/8 h-full ${activeChat ? 'hidden md:flex' : 'flex'}`}>

        {/* Sidebar Header */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Messages</h2>
            <button
              onClick={() => setShowNewChatInput(!showNewChatInput)}
              className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/12 flex items-center justify-center text-white transition-colors"
              title="New Message"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              id="msg-search"
              name="msg-search"
              type="text"
              autoComplete="off"
              placeholder="Search messages"
              value={messageSearchQuery}
              onChange={e => setMessageSearchQuery(e.target.value)}
              className="w-full bg-white/6 rounded-full py-2 pl-9 pr-4 text-sm text-gray-300 placeholder-gray-500 border border-transparent focus:border-white/15 focus:bg-white/10 outline-none transition-all"
            />
          </div>
        </div>

        {/* New Chat Input — always visible when showNewChatInput */}
        {showNewChatInput && (
          <div className="px-4 pb-3 shrink-0">
            <div className="flex gap-2">
              <input
                id="new-chat-username"
                name="new-chat-username"
                type="text"
                autoComplete="off"
                className="flex-1 bg-white/6 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-white/25 outline-none transition-all"
                placeholder="Enter username..."
                value={newChatUsername}
                onChange={e => {
                  setNewChatUsername(e.target.value);
                  setError(null);
                }}
                onKeyDown={e => e.key === 'Enter' && !startingChat && startNewChat()}
                autoFocus
                disabled={startingChat}
              />
              <button
                onClick={startNewChat}
                disabled={startingChat || !newChatUsername.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-semibold rounded-full hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingChat ? '...' : 'Start'}
              </button>
            </div>
            {error && <p className="text-xs text-red-400 mt-2 px-2">⚠ {error}</p>}
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && !showNewChatInput && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <ShieldCheck className="w-7 h-7 text-gray-600" />
              </div>
              <p className="text-sm text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-600 mt-1">Start an encrypted chat</p>
            </div>
          )}

          {filteredConversations.length === 0 && messageSearchQuery.trim() && (
            <p className="text-xs text-gray-500 text-center py-4 px-4">No conversations match "{messageSearchQuery}"</p>
          )}

          {filteredConversations.map(chat => (
            <div
              key={chat.userId}
              onClick={() => setActiveChat(chat)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${
                activeChat?.userId === chat.userId
                  ? 'bg-white/8'
                  : 'hover:bg-white/5'
              }`}
            >

              
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-black-500 to-yellow-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  {getInitials(chat.username)}
                </div>
                {/* Online indicator */}
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#111111]" />
                {chat.unreadCount > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1 border-2 border-[#111111]">
                    <span className="text-[10px] text-white font-bold">{chat.unreadCount}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold truncate ${activeChat?.userId === chat.userId ? 'text-white' : 'text-gray-200'}`}>
                    {chat.username}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); onViewProfile(chat.username); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all"
                    title="View Profile"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <p className={`text-xs truncate mt-0.5 ${chat.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-500'}`}>
                  {chat.unreadCount > 0 ? `${chat.unreadCount} new message${chat.unreadCount > 1 ? 's' : ''}` : 'Tap to open chat'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* E2EE badge at bottom */}
        <div className="px-4 py-3 border-t border-white/5 shrink-0">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-600">
            <Lock className="w-3 h-3" />
            <span>End-to-End Encrypted</span>
          </div>
        </div>
      </div>

      {/* ── CHAT WINDOW ── */}
      <div className={`flex flex-col bg-[#0d0d0d] flex-1 min-w-0 h-full ${!activeChat ? 'hidden md:flex' : 'flex'}`}>

        {!activeChat ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center mb-4">
              <ShieldCheck className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Your messages</h3>
            <p className="text-sm text-gray-500 max-w-xs">Send private, encrypted messages to a friend.</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 bg-[#0d0d0d] shrink-0 z-10">
              <button
                onClick={() => setActiveChat(null)}
                className="md:hidden p-2 rounded-full hover:bg-white/8 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* Avatar */}
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow">
                  {getInitials(activeChat.username)}
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#0d0d0d]" />
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onViewProfile(activeChat.username)}
                  className="block text-sm font-semibold text-white hover:text-purple-300 transition-colors truncate text-left"
                >
                  {activeChat.username}
                </button>
                {isOtherTyping ? (
                  <span className="flex items-center gap-1 text-[11px] text-green-400">
                    <span className="inline-flex gap-0.5 items-end">
                      <span className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    typing...
                  </span>
                ) : (
                  <span className="text-[11px] text-green-400">Active now</span>
                )}
              </div>

              <button
                onClick={() => onViewProfile(activeChat.username)}
                className="p-2 rounded-full hover:bg-white/8 text-gray-400 hover:text-gray-200 transition-colors"
                title="View profile"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Area */}
            <div 
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1 block"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse" />
                  <p className="text-xs text-gray-500">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg shadow-purple-900/30">
                    {getInitials(activeChat.username)}
                  </div>
                  <p className="font-semibold text-white">{activeChat.username}</p>
                  <p className="text-xs text-gray-500 mt-1">Say hi! Your message is end-to-end encrypted.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const prevMsg = messages[i - 1];
                    const isFirst = !prevMsg || prevMsg.isMine !== msg.isMine;
                    const nextMsg = messages[i + 1];
                    const isLast = !nextMsg || nextMsg.isMine !== msg.isMine;

                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.15 }}
                        className={`flex items-end gap-2 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'} ${isFirst ? 'mt-3' : 'mt-0.5'}`}
                      >
                        {/* Avatar (only on last message in group for received) */}
                        <div className="w-7 h-7 shrink-0">
                          {!msg.isMine && isLast && (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                              {getInitials(activeChat.username)}
                            </div>
                          )}
                        </div>

                        {/* Bubble */}
                        <div className="flex flex-col min-w-0 max-w-[72%] sm:max-w-[60%] relative group">
                          
                          {/* Message Actions Menu (Long press / click support) */}
                          {/* Trigger */}
                          <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setContextMenuId(prev => prev === msg.id ? null : msg.id); 
                            }}
                            className={`absolute top-0 -right-8 p-1 text-gray-500 hover:text-white opacity-50 hover:opacity-100 transition-opacity ${msg.isMine ? '-left-8 right-auto' : '-right-8'}`}
                          >
                             <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Menu Popup */}
                          {/* Menu Popup: Only render if contextMenuId matches AND msg.id is valid */}
                          {contextMenuId === msg.id && msg.id && (
                             <div 
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute z-50 bg-[#222] border border-white/10 rounded-lg shadow-xl py-1 w-32 ${msg.isMine ? 'right-full mr-2' : 'left-full ml-2'} top-0`}
                             >
                                <button onClick={() => handleReply(msg)} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 flex items-center gap-2">
                                    <Reply className="w-3 h-3" /> Reply
                                </button>
                                {msg.isMine && !msg.isUnsent && (
                                    <>
                                        <button onClick={() => handleEdit(msg)} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 flex items-center gap-2">
                                            <Edit2 className="w-3 h-3" /> Edit
                                        </button>
                                        <button onClick={() => handleUnsend(msg)} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2">
                                            <X className="w-3 h-3" /> Unsend
                                        </button>
                                    </>
                                )}
                                <button onClick={() => handleDelete(msg)} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2">
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                             </div>
                          )}

                          <div
                            className={`px-4 py-2.5 text-sm leading-relaxed break-words overflow-hidden ${
                              msg.isMine
                                ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-purple-900/30'
                                : 'bg-[#2a2a2a] text-gray-100'
                            } ${isFirst && isLast ? 'rounded-2xl' : msg.isMine
                              ? `${isFirst ? 'rounded-t-2xl rounded-bl-2xl' : ''} ${isLast ? 'rounded-b-2xl rounded-bl-2xl' : ''} ${!isFirst && !isLast ? 'rounded-l-2xl rounded-r-md' : ''} rounded-br-md`
                              : `${isFirst ? 'rounded-t-2xl rounded-br-2xl' : ''} ${isLast ? 'rounded-b-2xl rounded-br-2xl' : ''} ${!isFirst && !isLast ? 'rounded-r-2xl rounded-l-md' : ''} rounded-bl-md`
                            }`}
                          >
                            {/* Reply Quote */}
                            {msg.replyTo && (
                                <div className={`mb-2 pl-2 border-l-2 ${msg.isMine ? 'border-white/30' : 'border-purple-500'} text-xs opacity-80`}>
                                   <div className="font-bold mb-0.5">Replying to message</div>
                                   <div className="truncate italic">{(msg.replyTo as any).encryptedContent ? '...' : 'Original message'}</div>
                                </div>
                            )}

                            {/* Text — hidden if it's raw share JSON that wasn't parsed OR if Unsent */}
                            {msg.isUnsent ? (
                                <p className="italic text-gray-400 text-xs py-1">Message unsent</p>
                            ) : (
                                msg.content && !looksLikeShareJson(msg.content) && (
                                  <p className="whitespace-pre-wrap">
                                    {msg.content}
                                    {msg.isEdited && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
                                  </p>
                                )
                            )}

                            {/* Shared Post Preview */}
                            {msg.sharedPostId && (
                              <div className="mt-2">
                                {sharedPostsCache[msg.sharedPostId] === 'ERROR' ? (
                                  <div className="flex items-center gap-2 text-xs opacity-50 py-1">
                                    <Repeat className="w-3 h-3 shrink-0" />
                                    <span>Shared post unavailable</span>
                                  </div>
                                ) : sharedPostsCache[msg.sharedPostId] ? (
                                  <SharedPostPreview 
                                    post={sharedPostsCache[msg.sharedPostId] as Post} 
                                    onClick={() => {
                                      if (onNavigateToPost) {
                                        onNavigateToPost(msg.sharedPostId!);
                                      } else {
                                        window.location.hash = `#/post/${msg.sharedPostId}`; 
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2 text-xs opacity-60 py-1">
                                    <Repeat className="w-3 h-3 shrink-0 animate-spin" />
                                    <span>Loading shared post...</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Timestamp + read receipt (only on last in group) */}
                          {isLast && (
                            <div className={`flex items-center gap-1 mt-1 px-1 ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                              {formatTime(msg) && (
                                <span className="text-[10px] text-gray-600">
                                  {formatTime(msg)}
                                </span>
                              )}
                              {msg.isMine && (
                                <span className="text-[10px] text-gray-600">
                                  · {msg.isRead ? 'Seen' : 'Sent'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error banner */}
            {error && (
              <div className="mx-4 mb-2 px-3 py-2 bg-red-900/30 border border-red-700/30 rounded-xl text-xs text-red-400 text-center">
                {error}
              </div>
            )}

            {/* Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="flex flex-col px-4 py-3 border-t border-white/8 bg-[#0d0d0d] shrink-0" // Changed to column layout for stack
            >
              {/* Reply/Edit Preview Area */}
              {replyingTo && (
                  <div className="flex items-center justify-between bg-[#1a1a1a] border-l-2 border-purple-500 pl-3 pr-2 py-2 mb-2 rounded text-xs">
                      <div>
                          <span className="text-purple-400 font-bold block mb-0.5">Replying to {replyingTo.isMine ? 'Yourself' : activeChat.username}</span>
                          <span className="text-gray-400 line-clamp-1">{replyingTo.content}</span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/10 rounded">
                          <X className="w-4 h-4 text-gray-500" />
                      </button>
                  </div>
              )}
              {editingMessage && (
                  <div className="flex items-center justify-between bg-[#1a1a1a] border-l-2 border-blue-500 pl-3 pr-2 py-2 mb-2 rounded text-xs">
                       <div className="flex items-center gap-2">
                           <Edit2 className="w-3 h-3 text-blue-400" />
                           <span className="text-blue-400 font-bold">Editing message</span>
                       </div>
                       <button onClick={() => { setEditingMessage(null); setNewMessage(''); }} className="p-1 hover:bg-white/10 rounded">
                           <X className="w-4 h-4 text-gray-500" />
                       </button>
                  </div>
              )}

              <div className="flex items-center gap-3 w-full"> 
                <div className="flex-1 flex items-center gap-2 bg-[#222222] rounded-full px-4 py-2.5 border border-white/8 focus-within:border-purple-500/40 transition-colors">
                  <input
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                  placeholder="Message..."
                  value={newMessage}
                  onChange={handleInputChange}
                  disabled={sending}
                />
              </div>
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  newMessage.trim()
                    ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-purple-900/30 hover:opacity-90'
                    : 'bg-white/8 text-gray-600 cursor-not-allowed'
                }`}
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};