import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, User, EyeOff, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createPost } from '../services/mockBackend';
import { Button, Alert } from '../components/UI';

interface CreatePostProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const CreatePost: React.FC<CreatePostProps> = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [status, setStatus] = useState<'idle' | 'posting'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setError(null);
    setStatus('posting');

    try {
      // POLICY UPDATE: Automatic AI scanning disabled.
      // Content is transmitted raw to the backend.
      // Responsibility lies with the user.
      if (user) {
        // Pass 0 for toxicityScore as AI check is skipped
        await createPost(content, user.id, 0, isAnonymous);
        onSuccess();
      }
    } catch (err) {
      setError("Failed to transmit message. Network error.");
      setStatus('idle');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-graphite/30 border border-white/10 p-6 mb-8"
    >
      <h2 className="text-lg font-mono font-bold text-white mb-4 flex items-center gap-2">
        <Send className="w-4 h-4 text-neon-green" />
        BROADCAST_MESSAGE
      </h2>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type your message securely..."
          className="w-full h-32 bg-black/50 border border-white/10 p-4 text-white font-sans text-base focus:border-neon-green focus:outline-none resize-none mb-4"
          disabled={status !== 'idle'}
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Identity Toggle */}
          <div className="flex items-center gap-2 bg-black/30 p-1 rounded-full border border-white/10">
            <button
              type="button"
              onClick={() => setIsAnonymous(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${isAnonymous ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <EyeOff className="w-3 h-3" />
              ANONYMOUS
            </button>
            <button
              type="button"
              onClick={() => setIsAnonymous(false)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${!isAnonymous ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <User className="w-3 h-3" />
              PUBLIC
            </button>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={onCancel}
              disabled={status !== 'idle'}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              isLoading={status !== 'idle'}
              disabled={!content.trim()}
              className="flex-1 sm:flex-none"
            >
              {status === 'posting' ? 'Transmitting...' : 'Transmit'}
            </Button>
          </div>
        </div>
      </form>
      
      {/* Policy Footer */}
      <div className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-2 text-gray-500">
          <ShieldAlert className="w-3 h-3" />
          <span>Unmoderated Channel. User assumes full responsibility.</span>
        </div>
        {isAnonymous ? (
           <span className="text-gray-500 italic">ID encrypted. Not linked to profile.</span>
        ) : (
           <span className="text-neon-purple/80">Visible on your public profile.</span>
        )}
      </div>
    </motion.div>
  );
};