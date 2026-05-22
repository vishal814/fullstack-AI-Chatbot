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
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'google'>('google');

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

  // 5. Send message inside a conversation with full SSE streaming support
  const handleSendMessage = async (content: string) => {
    if (!activeChatId) return;

    // 1. Save user prompt locally first for instantaneous display
    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: activeChatId,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };

    // 2. Pre-allocate temporary assistant chat bubble with empty content
    const tempAssistantMsgId = crypto.randomUUID();
    const tempAssistantMsg: Message = {
      id: tempAssistantMsgId,
      conversationId: activeChatId,
      role: 'ASSISTANT',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/conversations/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: content,
          provider: selectedProvider,
          model: selectedProvider === 'openai' ? 'gpt-4o' : 'gemini-1.5-flash'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} Error calling backend`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body stream reader available');

      let accumulatedAI = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode binary chunk and add to our string lines buffer
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Maintain incomplete buffer snippet

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(cleanLine.substring(6));

              // Append streaming token/character chunks
              if (data.chunk) {
                accumulatedAI += data.chunk;
                setMessages(prev =>
                  prev.map(m => (m.id === tempAssistantMsgId ? { ...m, content: accumulatedAI } : m))
                );
              }

              // Finished! Synchronize official database elements to matching list IDs
              if (data.done) {
                setMessages(prev => {
                  const filtered = prev.filter(m => m.id !== tempUserMsg.id && m.id !== tempAssistantMsgId);
                  return [...filtered, data.userMessage, data.assistantMessage];
                });
                fetchConversations();
              }

              if (data.error) {
                alert(`Streaming error: ${data.error}`);
              }
            } catch (e) {
              // Ignore parser adjustments
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Send message request failed:', error);
      alert(error.message || 'Network error connecting to API');
      // Rollback temporary messages on failure
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id && m.id !== tempAssistantMsgId));
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
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
          />
        ) : (
          <Dashboard metrics={metrics} onRefresh={fetchMetrics} />
        )}
      </main>
    </div>
  );
}

export default App;
