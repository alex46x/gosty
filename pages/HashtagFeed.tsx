import React, { useEffect, useState } from 'react';
import { ArrowLeft, Hash } from 'lucide-react';
import { getPostsByHashtag } from '../services/mockBackend';
import { Post } from '../types';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';

interface HashtagFeedProps {
  hashtag: string;
  onBack: () => void;
  onUserClick: (username: string) => void;
  onHashtagClick: (tag: string) => void;
}

export const HashtagFeed: React.FC<HashtagFeedProps> = ({ hashtag, onBack, onUserClick, onHashtagClick }) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!user || !hashtag) return;
      setLoading(true);
      try {
        const data = await getPostsByHashtag(hashtag, user.id);
        setPosts(data);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [hashtag, user]);

  return (
    <div>
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> BACK TO FEED
      </button>

      <div className="mb-8 border-b border-white/5 pb-6">
        <h1 className="text-3xl font-bold text-white font-mono tracking-tight flex items-center gap-2">
           <Hash className="w-8 h-8 text-neon-green" />
           {hashtag.toUpperCase()}
        </h1>
        <p className="text-gray-500 text-xs mt-2 font-mono">
           Decrypted signals matching this frequency tag.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2].map(i => (
             <div key={i} className="h-48 bg-[#0f0f0f] border border-white/5 rounded-sm" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-sm bg-white/5">
          <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-gray-500 font-mono text-sm">NO SIGNALS FOUND.</p>
        </div>
      ) : (
        <div className="space-y-6">
           {posts.map(post => (
             <PostCard 
               key={post.id} 
               post={post} 
               onUserClick={onUserClick}
               onHashtagClick={onHashtagClick}
             />
           ))}
        </div>
      )}
    </div>
  );
};