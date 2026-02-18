import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, MessageSquare, Send, X, Share2, Search, Link as LinkIcon, Check, Copy } from 'lucide-react';
import { Button } from './UI';
import { useAuth } from '../context/AuthContext';
import { getConversations, sharePostToProfile, getUserPublicKey, sendMessage } from '../services/mockBackend';
import { ConversationSummary } from '../types';
import { encryptMessage } from '../services/cryptoService';

interface ShareDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({ postId, isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<'select' | 'profile' | 'message'>('select');
  const [copied, setCopied] = useState(false);
  
  // Profile Share State
  const [comment, setComment] = useState('');
  const [isSharingProfile, setIsSharingProfile] = useState(false);

  // Message Share State
  const [contacts, setContacts] = useState<ConversationSummary[]>([]);
  const [recipient, setRecipient] = useState<ConversationSummary | null>(null);
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setMode('select');
      setCopied(false);
      setComment('');
      setRecipient(null);
      setSearchQuery('');
      if (user) {
        getConversations(user.id).then(setContacts);
      }
    }
  }, [isOpen, user]);

  const handleCopyLink = () => {
    // Generate a stable link to the post
    // In a real router, this would be /post/:id
    // Here we use query params to support the mock environment
    const link = `${window.location.origin}?post=${postId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShareToProfile = async () => {
    if (!user) return;
    setIsSharingProfile(true);
    try {
      await sharePostToProfile(postId, comment, user.id);
      onSuccess();
      onClose();
    } catch (e) {
      console.error("Share failed", e);
    } finally {
      setIsSharingProfile(false);
    }
  };

  const handleShareToMessage = async () => {
    if (!user || !recipient || !user.publicKey) return;
    setIsSendingMsg(true);
    try {
      const payload = JSON.stringify({
        type: 'SHARE_POST',
        postId: postId,
        comment: 'Check out this signal.'
      });

      const recipientData = await getUserPublicKey(recipient.username);
      const encryptedPayload = await encryptMessage(
        payload,
        recipientData.publicKey,
        user.publicKey
      );

      await sendMessage(
        user.id,
        recipient.userId,
        encryptedPayload.encryptedContent,
        encryptedPayload.iv,
        encryptedPayload.encryptedKeyForReceiver,
        encryptedPayload.encryptedKeyForSender
      );

      onSuccess();
      onClose();
    } catch (e) {
      console.error("Message share failed", e);
    } finally {
      setIsSendingMsg(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#0f0f0f] border border-white/10 w-full max-w-sm rounded-sm overflow-hidden shadow-2xl"
      >
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="font-mono font-bold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-neon-green" />
            SHARE_SIGNAL
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {mode === 'select' && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setMode('profile')}
                className="flex items-center gap-4 p-3 border border-white/5 bg-white/5 hover:bg-white/10 hover:border-neon-purple transition-all rounded-sm group text-left"
              >
                <div className="p-2 bg-neon-purple/20 rounded-full text-neon-purple group-hover:scale-110 transition-transform">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <span className="block font-mono text-sm text-gray-200 font-bold">Share to Profile</span>
                  <span className="block text-xs text-gray-500">Post to your public feed</span>
                </div>
              </button>

              <button 
                onClick={() => setMode('message')}
                className="flex items-center gap-4 p-3 border border-white/5 bg-white/5 hover:bg-white/10 hover:border-neon-green transition-all rounded-sm group text-left"
              >
                <div className="p-2 bg-neon-green/20 rounded-full text-neon-green group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <span className="block font-mono text-sm text-gray-200 font-bold">Send as Message</span>
                  <span className="block text-xs text-gray-500">Encrypt and send to contact</span>
                </div>
              </button>

              <button 
                onClick={handleCopyLink}
                className="flex items-center gap-4 p-3 border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/30 transition-all rounded-sm group text-left"
              >
                <div className={`p-2 rounded-full transition-transform group-hover:scale-110 ${copied ? 'bg-green-500/20 text-green-500' : 'bg-gray-700/30 text-gray-300'}`}>
                  {copied ? <Check className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
                </div>
                <div>
                  <span className="block font-mono text-sm text-gray-200 font-bold">{copied ? 'Link Copied!' : 'Copy Link'}</span>
                  <span className="block text-xs text-gray-500">Get a secure link to this post</span>
                </div>
              </button>
            </div>
          )}

          {mode === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-gray-500 mb-2 block">ADD_COMMENTARY</label>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-black border border-white/10 p-3 text-sm text-white font-sans focus:border-neon-purple outline-none h-24 resize-none rounded-sm"
                  placeholder="Why are you rebroadcasting this?"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setMode('select')} className="flex-1">BACK</Button>
                <Button 
                  onClick={handleShareToProfile} 
                  isLoading={isSharingProfile} 
                  className="flex-1"
                >
                  SHARE
                </Button>
              </div>
            </div>
          )}

          {mode === 'message' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input 
                  type="text"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black border border-white/10 pl-9 p-2 text-sm text-white font-mono focus:border-neon-green outline-none rounded-sm"
                  autoFocus
                />
              </div>

              <div className="h-48 overflow-y-auto border border-white/5 rounded-sm scrollbar-thin scrollbar-thumb-gray-800">
                {contacts
                  .filter(c => c.username.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(contact => (
                    <button
                      key={contact.userId}
                      onClick={() => setRecipient(contact)}
                      className={`w-full text-left p-3 flex items-center justify-between hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors ${recipient?.userId === contact.userId ? 'bg-neon-green/10' : ''}`}
                    >
                      <span className="font-mono text-sm text-gray-300">@{contact.username}</span>
                      {recipient?.userId === contact.userId && <div className="w-2 h-2 bg-neon-green rounded-full" />}
                    </button>
                  ))
                }
                {contacts.length === 0 && (
                   <div className="p-4 text-center text-xs text-gray-600 font-mono">
                     No recent contacts. Start a chat first.
                   </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setMode('select')} className="flex-1">BACK</Button>
                <Button 
                  onClick={handleShareToMessage} 
                  disabled={!recipient}
                  isLoading={isSendingMsg} 
                  className="flex-1"
                >
                  SEND
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};