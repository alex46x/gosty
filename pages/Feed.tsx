import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Hash, RefreshCw } from 'lucide-react';
import { getFeed } from '../services/mockBackend';
import { Post } from '../types';
import { Button } from '../components/UI';
import { CreatePost } from './CreatePost';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface FeedProps {
  onUserClick?: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
}

type FeedMode = 'for_you' | 'latest';

const FEED_POLL_INTERVAL_MS = 12000;
const MAX_FEED_SIZE = 100;

const getPostTime = (post: Post): number => {
  if (!post) return 0;
  if (post.updatedAt) return new Date(post.updatedAt).getTime();
  return new Date(post.timestamp).getTime();
};

const mergeUniquePosts = (posts: Post[]): Post[] => {
  const map = new Map<string, Post>();

  posts.forEach((post) => {
    if (!post?.id) return;
    const existing = map.get(post.id);

    if (!existing) {
      map.set(post.id, post);
      return;
    }

    map.set(post.id, getPostTime(post) >= getPostTime(existing) ? post : existing);
  });

  return Array.from(map.values());
};

const diversifyByAuthor = (posts: Post[]): Post[] => {
  const queue = [...posts];
  const diversified: Post[] = [];

  while (queue.length > 0) {
    const lastAuthor = diversified[diversified.length - 1]?.authorId;
    const nextIndex = queue.findIndex((post) => post.authorId !== lastAuthor);

    if (nextIndex === -1) {
      diversified.push(queue.shift() as Post);
      continue;
    }

    const [next] = queue.splice(nextIndex, 1);
    diversified.push(next);
  }

  return diversified;
};

const rankForYou = (posts: Post[]): Post[] => {
  const now = Date.now();

  const scored = posts.map((post) => {
    const postAgeHours = Math.max(0, (now - getPostTime(post)) / (1000 * 60 * 60));
    const freshnessScore = Math.max(0, (72 - postAgeHours) / 72);
    const engagementScore = Math.log1p((post.likes || 0) * 2 + (post.commentCount || 0) * 3);
    const publicBonus = post.isAnonymous ? 0 : 0.2;
    const ownerPenalty = post.isMine ? -0.05 : 0;

    const score = freshnessScore * 0.65 + engagementScore * 0.3 + publicBonus + ownerPenalty;

    return { post, score };
  });

  const sorted = scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getPostTime(b.post) - getPostTime(a.post);
    })
    .map((entry) => entry.post);

  return diversifyByAuthor(sorted);
};

const applyFeedMode = (posts: Post[], mode: FeedMode): Post[] => {
  const valid = mergeUniquePosts(posts).filter((post) => !!post?.id);

  if (mode === 'latest') {
    return valid.sort((a, b) => getPostTime(b) - getPostTime(a));
  }

  return rankForYou(valid);
};

