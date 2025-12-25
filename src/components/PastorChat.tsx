'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, RefreshCw, MoreHorizontal } from 'lucide-react';
import { PastorPersona, ChatMessage } from '@/types';
import { PASTORS } from '@/lib/constants';
import { chatWithPastor } from '@/lib/ai';

const PastorChat: React.FC = () => {
  const [selectedPastor, setSelectedPastor] = useState<PastorPersona>(PASTORS[0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const responseText = await chatWithPastor(userMsg.text, messages, selectedPastor);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, botMsg]);
    setIsTyping(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
      setMessages([]);
  }

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* Header */}
      <div className="bg-white px-4 py-3 border-b border-stone-200 shadow-sm z-10 flex flex-col">
        <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-bold text-stone-900">Наставники</h2>
             <button onClick={clearChat} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200">
                 <RefreshCw size={16} />
             </button>
        </div>
        
        {/* Avatars Scroll */}
        <div className="flex space-x-5 overflow-x-auto pb-2 no-scrollbar px-1">
          {PASTORS.map(pastor => {
            const isSelected = selectedPastor.id === pastor.id;
            return (
            <button
              key={pastor.id}
              onClick={() => {
                  if (!isSelected) {
                      setSelectedPastor(pastor);
                      setMessages([]); 
                  }
              }}
              className="flex-shrink-0 flex flex-col items-center space-y-2 group"
            >
              <div className={`w-16 h-16 rounded-full overflow-hidden p-0.5 transition-all ${
                  isSelected ? 'bg-gradient-to-tr from-red-500 to-orange-400 shadow-md scale-105' : 'bg-transparent grayscale group-hover:grayscale-0'
              }`}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-white">
                     <img src={pastor.avatar} alt={pastor.name} className="w-full h-full object-cover" />
                </div>
              </div>
              <span className={`text-[11px] font-bold text-center leading-tight ${isSelected ? 'text-stone-900' : 'text-stone-400'}`}>
                  {pastor.name.split(' ')[1]}
              </span>
            </button>
          )})}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-100">
        {messages.length === 0 && (
           <div className="flex flex-col items-center justify-center mt-10 opacity-70">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <MoreHorizontal size={32} className="text-stone-300" />
              </div>
              <h3 className="text-stone-900 font-bold mb-1">{selectedPastor.name}</h3>
              <p className="text-stone-500 text-sm text-center max-w-xs">{selectedPastor.description}</p>
           </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm text-[15px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-red-600 text-white rounded-br-sm'
                  : 'bg-white text-stone-800 rounded-bl-sm'
              }`}
            >
              <div className={`prose prose-sm ${msg.role === 'user' ? 'prose-invert' : 'prose-stone'}`}>
                <ReactMarkdown>
                    {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
           <div className="flex justify-start">
             <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center space-x-1.5">
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}/>
                <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}/>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-3 border-t border-stone-200 safe-area-bottom">
        <div className="flex items-end gap-3 max-w-4xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Напишите сообщение..."
            className="flex-1 bg-stone-100 text-stone-900 placeholder-stone-400 border-none rounded-2xl px-5 py-3 focus:ring-2 focus:ring-red-100 transition-all text-base resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className={`p-3 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-[2px] ${
              input.trim() && !isTyping
                ? 'bg-red-600 text-white shadow-md active:scale-95'
                : 'bg-stone-100 text-stone-300'
            }`}
          >
            <Send size={20} className={input.trim() ? 'ml-0.5' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PastorChat;
