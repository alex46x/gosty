import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Layout } from './components/Layout';
import { Auth } from './pages/Auth';
import { Feed } from './pages/Feed';
import { Profile } from './pages/Profile';
import { Search } from './pages/Search';
import { PublicProfile } from './pages/PublicProfile';
import { Messages } from './pages/Messages';
import { Notifications } from './pages/Notifications';
import { SinglePost } from './pages/SinglePost';
import { HashtagFeed } from './pages/HashtagFeed';
import { ViewState } from './types';

// Main Content Router component
const AppContent = () => {
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState<ViewState>(ViewState.LOGIN);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [isPending, startTransition] = React.useTransition();
  
  // State for passing target user to Messages component
  const [chatTarget, setChatTarget] = useState<string | null>(null);

  // State for single post view (from notifications or shared links)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // State for selected hashtag
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);

  // Wrapper for navigation updates
  const handleNavigate = (newView: ViewState) => {
    startTransition(() => {
        setView(newView);
    });
  };

  // Check for deep link (query param) on mount or auth change
  useEffect(() => {
    // Only process deep links if authenticated
    if (isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      const deepLinkPostId = params.get('post');
      
      if (deepLinkPostId) {
        setSelectedPostId(deepLinkPostId);
        handleNavigate(ViewState.SINGLE_POST);
      } else if (view === ViewState.LOGIN || view === ViewState.REGISTER) {
        // Default to feed if no deep link and just logged in
        handleNavigate(ViewState.FEED);
      }
    }
  }, [isAuthenticated]);

  const handleSelectUser = (username: string) => {
    setSelectedUsername(username);
    handleNavigate(ViewState.PUBLIC_PROFILE);
  };

  const handleMessageUser = (username: string) => {
    setChatTarget(username);
    handleNavigate(ViewState.MESSAGES);
  };

  const handleViewPost = (postId: string) => {
    setSelectedPostId(postId);
    handleNavigate(ViewState.SINGLE_POST);
  };

  const handleHashtagClick = (tag: string) => {
    setSelectedHashtag(tag);
    handleNavigate(ViewState.HASHTAG_FEED);
  };

  const handleBackFromSinglePost = () => {
    // If we came from a deep link, going back should probably go to feed
    if (window.location.search.includes('post=')) {
        // Clear the query param so future navigation doesn't get stuck
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.pushState({path: newUrl}, '', newUrl);
        handleNavigate(ViewState.FEED);
    } else {
        // Default behavior (usually back to notifications or feed)
        handleNavigate(ViewState.FEED); 
    }
  };

  // Authenticated Views
  if (isAuthenticated) {
    let content;
    switch (view) {
      case ViewState.PROFILE:
        content = <Profile onHashtagClick={handleHashtagClick} />;
        break;
      case ViewState.SEARCH:
        content = <Search onSelectUser={handleSelectUser} />;
        break;
      case ViewState.PUBLIC_PROFILE:
        content = <PublicProfile 
          targetUsername={selectedUsername} 
          onBack={() => handleNavigate(ViewState.SEARCH)} 
          onMessage={handleMessageUser}
          onHashtagClick={handleHashtagClick}
        />;
        break;
      case ViewState.MESSAGES:
        content = <Messages 
          initialChatUsername={chatTarget || undefined} 
          onViewProfile={handleSelectUser}
          onNavigateToPost={handleViewPost}
        />;
        break;
      case ViewState.NOTIFICATIONS:
        content = <Notifications onViewPost={handleViewPost} />;
        break;
      case ViewState.SINGLE_POST:
        content = <SinglePost 
          postId={selectedPostId} 
          onBack={handleBackFromSinglePost} 
          onUserClick={handleSelectUser}
          onHashtagClick={handleHashtagClick}
        />;
        break;
      case ViewState.HASHTAG_FEED:
        content = <HashtagFeed 
          hashtag={selectedHashtag || ''}
          onBack={() => handleNavigate(ViewState.FEED)}
          onUserClick={handleSelectUser}
          onHashtagClick={handleHashtagClick}
        />;
        break;
      case ViewState.FEED:
      default:
        content = <Feed onUserClick={handleSelectUser} onHashtagClick={handleHashtagClick} />;
        break;
    }

    return (
      <Layout currentView={view} onNavigate={handleNavigate} isPending={isPending}>
        {content}
      </Layout>
    );
  }

  // Auth Flow
  return (
    <div className="min-h-screen bg-obsidian text-gray-200 flex flex-col justify-center pb-20 px-4">
      <Auth view={view === ViewState.REGISTER ? ViewState.REGISTER : ViewState.LOGIN} onChangeView={handleNavigate} />
      
      {/* Phase 10: Roadmap Footer (Visible on login) */}
      <div className="fixed bottom-4 left-0 right-0 text-center opacity-30 text-[10px] font-mono pointer-events-none">
        Phase 1: Core Systems | Phase 2: DB Design | Phase 3: Encryption | Phase 4: P2P Messaging
      </div>
    </div>
  );
};

// Root App with Providers
// SocketProvider is inside AuthProvider so it can read token/isAuthenticated
const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;