import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Activity, Calendar, FileText, Hash, AlertCircle, ArrowLeft, MessageSquare, Lock } from 'lucide-react';
import { getUserPublicProfile, getUserPublicPosts } from '../services/mockBackend';
import { Post, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { Button } from '../components/UI';

interface PublicProfileProps {
  targetUsername: string;
  onBack: () => void;
  onMessage: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
}

export const PublicProfile: React.FC<PublicProfileProps> = ({ targetUsername, onBack, onMessage, onHashtagClick }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwnProfile = user?.username.toLowerCase() === targetUsername.toLowerCase();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileData, postsData] = await Promise.all([
          getUserPublicProfile(targetUsername),
          getUserPublicPosts(targetUsername, user?.id)
        ]);
        setProfile(profileData);
        setPosts(postsData);
      } catch (err) {
        setError("User not found or access denied.");
      } finally {
        setLoading(false);
      }
    };

    if (targetUsername) {
      fetchData();
    }
  }, [targetUsername, user]);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-24 bg-white/5 rounded" />
        <div className="h-40 bg-white/5 rounded border border-white/10" />
        <div className="space-y-4">
          <div className="h-32 bg-white/5 rounded" />
          <div className="h-32 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div>
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> BACK TO SEARCH
        </button>
        <div className="text-center py-20 border border-neon-red/30 bg-neon-red/5 text-neon-red font-mono">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          {error || "Profile access denied."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> BACK
      </button>

      {/* Profile Header Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0f0f0f] border border-white/10 p-6 md:p-8 mb-10 relative overflow-hidden group"
      >
        {/* Decorative Watermark */}
        <div className="absolute top-0 right-0 p-4 opacity-5 text-neon-purple">
          <User className="w-20 h-20 md:w-32 md:h-32" />
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 text-neon-purple font-mono text-sm">
                <Activity className="w-4 h-4" />
                PUBLIC_IDENTITY
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight mb-4 md:mb-6 break-all">
                {profile.username}
              </h1>
            </div>

            {/* Message Action */}
            {!isOwnProfile && (
              <Button 
                onClick={() => onMessage(profile.username)}
                className="!py-2 !px-4 !text-xs !bg-neon-green/10 !border-neon-green/30 !text-neon-green hover:!bg-neon-green hover:!text-black"
              >
                <MessageSquare className="w-4 h-4" />
                SECURE_CHAT
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <Calendar className="w-3 h-3" />
                First Seen
              </div>
              <div className="text-xs md:text-sm text-gray-200">
                {new Date(profile.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <FileText className="w-3 h-3" />
                Public Signals
              </div>
              <div className="text-xl text-white font-mono font-bold">
                {profile.postCount}
              </div>
            </div>
            
             <div className="p-4 bg-white/5 border border-white/5 rounded-sm col-span-2 flex items-center gap-4">
              <div className="p-2 bg-neon-green/10 rounded-full text-neon-green shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                 <div className="text-xs text-gray-400 font-mono mb-0.5">E2EE AVAILABLE</div>
                 <div className="text-[10px] text-gray-600 leading-tight">Messages to this user are end-to-end encrypted. Server cannot read them.</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Public Posts Feed */}
      <div className="mb-6 pb-4 border-b border-white/5">
        <h2 className="text-xl font-bold text-white font-mono">PUBLIC_TRANSMISSIONS</h2>
        <p className="text-xs text-gray-500 font-mono mt-1">
          Only non-anonymous signals are visible here.
        </p>
      </div>

      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
            <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
            NO PUBLIC SIGNALS DETECTED.
          </div>
        ) : (
          posts.map(post => (
            <PostCard 
              key={post.id} 
              post={post} 
              onHashtagClick={onHashtagClick}
            />
          ))
        )}
      </div>
    </div>
  );
};