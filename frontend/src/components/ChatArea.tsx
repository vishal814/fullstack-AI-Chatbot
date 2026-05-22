import React, { useState, useRef, useEffect } from 'react';
import type { Conversation } from './Sidebar';

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

interface ChatAreaProps {
  activeChat: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onCancelChat: (id: string) => Promise<void>;
  selectedProvider: 'openai' | 'google';
  setSelectedProvider: (provider: 'openai' | 'google') => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeChat,
  messages,
  isLoading,
  onSendMessage,
  onCancelChat,
  selectedProvider,
  setSelectedProvider,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !activeChat || activeChat.status === 'CANCELLED') return;
    
    const text = input;
    setInput('');
    await onSendMessage(text);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (!activeChat) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h2>Ingested LLM Chat Interface</h2>
          <p style={{ maxWidth: '400px' }}>Select an existing conversational session from the sidebar or click "New Chat" to begin streaming prompts and capturing metadata in real-time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <header className="workspace-header">
        <div className="header-left">
          <div className="header-info">
            <div className="logo-dot" style={{ backgroundColor: activeChat.status === 'ACTIVE' ? 'var(--accent-emerald)' : 'var(--accent-rose)', boxShadow: activeChat.status === 'ACTIVE' ? '0 0 12px var(--accent-emerald)' : '0 0 12px var(--accent-rose)' }}></div>
            <h2 className="header-title">{activeChat.title}</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ID: {activeChat.id.substring(0, 8)}...</span>
          </div>
        </div>

        <div className="header-actions">
          {activeChat.status === 'ACTIVE' && (
            <div className="provider-selector-container">
              <select 
                id="provider-select" 
                value={selectedProvider} 
                onChange={(e) => setSelectedProvider(e.target.value as 'openai' | 'google')}
                className="provider-select"
              >
                <option value="openai">OpenAI (gpt-4o)</option>
              </select>
            </div>
          )}

          {activeChat.status === 'ACTIVE' && (
            <button onClick={() => onCancelChat(activeChat.id)} className="cancel-chat-btn">
              End Conversation
            </button>
          )}
        </div>
      </header>

      <div className="messages-list">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>This conversation has no messages. Type a prompt below to initiate your first inference log.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.role === 'USER' ? 'user' : 'assistant'}`}>
              <div className="message-bubble">
                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                <span className="message-time">{formatDate(msg.createdAt)}</span>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="message-wrapper assistant">
            <div className="typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer className="input-container">
        {activeChat.status === 'CANCELLED' ? (
          <div className="cancelled-indicator">
            ⚠️ This conversation session has been ended. No further inference metadata can be logged to this session.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="input-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the ingested LLM helper..."
              className="chat-input"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        )}
      </footer>
    </div>
  );
};
