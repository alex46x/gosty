import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Heart, MessageCircle, CornerDownRight, Check, AlertCircle, Clock, AtSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationsRead } from '../services/mockBackend';
import { Notification, NotificationType } from '../types';
import { Button } from '../components/UI';

interface NotificationsProps {
  onViewPost: (postId: string) => void;
}

export const Notifications: React.FC<NotificationsProps> = ({ onViewPost }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!user) return;
    
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await getNotifications(user.id);
        setNotifications(data);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  // Handler for marking all as read
  const handleMarkAllRead = async () => {
    if (!user) return;
    await markNotificationsRead(user.id); // No ID arg = Mark All
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  // Handler for clicking a specific notification
  const handleNotificationClick = async (notif: Notification) => {
    if (!user) return;

    // 1. If unread, mark specific notification as read in background
    if (!notif.isRead) {
      // Optimistic Update
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      // API Call
      await markNotificationsRead(user.id, notif.id);
    }

    // 2. Navigate
    onViewPost(notif.referenceId);
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.LIKE:
        return <Heart className="w-4 h-4 text-neon-red" fill="currentColor" />;
      case NotificationType.COMMENT:
        return <MessageCircle className="w-4 h-4 text-neon-green" />;
      case NotificationType.REPLY:
        return <CornerDownRight className="w-4 h-4 text-neon-purple" />;
      case NotificationType.MENTION:
        return <AtSign className="w-4 h-4 text-neon-green" />;
    }
  };

  const getText = (n: Notification) => {
    switch (n.type) {
      case NotificationType.LIKE:
        return <span>liked your secure transmission.</span>;
      case NotificationType.COMMENT:
        return <span>intercepted your transmission (commented).</span>;
      case NotificationType.REPLY:
        return <span>replied to your signal packet.</span>;
      case NotificationType.MENTION:
        return <span>mentioned you in a broadcast.</span>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-white font-mono tracking-tight flex items-center gap-3">
            <Bell className="w-8 h-8 text-neon-purple" />
            ALERTS
          </h1>
          <p className="text-gray-500 text-xs mt-2 font-mono flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Logs auto-purge after 48h.
          </p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <Button onClick={handleMarkAllRead} variant="secondary" className="!py-1.5 !px-3 !text-xs">
            <Check className="w-3 h-3" /> MARK ALL READ
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
           {[1,2,3].map(i => (
             <div key={i} className="h-16 bg-white/5 rounded-sm border border-white/5" />
           ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-24 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
          NO NEW ALERTS DETECTED.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif, i) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 border rounded-sm flex items-center gap-4 cursor-pointer group transition-all ${
                notif.isRead 
                  ? 'bg-[#0f0f0f] border-white/5 opacity-60 hover:opacity-100 hover:bg-white/5' 
                  : 'bg-white/5 border-neon-purple/30 shadow-[0_0_10px_rgba(189,0,255,0.05)]'
              }`}
            >
              <div className={`p-2 rounded-full border border-white/10 bg-black ${notif.isRead ? 'grayscale' : ''}`}>
                {getIcon(notif.type)}
              </div>
              
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-sm font-bold font-mono transition-colors ${notif.isRead ? 'text-gray-400' : 'text-white group-hover:text-neon-green'}`}>
                    @{notif.actorUsername}
                  </span>
                  <span className="text-xs text-gray-400 font-sans">
                    {getText(notif)}
                  </span>
                </div>
                <div className="text-[10px] text-gray-600 font-mono">
                  {new Date(notif.timestamp).toLocaleString()}
                </div>
              </div>

              {!notif.isRead && (
                <div className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};