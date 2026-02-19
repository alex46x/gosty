import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, LogOut, Ghost, User, List, Search, MessageSquare, Bell } from 'lucide-react';
import { ViewState } from '../types';
import { getTotalUnreadCount, getUnreadNotificationCount } from '../services/mockBackend';

interface LayoutProps {
  children: React.ReactNode;
  currentView?: ViewState;
  onNavigate?: (view: ViewState) => void;
  isPending?: boolean; // New Prop
}

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onNavigate, isPending }) => {
  const { isAuthenticated, logoutUser, user } = useAuth();
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Poll for unread messages and notifications
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const checkUnread = async () => {
      try {
        const msgCount = await getTotalUnreadCount(user.id);
        setUnreadMsgCount(msgCount);
        
        const notifCount = await getUnreadNotificationCount(user.id);
        setUnreadNotifCount(notifCount);
      } catch (e) {
        console.error("Failed to sync status");
      }
    };

    checkUnread();
    // Poll every 5s
    const interval = setInterval(checkUnread, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user, currentView]); // Re-run on view change to update immediately after reading

  return (
    <div className="min-h-screen bg-obsidian text-gray-300 font-sans selection:bg-neon-green selection:text-black flex flex-col relative">
      {/* Loading Indicator */}
      {isPending && (
          <div className="fixed top-0 left-0 w-full h-1 bg-neon-green/20 z-[100]">
              <div className="h-full bg-neon-green animate-[progress_1s_ease-in-out_infinite]" style={{ width: '100%' }}></div>
          </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-obsidian/80 backdrop-blur-md">
        <div className="w-full max-w-3xl mx-auto px-3 md:px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 text-neon-green cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onNavigate?.(ViewState.FEED)}
          >
            <Ghost className="w-5 h-5 md:w-6 md:h-6" />
            <span className="font-mono font-bold tracking-tighter text-base md:text-lg truncate">GHOST_PROTOCOL</span>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Navigation Actions */}
              {currentView && onNavigate && (
                 <nav className="flex items-center mr-1 sm:mr-4 border-r border-white/10 pr-1 sm:pr-4 gap-0 sm:gap-1">
                    <button
                       onClick={() => onNavigate(ViewState.FEED)}
                       className={`p-2.5 rounded hover:bg-white/5 transition-colors ${currentView === ViewState.FEED ? 'text-white bg-white/10' : 'text-gray-500'}`}
                       title="Public Feed"
                    >
                       <List className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    <button
                       onClick={() => onNavigate(ViewState.SEARCH)}
                       className={`p-2.5 rounded hover:bg-white/5 transition-colors ${currentView === ViewState.SEARCH ? 'text-white bg-white/10' : 'text-gray-500'}`}
                       title="Search Users"
                    >
                       <Search className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                    
                    {/* Messages */}
                    <button
                       onClick={() => onNavigate(ViewState.MESSAGES)}
                       className={`p-2.5 rounded hover:bg-white/5 transition-colors relative ${currentView === ViewState.MESSAGES ? 'text-white bg-white/10' : 'text-gray-500'}`}
                       title="Encrypted Messages"
                    >
                       <MessageSquare className="w-5 h-5 md:w-4 md:h-4" />
                       {unreadMsgCount > 0 && (
                         <span className="absolute top-2 right-2 md:top-1.5 md:right-1.5 w-2 h-2 bg-neon-red rounded-full ring-2 ring-black"></span>
                       )}
                    </button>

                    {/* Notifications */}
                    <button
                       onClick={() => onNavigate(ViewState.NOTIFICATIONS)}
                       className={`p-2.5 rounded hover:bg-white/5 transition-colors relative ${currentView === ViewState.NOTIFICATIONS ? 'text-white bg-white/10' : 'text-gray-500'}`}
                       title="Notifications"
                    >
                       <Bell className="w-5 h-5 md:w-4 md:h-4" />
                       {unreadNotifCount > 0 && (
                         <span className="absolute top-2 right-2 md:top-1.5 md:right-1.5 w-2 h-2 bg-neon-purple rounded-full ring-2 ring-black"></span>
                       )}
                    </button>

                    <button
                       onClick={() => onNavigate(ViewState.PROFILE)}
                       className={`p-2.5 rounded hover:bg-white/5 transition-colors ${currentView === ViewState.PROFILE ? 'text-neon-purple bg-neon-purple/10' : 'text-gray-500'}`}
                       title="My Profile"
                    >
                       <User className="w-5 h-5 md:w-4 md:h-4" />
                    </button>
                 </nav>
              )}

              <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-gray-500">
                <Shield className="w-3 h-3" />
                <span>ENCRYPTED</span>
                <span className="text-white/40">::</span>
                <span className="text-neon-purple max-w-[100px] truncate">{user?.username}</span>
              </div>
              
              <button 
                onClick={logoutUser}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400 hover:text-white"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 md:py-8 flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-[10px] md:text-xs text-gray-600 font-mono">
        <p>NO LOGS. NO TRACKING. NO IDENTITY.</p>
        <p className="mt-2 opacity-50">v1.3.0-Responsive</p>
      </footer>
    </div>
  );
};