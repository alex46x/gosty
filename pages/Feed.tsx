import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Hash } from 'lucide-react';
import { getFeed } from '../services/mockBackend';
import { Post } from '../types';
import { Button } from '../components/UI';
import { CreatePost } from './CreatePost';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface FeedProps {
  onUserClick?: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
}

// --- MAIN FEED COMPONENT ---
export const Feed: React.FC<FeedProps> = ({ onUserClick, onHashtagClick }) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const loadFeed = async () => {
    setLoading(true);
    try {
      // Pass the current user ID to determine which posts they have liked
      const data = await getFeed(user?.id);
      if (Array.isArray(data)) {
        setPosts(data);
      } else {
        console.error("Feed data is not an array:", data);
        setPosts([]);
      }
    } catch (err) {
      console.error("Failed to load feed:", err);
      // Optional: set error state to show UI feedback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [user]);

  const handlePostSuccess = () => {
    setIsCreating(false);
    loadFeed();
  };

  const handlePostUpdate = (updatedPost: Post) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handlePostDelete = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return (
    <div>
      <div className="flex flex-row items-center justify-between mb-8 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white font-mono tracking-tight">PUBLIC_FEED</h1>
          <p className="text-gray-500 text-xs mt-2 font-mono flex items-center gap-2">
            <span className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></span>
            SECURE_CONNECTION
          </p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="!py-2 !px-3 md:!px-4 !text-xs md:!text-sm">
            <Plus className="w-4 h-4" /> BROADCAST
          </Button>
        )}
      </div>

      <AnimatePresence>
        {isCreating && (
          <CreatePost 
            onSuccess={handlePostSuccess} 
            onCancel={() => setIsCreating(false)} 
          />
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex flex-col gap-6">
          {[1,2,3].map(i => (
             <div key={i} className="h-48 bg-[#0f0f0f] border border-white/5 animate-pulse rounded-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
             </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {posts?.length === 0 ? (
            <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
              <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
              NO SIGNALS DETECTED IN SECTOR.
            </div>
          ) : (
            posts?.map(post => (
              <React.Fragment key={post.id || Math.random()}>
                 {post ? (
                    <ErrorBoundary componentName={`Post_${post.id}`}>
                        <PostCard 
                            post={post} 
                            onUserClick={onUserClick}
                            onHashtagClick={onHashtagClick}
                            onPostUpdate={handlePostUpdate}
                            onPostDelete={handlePostDelete}
                        />
                    </ErrorBoundary>
                 ) : null}
              </React.Fragment>
            ))
          )}
        </div>
      )}
    </div>
  );
};