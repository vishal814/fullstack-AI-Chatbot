import React from 'react';

export interface Conversation {
  id: string;
  title: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

interface SidebarProps {
  conversations: Conversation[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onCreateNewChat: () => void;
  currentView: 'chat' | 'dashboard';
  onSwitchView: (view: 'chat' | 'dashboard') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeChatId,
  onSelectChat,
  onCreateNewChat,
  currentView,
  onSwitchView,
}) => {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-dot"></div>
        <h1 className="sidebar-title">Antigravity Ingest</h1>
      </div>

      <button onClick={onCreateNewChat} className="new-chat-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        New Chat
      </button>

      <div className="conversations-list">
        {conversations.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
            No chat history
          </div>
        ) : (
          conversations.map((chat) => (
            <div
              key={chat.id}
              onClick={() => {
                onSwitchView('chat');
                onSelectChat(chat.id);
              }}
              className={`conversation-item ${activeChatId === chat.id && currentView === 'chat' ? 'active' : ''}`}
            >
              <div className="conversation-title-row">
                <span className="conversation-title">{chat.title}</span>
                <span className={`conversation-status ${chat.status === 'ACTIVE' ? 'status-active' : 'status-cancelled'}`}>
                  {chat.status}
                </span>
              </div>
              <span className="conversation-meta">{formatDate(chat.updatedAt)}</span>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onSwitchView('chat')}
            className={`nav-btn ${currentView === 'chat' ? 'active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Chatbot Application
          </button>
          
          <button
            onClick={() => onSwitchView('dashboard')}
            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Metrics Dashboard
          </button>
        </div>
      </div>
    </aside>
  );
};
