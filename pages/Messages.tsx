import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Send, User, MessageSquare, AlertTriangle, ChevronRight, Hash, ShieldCheck, ExternalLink, ArrowLeft, Repeat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getConversations, getMessages, sendMessage, getUserPublicKey, markMessagesRead, getSinglePost, translateText } from '../services/mockBackend';
import { encryptMessage, decryptMessage } from '../services/cryptoService';
import { Message, DecryptedMessage, ConversationSummary, Post } from '../types';
import { Button } from '../components/UI';
import { PostCard } from '../components/PostCard';
import { Globe } from 'lucide-react';

interface MessagesProps {
  initialChatUsername?: string;
  onViewProfile: (username: string) => void;
}

export const Messages: React.FC<MessagesProps> = ({ initialChatUsername, onViewProfile }) => {
  const { user, privateKey } = useAuth();
  const { socket } = useSocket();
  
  // UI State
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  
  // Shared Post Data Cache
  const [sharedPostsCache, setSharedPostsCache] = useState<Record<string, Post>>({});

  // Translation State
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  const handleTranslateMessage = async (msgId: string, content: string) => {
    if (translatedMessages[msgId]) {
        // Toggle off
        setTranslatedMessages(prev => {
            const next = { ...prev };
            delete next[msgId];
            return next;
        });
        return;
    }

    setTranslatingIds(prev => new Set(prev).add(msgId));
    try {
        const result = await translateText(content);
        setTranslatedMessages(prev => ({ ...prev, [msgId]: result.translatedText }));
    } catch (e) {
        alert('Translation failed');
    } finally {
        setTranslatingIds(prev => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
        });
    }
  };
  
  // Logic State
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [showNewChatInput, setShowNewChatInput] = useState(false);

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

      const decrypted: DecryptedMessage = { ...msg, content, isMine, sharedPostId };

      // Only append if this message belongs to the active conversation
      const chat = activeChatRef.current;
      if (chat && (msg.senderId === chat.userId || msg.receiverId === chat.userId)) {
        setMessages(prev => {
          // Deduplicate: skip if a message with this id already exists
          if (prev.some(m => m.id === (msg as any)._id || m.id === msg.id)) return prev;
          return [...prev, decrypted];
        });
      }

      // Move or add sender to top of conversations with updated unread
      setConversations(prev => {
        const senderId = msg.senderId;
        const existing = prev.find(c => c.userId === senderId);
        if (existing) {
          const active = activeChatRef.current;
          return prev.map(c =>
            c.userId === senderId
              ? { ...c, unreadCount: active?.userId === senderId ? 0 : c.unreadCount + 1 }
              : c
          );
        }
        // New conversation — refresh list from server
        loadConvos();
        return prev;
      });
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

    socket.on('receive_message', handleReceiveMessage);
    socket.on('unread_count_update', handleUnreadUpdate);
    socket.on('typing', handleTyping);
    socket.on('stop_typing', handleStopTyping);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('unread_count_update', handleUnreadUpdate);
      socket.off('typing', handleTyping);
      socket.off('stop_typing', handleStopTyping);
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

  // Handle Initial Chat Prop (From Profile Button)
  useEffect(() => {
    const initChat = async () => {
      if (initialChatUsername && user) {
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
      }
    };
    initChat();
  }, [initialChatUsername, user]);

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

          return {
            ...msg,
            content,
            isMine,
            sharedPostId
          } as DecryptedMessage;
        });

        const decrypted = await Promise.all(decryptedPromises);
        setMessages(decrypted);

        // Fetch shared post data
        const postIdsToFetch = decrypted
          .filter(m => m.sharedPostId)
          .map(m => m.sharedPostId as string);

        if (postIdsToFetch.length > 0) {
          postIdsToFetch.forEach(pid => {
             if (!sharedPostsCache[pid]) {
               getSinglePost(pid)
                 .then(p => setSharedPostsCache(prev => ({ ...prev, [pid]: p })))
                 .catch(() => {});
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
        encryptedPayload.encryptedKeyForSender
      );

      // Optimistic UI: show the message immediately on sender's side
      const decryptedMsg: DecryptedMessage = {
        ...msg,
        content: newMessage,
        isMine: true
      };
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, decryptedMsg];
      });
      setNewMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
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

  const startNewChat = async () => {
    if (!newChatUsername.trim()) return;
    try {
      const recipient = await getUserPublicKey(newChatUsername);
      const newContact: ConversationSummary = { userId: recipient.id, username: newChatUsername, unreadCount: 0 };
      
      if (!conversations.find(c => c.userId === recipient.id)) {
        setConversations([...conversations, newContact]);
      }
      setActiveChat(newContact);
      setShowNewChatInput(false);
      setNewChatUsername('');
    } catch (err: any) {
      setError(err.message || "User not found or secure messaging disabled.");
    }
  };

  if (!privateKey) {
    return (
      <div className="text-center py-20 border border-neon-red/30 bg-neon-red/5 text-neon-red font-mono p-8 rounded-sm">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">DECRYPTION KEY MISSING</h2>
        <p>Your private identity key is not present on this device. <br/>Existing encrypted messages cannot be read.</p>
        <p className="mt-4 text-xs opacity-70">To fix: Login from the device where you registered, or create a new identity.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 md:gap-6 h-[calc(100dvh-130px)] md:h-[calc(100dvh-140px)] min-h-[420px]">
      
      {/* Sidebar / Conversation List */}
      <div className={`flex flex-col bg-[#0f0f0f] border border-white/5 rounded-sm h-full ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-white/5 flex justify-between items-center shrink-0">
          <h2 className="font-mono font-bold text-gray-200 flex items-center gap-2">
            <Lock className="w-4 h-4 text-neon-green" />
            SECURE_COMMS
          </h2>
          <button 
            onClick={() => setShowNewChatInput(!showNewChatInput)}
            className="text-xs text-neon-purple hover:text-white transition-colors"
          >
            + NEW
          </button>
        </div>

        {showNewChatInput && (
          <div className="p-4 border-b border-white/5 bg-white/5 shrink-0">
             <div className="flex gap-2">
               <input 
                 className="flex-1 bg-black border border-white/10 p-2 text-xs text-white font-mono focus:border-neon-purple outline-none w-full"
                 placeholder="Enter username"
                 value={newChatUsername}
                 onChange={e => setNewChatUsername(e.target.value)}
               />
               <button onClick={startNewChat} className="bg-neon-purple/20 text-neon-purple px-3 text-xs border border-neon-purple/50">
                 GO
               </button>
             </div>
             {error && <div className="text-[10px] text-neon-red mt-2">{error}</div>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && !showNewChatInput && (
            <div className="p-8 text-center text-gray-600 text-xs font-mono">
              NO ACTIVE CHANNELS
            </div>
          )}
          {conversations.map(chat => (
            <div 
              key={chat.userId}
              onClick={() => setActiveChat(chat)}
              className={`p-4 border-b border-white/5 cursor-pointer transition-colors flex items-center justify-between group ${activeChat?.userId === chat.userId ? 'bg-white/5 border-l-2 border-l-neon-green' : 'hover:bg-white/5'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                 <div className="relative shrink-0">
                    <div className="w-8 h-8 bg-black border border-white/10 flex items-center justify-center text-gray-500 rounded-sm">
                      <User className="w-4 h-4" />
                    </div>
                    {chat.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-neon-red rounded-full flex items-center justify-center border border-black">
                         <span className="sr-only">Unread</span>
                      </div>
                    )}
                 </div>
                 <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm truncate ${activeChat?.userId === chat.userId ? 'text-white' : 'text-gray-400'}`}>
                        {chat.username}
                        </span>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewProfile(chat.username);
                            }}
                            className={`p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ${activeChat?.userId === chat.userId ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-600 hover:text-neon-purple hover:bg-white/5'}`}
                            title="View Public Profile"
                        >
                           <ExternalLink className="w-3 h-3" />
                        </button>
                    </div>
                    {chat.unreadCount > 0 && (
                      <span className="text-[9px] text-neon-green font-mono">{chat.unreadCount} UNREAD</span>
                    )}
                 </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`md:col-span-1 bg-[#0f0f0f] border border-white/5 rounded-sm flex-col relative h-full ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none"></div>

        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 font-mono">
             <ShieldCheck className="w-16 h-16 mb-4 opacity-20" />
             <p>SELECT_FREQUENCY</p>
             <p className="text-xs mt-2 opacity-50">End-to-End Encryption Active</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="p-3 md:p-4 border-b border-white/5 flex items-center justify-between bg-black/20 z-10 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveChat(null)} 
                  className="md:hidden text-gray-400 hover:text-white p-1"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <button 
                    onClick={() => onViewProfile(activeChat.username)}
                    className="block font-mono font-bold text-white tracking-wide hover:text-neon-purple hover:underline underline-offset-4 decoration-neon-purple/50 transition-all text-left truncate max-w-[150px] sm:max-w-[200px]"
                    title="View Public Profile"
                  >
                    @{activeChat.username}
                  </button>
                  {isOtherTyping ? (
                    <span className="flex items-center gap-1 text-[10px] text-neon-green font-mono animate-pulse">
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 bg-neon-green rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-neon-green rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-neon-green rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      TRANSMITTING...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-neon-green font-mono uppercase">
                      <Lock className="w-3 h-3" /> Encrypted Connection
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 z-10 scrollbar-thin scrollbar-thumb-gray-800">
              {loading ? (
                <div className="text-center text-xs text-neon-green font-mono animate-pulse mt-10">
                  DECRYPTING_STREAM...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-xs text-gray-600 font-mono mt-10 border border-dashed border-white/10 p-4 inline-block mx-auto rounded">
                  CHANNEL OPEN. START TRANSMISSION.
                </div>
              ) : (
                messages.map((msg, i) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[88%] sm:max-w-[80%] p-3 rounded-sm font-sans text-sm leading-relaxed border break-words overflow-wrap-anywhere ${
                      msg.isMine 
                        ? 'bg-neon-purple/10 border-neon-purple/20 text-gray-200' 
                        : 'bg-white/5 border-white/10 text-gray-300'
                    }`}>
                      {translatedMessages[msg.id] || msg.content}
                      
                      {translatedMessages[msg.id] && (
                        <div className="text-[9px] text-neon-green mt-1 font-mono flex items-center gap-1 border-t border-white/5 pt-1">
                             <Globe className="w-3 h-3" /> Translated
                        </div>
                      )}
                      
                      <div className="flex justify-end mt-1">
                        <button 
                            onClick={() => handleTranslateMessage(msg.id, msg.content)}
                            className="text-[9px] text-gray-500 hover:text-white flex items-center gap-1"
                        >
                            <Globe className="w-3 h-3" /> 
                            {translatingIds.has(msg.id) ? '...' : (translatedMessages[msg.id] ? 'ORIGINAL' : 'TRANSLATE')}
                        </button>
                      </div>
                      
                      {/* SHARED POST RENDERER */}
                      {msg.sharedPostId && (
                        <div className="mt-3">
                          {sharedPostsCache[msg.sharedPostId] ? (
                            <PostCard 
                              post={sharedPostsCache[msg.sharedPostId]} 
                              isEmbedded={true}
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono p-2 border border-dashed border-white/10 bg-black/20">
                              <Repeat className="w-3 h-3" />
                              Fetching encrypted signal...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 px-1">
                      <span className="text-[9px] text-gray-600 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      {msg.isMine && (
                         <span className="text-[9px] font-mono text-gray-600">
                           {msg.isRead ? 'READ' : 'SENT'}
                         </span>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 md:p-4 border-t border-white/5 bg-black/40 z-10 flex gap-2 md:gap-3 shrink-0">
              <input 
                className="flex-1 bg-black border border-white/10 p-3 text-sm text-white font-sans focus:border-neon-green outline-none rounded-sm transition-colors"
                placeholder="Type a secure message..."
                value={newMessage}
                onChange={handleInputChange}
                disabled={sending}
              />
              <Button type="submit" isLoading={sending} disabled={!newMessage.trim()} className="!px-4">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};