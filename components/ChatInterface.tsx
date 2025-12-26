
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading: boolean;
  error: string | null;
  onBackToForm: () => void;
  onClearChat: () => void;
  suggestedQuestions: string[];
  isSyncing?: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  chatHistory,
  onSendMessage,
  loading,
  error,
  onBackToForm,
  onClearChat,
  suggestedQuestions,
  isSyncing,
}) => {
  const [currentInput, setCurrentInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [chatHistory]);

  const handleSend = () => {
    if (currentInput.trim()) {
      onSendMessage(currentInput);
      setCurrentInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[75vh] md:h-[80vh] glass rounded-3xl overflow-hidden shadow-2xl border border-white/10">
      {/* Header */}
      <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <span className="text-xl">✨</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Cosmic Oracle</h2>
            <div className="flex items-center text-[10px] font-black uppercase tracking-tighter">
              {isSyncing ? (
                <span className="text-blue-400 animate-pulse">Syncing to Cloud...</span>
              ) : (
                <div className="flex items-center text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5"></span>
                  Spirit Logged
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onClearChat}
            className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            Reset
          </button>
          <button
            onClick={onBackToForm}
            className="px-4 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/10"
          >
            ← Chart
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {chatHistory.length <= 1 && suggestedQuestions.length > 0 && (
            <div className="p-4 bg-white/5 border-b border-white/5 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 px-1">Suggested Inquiries</p>
              <div className="flex space-x-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(q)}
                    className="px-3 py-1.5 text-xs bg-white/5 hover:bg-blue-500/20 border border-white/10 rounded-full text-blue-200 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                <div
                  className={`max-w-[85%] px-5 py-3 rounded-2xl shadow-lg border ${
                    msg.role === 'user'
                      ? 'bg-blue-600/20 border-blue-500/30 text-blue-50'
                      : 'bg-white/5 border-white/10 text-gray-200'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                  <span className="text-[10px] text-blue-300/70 font-black uppercase">Channeling...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="mx-auto max-w-sm text-center p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white/5 border-t border-white/10">
            <div className="relative flex items-center">
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your destiny, career in Germany, or 2026..."
                className="w-full bg-black/30 border border-white/10 rounded-2xl py-3.5 pl-5 pr-14 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !currentInput.trim()}
                className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg transition-all disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
