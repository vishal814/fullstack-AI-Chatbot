import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import type { Conversation } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import type { Message } from './components/ChatArea';
import { Dashboard } from './components/Dashboard';
import type { DashboardMetrics } from '../../backend/src/types';

const API_BASE = import.meta.env.VITE_API_URL || '';

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [currentView, setCurrentView] = useState<'chat' | 'dashboard'>('chat');
  const [isLoading, setIsLoading] = useState(false);

  const activeChat = conversations.find(c => c.id === activeChatId) || null;

  // 1. Fetch conversations on startup
  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/conversations`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
        
        // Auto-select the most recently updated conversation if none is active
        if (data.length > 0 && !activeChatId) {
          setActiveChatId(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // 2. Fetch messages whenever the active chat changes
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/conversations/${activeChatId}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages);
          
          // Sync conversation status from database
          setConversations(prev =>
            prev.map(c => (c.id === activeChatId ? { ...c, status: data.conversationStatus } : c))
          );
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      }
    };

    fetchMessages();
  }, [activeChatId]);

  // 3. Fetch aggregated metrics for the dashboard
  const fetchMetrics = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/metrics`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  // Poll metrics every 5 seconds when viewing the dashboard to achieve near real-time updates
  useEffect(() => {
    if (currentView === 'dashboard') {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView]);

  // 4. Create a new conversation session
  const handleCreateNewChat = async () => {
    try {
      const title = prompt('Enter a title for the new conversation:') || undefined;
      const response = await fetch(`${API_BASE}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        const newChat = await response.json();
        setConversations(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        setCurrentView('chat');
      }
    } catch (error) {
      console.error('Failed to create new conversation:', error);
    }
  };

  // 5. Send message inside a conversation
  const handleSendMessage = async (content: string) => {
    if (!activeChatId) return;

    // Instantly show the user's message in the UI for a highly responsive feel
    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: activeChatId,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/conversations/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: content }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Replace temp list with database persisted items and add AI response
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, data.userMessage, data.assistantMessage];
        });
        
        // Refresh conversations list to update order/timestamps in the sidebar
        fetchConversations();
      } else {
        const errData = await response.json();
        alert(errData.message || 'Error occurred while sending message');
        // Roll back prompt on error
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      }
    } catch (error) {
      console.error('Send message request failed:', error);
      alert('Network error connecting to API');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Cancel conversation session
  const handleCancelChat = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this conversation? You will not be able to log any more inferences to it.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/conversations/${id}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        // Update state to show as cancelled
        setConversations(prev =>
          prev.map(c => (c.id === id ? { ...c, status: 'CANCELLED' } : c))
        );
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to cancel conversation:', error);
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onCreateNewChat={handleCreateNewChat}
        currentView={currentView}
        onSwitchView={setCurrentView}
      />

      <main className="main-workspace">
        {currentView === 'chat' ? (
          <ChatArea
            activeChat={activeChat}
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onCancelChat={handleCancelChat}
          />
        ) : (
          <Dashboard metrics={metrics} onRefresh={fetchMetrics} />
        )}
      </main>
    </div>
  );
}

export default App;
