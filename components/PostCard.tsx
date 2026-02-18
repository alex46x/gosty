import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertCircle, Heart, MessageSquare, Send, CornerDownRight, X, Pencil, Check, User as UserIcon, Share2, Repeat, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { toggleLikePost, getComments, addComment, updateComment, getSinglePost, editPost, deletePost } from '../services/mockBackend';
import { Post, Comment } from '../types';
import { Button } from './UI';
import { useAuth } from '../context/AuthContext';
import { ShareDialog } from './ShareDialog';

const MAX_COMMENT_LENGTH = 280;

// Helper to render text with clickable hashtags and mentions
const ContentRenderer: React.FC<{ 
  content: string; 
  isAnonymous: boolean;
  onUserClick?: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
}> = ({ content, isAnonymous, onUserClick, onHashtagClick }) => {
  if (isAnonymous) {
    // If anonymous, render plain text (no links allowed to preserve anonymity context)
    return <p className="pl-4 text-gray-300 leading-relaxed font-sans whitespace-pre-wrap text-sm md:text-base break-words">{content}</p>;
  }

  // Regex to split by hashtags or mentions
  const parts = content.split(/((?:^|\s)(?:#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+))/g);

  return (
    <p className="pl-4 text-gray-300 leading-relaxed font-sans whitespace-pre-wrap text-sm md:text-base break-words">
      {parts.map((part, i) => {
        const trimmed = part.trim();
        
        if (trimmed.startsWith('#')) {
          const tag = trimmed.slice(1);
          return (
            <span key={i}>
              {part.replace(trimmed, '')}
              <button 
                onClick={(e) => { e.stopPropagation(); onHashtagClick?.(tag); }}
                className="text-neon-green hover:underline cursor-pointer font-bold"
              >
                #{tag}
              </button>
            </span>
          );
        }
        
        if (trimmed.startsWith('@')) {
          const username = trimmed.slice(1);
          return (
             <span key={i}>
              {part.replace(trimmed, '')}
              <button 
                onClick={(e) => { e.stopPropagation(); onUserClick?.(username); }}
                className="text-neon-purple hover:underline cursor-pointer font-bold"
              >
                @{username}
              </button>
            </span>
          );
        }

        return <span key={i}>{part}</span>;
      })}
    </p>
  );
};

// --- SUB-COMPONENT: RECURSIVE COMMENT NODE ---
export const CommentNode: React.FC<{ 
  comment: Comment; 
  allComments: Comment[]; 
  onReply: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
  depth?: number;
}> = ({ comment, allComments, onReply, onUpdate, depth = 0 }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);

  // Find children for this specific comment
  const children = allComments
    .filter(c => c.parentId === comment.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const isNested = depth > 0;
  const isAuthor = user?.id === comment.authorId;

  const handleSave = async () => {
    if (!editContent.trim()) return;
    setIsSaving(true);
    try {
      await updateComment(comment.id, editContent);
      onUpdate(comment.id, editContent);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update comment");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  return (
    <div className={`relative ${isNested ? 'mt-4' : 'mb-6'}`}>
      {/* Thread Visuals for Nested Items */}
      {isNested && (
        <>
          {/* Curved connector from parent */}
          <div className="absolute -left-[18px] md:-left-[24px] -top-5 w-4 md:w-6 h-8 border-b border-l border-white/10 rounded-bl-xl pointer-events-none" />
        </>
      )}

      {/* Main Comment Content */}
      <div className="group relative">
        <div className="flex gap-2 md:gap-3">
          {/* Avatar / Indicator */}
          <div className="flex flex-col items-center relative">
             <div className={`
               flex-shrink-0 flex items-center justify-center rounded border font-mono transition-colors relative z-10
               ${isNested 
                  ? 'w-6 h-6 text-[10px] bg-[#0f0f0f] border-white/10 text-neon-green/80' 
                  : 'w-8 h-8 text-[10px] bg-white/5 border-white/10 text-neon-purple shadow-sm'}
             `}>
                {isNested ? <CornerDownRight className="w-3 h-3" /> : '>_'}
             </div>
             
             {/* Vertical Thread Line (if has children) */}
             {children.length > 0 && (
               <div className={`absolute top-full bottom-[-16px] w-px bg-white/5 group-hover:bg-white/10 transition-colors ${isNested ? 'left-[11px]' : 'left-[15px]'}`} />
             )}
          </div>
          
          <div className="flex-1 min-w-0 pt-0.5">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`font-mono font-bold tracking-tight ${isNested ? 'text-[11px] text-neon-green/90' : 'text-xs text-neon-purple'}`}>
                {isNested ? 'REPLY_PACKET' : 'ANON_USER'}
              </span>
              <span className="text-[10px] text-gray-600 font-mono border-l border-white/10 pl-2 h-3 flex items-center">
                {new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
              {isAuthor && !isEditing && (
                 <span className="text-[9px] text-neon-purple bg-neon-purple/5 border border-neon-purple/20 px-1.5 py-0.5 rounded-sm font-mono uppercase tracking-widest opacity-80">YOU</span>
              )}
            </div>
            
            {/* Body */}
            {isEditing ? (
              <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-sm relative group/edit">
                 <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                    className="w-full bg-black/50 border border-white/10 p-3 text-sm text-white font-sans focus:outline-none focus:border-neon-green/50 rounded-sm resize-none"
                    rows={3}
                    autoFocus
                 />
                 <div className="flex items-center justify-between mt-2">
                    <span className={`text-[10px] font-mono ${editContent.length > MAX_COMMENT_LENGTH * 0.9 ? 'text-neon-red' : 'text-gray-600'}`}>
                      {editContent.length}/{MAX_COMMENT_LENGTH} CHARS
                    </span>
                    <div className="flex items-center gap-2">
                        <Button 
                            onClick={handleCancel}
                            variant="secondary"
                            disabled={isSaving}
                            className="!py-1.5 !px-3 !text-[10px] !h-8 !border-transparent hover:!border-white/20 !text-gray-400 hover:!text-white"
                        >
                           CANCEL
                        </Button>
                        <Button 
                            onClick={handleSave} 
                            isLoading={isSaving}
                            disabled={!editContent.trim() || editContent === comment.content}
                            variant="secondary"
                            className="!py-1.5 !px-3 !text-[10px] !h-8 hover:!bg-neon-green/10 hover:!border-neon-green hover:!text-neon-green"
                        >
                           {!isSaving && <Check className="w-3 h-3" />}
                           {isSaving ? 'SCANNING...' : 'SAVE'}
                        </Button>
                    </div>
                 </div>
              </div>
            ) : (
               <p className={`text-gray-300 font-sans break-words leading-relaxed ${isNested ? 'text-xs' : 'text-sm'}`}>
                 {comment.content}
               </p>
            )}
            
            {/* Actions */}
            {!isEditing && (
               <div className="flex items-center gap-4 mt-2 focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => onReply(comment.id)}
                    className="text-[10px] font-mono text-gray-500 hover:text-neon-green transition-colors flex items-center gap-1.5 p-1 -ml-1"
                  >
                    <CornerDownRight className="w-3 h-3" /> REPLY
                  </button>
                  {isAuthor && (
                     <button 
                        onClick={() => setIsEditing(true)}
                        className="text-[10px] font-mono text-gray-500 hover:text-neon-purple transition-colors flex items-center gap-1.5 p-1"
                     >
                        <Pencil className="w-3 h-3" /> EDIT
                     </button>
                  )}
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Render Children Recursively */}
      {children.length > 0 && (
        <div className={`pl-2 md:pl-4 ${isNested ? 'ml-2 md:ml-3' : 'ml-2'}`}>
          {children.map(child => (
            <CommentNode 
              key={child.id} 
              comment={child} 
              allComments={allComments} 
              onReply={onReply}
              onUpdate={onUpdate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- MAIN COMPONENT: POST CARD ---
interface PostCardProps {
  post: Post;
  onUserClick?: (username: string) => void;
  onHashtagClick?: (tag: string) => void;
  onPostUpdate?: (updatedPost: Post) => void;
  onPostDelete?: (postId: string) => void;
  isEmbedded?: boolean; 
}

export const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  onUserClick, 
  onHashtagClick, 
  onPostUpdate,
  onPostDelete,
  isEmbedded = false 
}) => {
  const { user } = useAuth();
  const [likes, setLikes] = useState(post.likes || 0);
  const [hasLiked, setHasLiked] = useState(post.hasLiked || false);
  const [isLiking, setIsLiking] = useState(false);
  
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  
  // Comment & Reply State
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);

  // Share State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sharedPost, setSharedPost] = useState<Post | null>(null);

  // Edit/Delete State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editPostContent, setEditPostContent] = useState(post.content);
  const [isSavingPost, setIsSavingPost] = useState(false);

  // Ensure isMine is accurately reflected from the sanitized backend data or direct check
  const isOwner = post.isMine || (user && post.authorId === user.id);
  const isPublicPost = !post.isAnonymous && post.authorUsername;
  const canNavigateToProfile = isPublicPost && onUserClick;

  // Load Shared Post Content if applicable
  useEffect(() => {
    if (post.sharedPostId && !sharedPost) {
      getSinglePost(post.sharedPostId).then(setSharedPost).catch(() => setSharedPost(null));
    }
  }, [post.sharedPostId]);

  const handleUserClick = (e: React.MouseEvent) => {
    if (canNavigateToProfile && post.authorUsername) {
      e.stopPropagation();
      onUserClick(post.authorUsername);
    }
  };

  const handleLike = async () => {
    if (isLiking || !user) return;
    setIsLiking(true);
    
    // Optimistic Update
    const previousLikes = likes;
    const previousHasLiked = hasLiked;
    
    setHasLiked(!hasLiked);
    setLikes(prev => hasLiked ? prev - 1 : prev + 1);

    try {
      const result = await toggleLikePost(post.id, user.id);
      // Sync with server result
      setLikes(result.likes);
      setHasLiked(result.hasLiked);
    } catch (err) {
      // Revert on error
      setLikes(previousLikes);
      setHasLiked(previousHasLiked);
      console.error("Like failed", err);
    } finally {
      setIsLiking(false);
    }
  };

  const toggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      try {
        const data = await getComments(post.id);
        setComments(data);
      } finally {
        setLoadingComments(false);
      }
    }
    setShowComments(!showComments);
  };

  const handleUpdateComment = (id: string, newContent: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, content: newContent } : c));
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setSubmittingComment(true);
    try {
      const createdComment = await addComment(post.id, newComment, user.id, replyingTo || undefined);
      setComments([...comments, createdComment]);
      setCommentCount(prev => prev + 1);
      setNewComment('');
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this signal? This cannot be undone.")) {
      return;
    }
    if (!user) return;

    try {
      await deletePost(post.id, user.id);
      if (onPostDelete) onPostDelete(post.id);
    } catch (e) {
      alert("Failed to delete post.");
    }
  };

  const handleSaveEdit = async () => {
    if (!user || !editPostContent.trim()) return;
    setIsSavingPost(true);
    try {
      const updatedPost = await editPost(post.id, user.id, editPostContent);
      if (onPostUpdate) onPostUpdate(updatedPost);
      setIsEditingPost(false);
      setIsMenuOpen(false);
    } catch (e) {
      alert("Failed to update post.");
    } finally {
      setIsSavingPost(false);
    }
  };

  // Only pass top-level comments to the main map, the Node component handles children
  const topLevelComments = comments.filter(c => !c.parentId);

  return (
    <motion.div 
      initial={!isEmbedded ? { opacity: 0, y: 10 } : undefined}
      animate={!isEmbedded ? { opacity: 1, y: 0 } : undefined}
      className={`bg-[#0f0f0f] border border-white/5 p-4 md:p-6 transition-colors group relative rounded-sm ${!isEmbedded ? 'shadow-xl shadow-black/50 hover:border-white/10' : 'mt-4 border-l-2 border-l-white/20'}`}
    >
      {/* Decorative corners */}
      {!isEmbedded && (
        <>
          <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-white/20" />
          <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-white/20" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-white/20" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-white/20" />
        </>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4 relative">
        <div className="flex items-center gap-3">
          <div 
            className={`relative ${canNavigateToProfile ? 'cursor-pointer' : ''}`}
            onClick={handleUserClick}
          >
            {isPublicPost ? (
              <div className="w-10 h-10 bg-neon-purple/20 rounded border border-neon-purple/50 flex items-center justify-center relative z-10 text-neon-purple">
                <UserIcon className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-black rounded border border-white/10 flex items-center justify-center relative z-10">
                <span className="text-xs font-mono text-gray-500">ID</span>
              </div>
            )}
            
            <div className={`absolute inset-0 blur-md -z-10 opacity-0 group-hover:opacity-100 transition-opacity ${isPublicPost ? 'bg-neon-purple/20' : 'bg-neon-green/20'}`} />
          </div>
          <div>
            <span 
              onClick={handleUserClick}
              className={`block text-sm font-bold font-mono tracking-wider transition-colors 
                ${isPublicPost 
                  ? 'text-neon-purple' 
                  : 'text-gray-200 group-hover:text-neon-green'
                }
                ${canNavigateToProfile ? 'hover:text-neon-green cursor-pointer hover:underline decoration-neon-green/50 underline-offset-4' : ''}
              `}
            >
              {isPublicPost ? post.authorUsername : 'GHOST_SIGNAL'}
              {isOwner && (
                <span className="ml-2 text-[9px] bg-white/10 px-1 py-0.5 rounded text-gray-400 font-normal">YOU</span>
              )}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-gray-600 uppercase font-mono">
              <Clock className="w-3 h-3" />
              {new Date(post.timestamp).toLocaleString()}
              {post.isEdited && <span className="text-gray-500">(edited)</span>}
              {post.sharedPostId && (
                <span className="flex items-center gap-1 text-neon-green">
                  <Repeat className="w-3 h-3" /> Shared
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {(post.toxicityScore || 0) > 10 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-900/20 border border-yellow-700/30 rounded text-[10px] text-yellow-500 font-mono">
                <AlertCircle className="w-3 h-3" />
                FLAGGED_{post.toxicityScore}
            </div>
          )}

          {/* Owner Actions Menu */}
          {isOwner && !isEmbedded && (
            <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1 hover:bg-white/10 rounded-full text-gray-500 hover:text-white transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-[#1a1a1a] border border-white/10 rounded shadow-xl z-50 overflow-hidden">
                  <button 
                    onClick={() => { setIsEditingPost(true); setIsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-xs font-mono text-gray-300 hover:bg-white/5 hover:text-neon-green flex items-center gap-2"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                  <button 
                    onClick={handleDeletePost}
                    className="w-full text-left px-4 py-2 text-xs font-mono text-red-400 hover:bg-red-900/20 hover:text-red-300 flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
              {/* Click outside listener could be added here for UX perfection */}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative">
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-full ${isPublicPost ? 'bg-neon-purple/50' : 'bg-white/5'}`} />
        
        {isEditingPost ? (
          <div className="pl-4">
            <textarea
              value={editPostContent}
              onChange={(e) => setEditPostContent(e.target.value)}
              className="w-full bg-black/50 border border-white/10 p-3 text-sm text-white font-sans focus:outline-none focus:border-neon-green/50 rounded-sm resize-none mb-2"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button 
                variant="secondary" 
                onClick={() => { setIsEditingPost(false); setEditPostContent(post.content); }}
                className="!py-1.5 !px-3 !text-[10px] !h-8"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEdit} 
                isLoading={isSavingPost}
                disabled={!editPostContent.trim() || editPostContent === post.content}
                className="!py-1.5 !px-3 !text-[10px] !h-8"
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <ContentRenderer 
            content={post.content} 
            isAnonymous={!!post.isAnonymous}
            onUserClick={onUserClick}
            onHashtagClick={onHashtagClick}
          />
        )}

        {/* Embedded Shared Post */}
        {post.sharedPostId && !isEmbedded && (
          <div className="mt-4">
             {sharedPost ? (
               <PostCard 
                 post={sharedPost} 
                 onUserClick={onUserClick} 
                 onHashtagClick={onHashtagClick} 
                 isEmbedded={true}
               />
             ) : (
               <div className="p-4 border border-white/10 border-dashed rounded bg-white/5 text-gray-500 font-mono text-xs flex items-center gap-2">
                 <AlertCircle className="w-4 h-4" />
                 Signal lost. The original transmission is no longer available.
               </div>
             )}
          </div>
        )}
      </div>

      {/* Actions (Only for main card, not embedded) */}
      {!isEmbedded && !isEditingPost && (
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-6">
          <button 
            onClick={handleLike}
            disabled={isLiking}
            className={`flex items-center gap-2 text-xs font-mono transition-all duration-300 p-2 -ml-2 rounded hover:bg-white/5 ${hasLiked ? 'text-neon-red scale-105' : 'text-gray-500 hover:text-white'}`}
          >
            <Heart className={`w-4 h-4 ${hasLiked ? 'fill-neon-red' : ''}`} />
            {likes} <span className="hidden sm:inline">SIGNALS</span>
          </button>

          <button 
            onClick={toggleComments}
            className={`flex items-center gap-2 text-xs font-mono transition-colors p-2 rounded hover:bg-white/5 ${showComments ? 'text-neon-green' : 'text-gray-500 hover:text-neon-green'}`}
          >
            <MessageSquare className="w-4 h-4" />
            {commentCount} <span className="hidden sm:inline">ENCRYPTED_REPLIES</span>
          </button>

          {/* Share Button: Only for public posts */}
          {!post.isAnonymous && (
            <button
              onClick={() => setIsShareOpen(true)}
              className="flex items-center gap-2 text-xs font-mono transition-colors p-2 rounded hover:bg-white/5 text-gray-500 hover:text-neon-purple ml-auto"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">SHARE</span>
            </button>
          )}
        </div>
      )}

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-6 pt-6 border-t border-white/5 bg-black/20 -mx-4 md:-mx-6 px-4 md:px-6 pb-6">
              
              <div className="space-y-4 mb-6">
                {loadingComments ? (
                  <div className="text-xs text-neon-green font-mono animate-pulse flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full" />
                    DECRYPTING_STREAM...
                  </div>
                ) : (
                  <>
                    {comments.length === 0 && (
                       <div className="text-xs text-gray-700 font-mono text-center py-4 border border-dashed border-white/10">
                          NO DATA PACKETS FOUND. INITIATE TRANSMISSION.
                       </div>
                    )}
                    {topLevelComments.map(comment => (
                      <CommentNode 
                        key={comment.id} 
                        comment={comment} 
                        allComments={comments} 
                        onReply={(id) => setReplyingTo(id)}
                        onUpdate={handleUpdateComment}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleSubmitComment} className="relative">
                {replyingTo && (
                  <div className="flex items-center justify-between bg-neon-purple/10 border border-neon-purple/20 px-3 py-1.5 mb-2 rounded-t text-xs text-neon-purple font-mono">
                    <span className="flex items-center gap-2">
                      <CornerDownRight className="w-3 h-3" />
                      Replying to encrypted signal...
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setReplyingTo(null)}
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                
                <div className="relative group focus-within:ring-1 focus-within:ring-neon-green/50 transition-all rounded-sm">
                  <textarea 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                    placeholder={replyingTo ? "Transmit encrypted response..." : "Type your encrypted reply..."}
                    rows={replyingTo ? 3 : 2}
                    className="w-full bg-black border border-white/10 outline-none text-white text-sm p-4 pr-12 font-sans resize-none transition-colors rounded-sm placeholder-gray-700"
                    disabled={submittingComment}
                  />
                  
                  <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                     <span className={`text-[9px] font-mono ${newComment.length > MAX_COMMENT_LENGTH * 0.9 ? 'text-neon-red' : 'text-gray-700'}`}>
                      {newComment.length}/{MAX_COMMENT_LENGTH}
                    </span>
                  </div>
                  
                  <div className="absolute bottom-3 right-3">
                    <Button 
                       type="submit"
                       variant="secondary"
                       isLoading={submittingComment}
                       disabled={!newComment.trim()}
                       className="!py-1.5 !px-3 !text-[10px] !h-8 hover:bg-neon-purple/10"
                     >
                       <Send className="w-3 h-3" />
                     </Button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Dialog */}
      <ShareDialog 
        postId={post.id} 
        isOpen={isShareOpen} 
        onClose={() => setIsShareOpen(false)} 
        onSuccess={() => {/* Optional: Show toast or feedback */}}
      />
    </motion.div>
  );
};