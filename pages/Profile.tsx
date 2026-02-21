import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Activity, Calendar, FileText, Hash, AlertCircle, Users } from 'lucide-react';
// import { getUserProfile, getUserPosts } from '../services/mockBackend';

import { Post, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { PostCard } from '../components/PostCard';
import { getUserPosts, getUserProfile } from '@/services/mockBackend';

interface ProfileProps {
  onHashtagClick?: (tag: string) => void;
}

export const Profile: React.FC<ProfileProps> = ({ onHashtagClick }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        // In a real app, we wouldn't need to pass the ID if the token is valid,
        // but for this mock we pass the ID which should match the JWT owner.
        const [profileData, postsData] = await Promise.all([
          getUserProfile(user.id),
          getUserPosts(user.id)
        ]);
        setProfile(profileData);
        setPosts(postsData);
      } catch (err: any) {
        console.error("Profile load error:", err);
        setError(err.message || "Failed to load profile data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handlePostUpdate = (updatedPost: Post) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handlePostDelete = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    // Update count optimistically
    if (profile) {
      setProfile({ ...profile, postCount: Math.max(0, profile.postCount - 1) });
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
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
      <div className="text-center py-20 border border-neon-red/30 bg-neon-red/5 text-neon-red font-mono">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        {error || "Profile access denied."}
      </div>
    );
  }

  return (
    <div>
      {/* Profile Header Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0f0f0f] border border-white/10 p-6 md:p-8 mb-10 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <User className="w-20 h-20 md:w-32 md:h-32" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2 text-neon-purple font-mono text-sm">
            <Activity className="w-4 h-4" />
            IDENTITY_VERIFIED
          </div>
          
          <h1 className="text-2xl md:text-4xl font-bold text-white font-mono tracking-tight mb-6 break-all">
            {profile.username}
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <Calendar className="w-3 h-3" />
                Inception
              </div>
              <div className="text-xs md:text-sm text-gray-200">
                {new Date(profile.createdAt).toLocaleDateString()}
              </div>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <FileText className="w-3 h-3" />
                Total Signals
              </div>
              <div className="text-xl text-white font-mono font-bold">
                {profile.postCount}
              </div>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <Users className="w-3 h-3" />
                Followers
              </div>
              <div className="text-xl text-white font-mono font-bold">
                {profile.followersCount ?? 0}
              </div>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1 font-mono uppercase">
                <Users className="w-3 h-3" />
                Following
              </div>
              <div className="text-xl text-white font-mono font-bold">
                {profile.followingCount ?? 0}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* User's Posts Feed */}
      <div className="mb-6 pb-4 border-b border-white/5">
        <h2 className="text-xl font-bold text-white font-mono">SIGNAL_HISTORY</h2>
        <p className="text-xs text-gray-500 font-mono mt-1">Encrypted archives of your activity.</p>
      </div>



      


      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
            <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
            NO TRANSMISSIONS LOGGED.
          </div>
        ) : (
          posts.map(post => (
            <PostCard 
              key={post.id} 
              post={post} 
              onHashtagClick={onHashtagClick}
              onPostUpdate={handlePostUpdate}
              onPostDelete={handlePostDelete}
            />
          ))
        )}
      </div>
    </div>
  );
};
