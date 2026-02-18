import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { getSinglePost } from '../services/mockBackend';
import { Post } from '../types';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';

interface SinglePostProps {
  postId: string | null;
  onBack: () => void;
  onUserClick: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
}

export const SinglePost: React.FC<SinglePostProps> = ({ postId, onBack, onUserClick, onHashtagClick }) => {
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      if (!postId || !user) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getSinglePost(postId, user.id);
        setPost(data);
      } catch (e) {
        setError("Transmission not found or deleted.");
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [postId, user]);

  const handlePostUpdate = (updatedPost: Post) => {
    setPost(updatedPost);
  };

  const handlePostDelete = () => {
    // If post is deleted, go back
    onBack();
  };

  return (
    <div>
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> BACK TO ALERTS
      </button>

      {loading ? (
        <div className="h-64 bg-white/5 animate-pulse rounded border border-white/10" />
      ) : error || !post ? (
        <div className="text-center py-20 border border-neon-red/30 bg-neon-red/5 text-neon-red font-mono">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          {error || "Unknown Error"}
        </div>
      ) : (
        <PostCard 
          post={post} 
          onUserClick={onUserClick} 
          onHashtagClick={onHashtagClick} 
          onPostUpdate={handlePostUpdate}
          onPostDelete={handlePostDelete}
        />
      )}
    </div>
  );
};