export const Feed: React.FC<FeedProps> = ({ onUserClick, onHashtagClick }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<FeedMode>('for_you');
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(Date.now());
  const [livePostCount, setLivePostCount] = useState(0);

  const displayPosts = useMemo(() => applyFeedMode(posts, feedMode), [posts, feedMode]);

  const loadFeed = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (silent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const data = await getFeed(user?.id);

        if (!Array.isArray(data)) {
          if (!silent) {
            setPosts([]);
            setError('Received invalid data format from server.');
          }
          return;
        }

        setPosts((prev) => {
          if (!silent) return mergeUniquePosts(data).slice(0, MAX_FEED_SIZE);
          return mergeUniquePosts([...data, ...prev]).slice(0, MAX_FEED_SIZE);
        });

        setLastSyncedAt(Date.now());
        setLivePostCount(0);
      } catch (err: any) {
        console.error('Failed to load feed:', err);

        if (!silent) {
          setPosts([]);
          setError(err.message || 'Failed to load feed. Please try again.');
        }
      } finally {
        if (silent) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [user?.id]
  );

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadFeed({ silent: true });
    }, FEED_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadFeed]);

  useEffect(() => {
    const handleWindowFocus = () => {
      loadFeed({ silent: true });
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [loadFeed]);

  useEffect(() => {
    if (!socket) return;

    const handleNewPost = (newPost: Post) => {
      if (!newPost?.id) return;

      setPosts((prevPosts) => {
        const existingIndex = prevPosts.findIndex((post) => post.id === newPost.id);

        if (existingIndex >= 0) {
          const next = [...prevPosts];
          next[existingIndex] = { ...prevPosts[existingIndex], ...newPost };
          return next;
        }

        return mergeUniquePosts([newPost, ...prevPosts]).slice(0, MAX_FEED_SIZE);
      });

      if (!user || newPost.authorId !== user.id) {
        setLivePostCount((count) => count + 1);
      }

      setLastSyncedAt(Date.now());
    };

    socket.on('new_post', handleNewPost);

    return () => {
      socket.off('new_post', handleNewPost);
    };
  }, [socket, user?.id]);

  const handlePostSuccess = () => {
    setIsCreating(false);
    loadFeed({ silent: true });
  };

  const handlePostUpdate = (updatedPost: Post) => {
    setPosts((prev) => prev.map((post) => (post.id === updatedPost.id ? updatedPost : post)));
  };

  const handlePostDelete = (postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  };

  const formatTime = (timeMs: number) => {
    return new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 mb-8 border-b border-white/5 pb-6">
        <div className="flex flex-row items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white font-mono tracking-tight">PUBLIC_FEED</h1>
            <p className="text-gray-500 text-xs mt-2 font-mono flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${socket ? 'bg-neon-green' : 'bg-yellow-500'}`}></span>
              {socket ? 'LIVE_STREAM_ON' : 'SYNC_MODE'} | UPDATED_{formatTime(lastSyncedAt)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => loadFeed()}
              disabled={loading || isRefreshing}
              className="!py-2 !px-3 md:!px-4 !text-xs"
            >
              <RefreshCw className={`w-4 h-4 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} /> REFRESH
            </Button>

            {!isCreating && (
              <Button onClick={() => setIsCreating(true)} className="!py-2 !px-3 md:!px-4 !text-xs md:!text-sm">
                <Plus className="w-4 h-4" /> BROADCAST
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex border border-white/10 bg-black/30 rounded-sm overflow-hidden">
            <button
              onClick={() => setFeedMode('for_you')}
              className={`px-3 py-2 text-[11px] font-mono tracking-wider transition-colors ${
                feedMode === 'for_you' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              FOR_YOU
            </button>
            <button
              onClick={() => setFeedMode('latest')}
              className={`px-3 py-2 text-[11px] font-mono tracking-wider transition-colors ${
                feedMode === 'latest' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              LATEST
            </button>
          </div>

          {livePostCount > 0 && (
            <button
              onClick={() => loadFeed({ silent: true })}
              className="text-xs font-mono text-neon-green border border-neon-green/40 bg-neon-green/10 px-3 py-1.5 rounded-sm hover:bg-neon-green/20 transition-colors"
            >
              {livePostCount} NEW POSTS | LOAD
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isCreating && <CreatePost onSuccess={handlePostSuccess} onCancel={() => setIsCreating(false)} />}
      </AnimatePresence>

      {loading ? (
        <div className="flex flex-col gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-[#0f0f0f] border border-white/5 animate-pulse rounded-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {error ? (
            <div className="text-center py-20 px-4">
              <div className="text-red-500 font-mono text-sm mb-2">CONNECTION_ERROR</div>
              <p className="text-gray-400 text-sm mb-4">{error}</p>
              <Button onClick={() => loadFeed()} variant="secondary" className="!text-xs">
                RETRY_CONNECTION
              </Button>
            </div>
          ) : displayPosts.length === 0 ? (
            <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
              <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
              NO SIGNALS DETECTED IN SECTOR.
            </div>
          ) : (
            displayPosts.map((post) => (
              <React.Fragment key={post.id}>
                <ErrorBoundary componentName={`Post_${post.id}`}>
                  <PostCard
                    post={post}
                    onUserClick={onUserClick}
                    onHashtagClick={onHashtagClick}
                    onPostUpdate={handlePostUpdate}
                    onPostDelete={handlePostDelete}
                  />
                </ErrorBoundary>
              </React.Fragment>
            ))
          )}
        </div>
      )}
    </div>
  );
};




