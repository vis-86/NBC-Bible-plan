'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, RefreshCw, MoreHorizontal, AlertCircle } from 'lucide-react';
import { PastorPersona, ChatMessage } from '@/types';
import { getPastorsWithBasePath } from '@/lib/constants';
import { chatWithPastor } from '@/lib/ai';
import { useAuth } from '@/hooks/useAuth';
import { getApiPath } from '@/lib/utils';

const MESSAGES_PER_PAGE = 20;

const PastorChat: React.FC = () => {
  const { user } = useAuth();
  const pastors = getPastorsWithBasePath();
  const [selectedPastor, setSelectedPastor] = useState<PastorPersona>(pastors[0]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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

  // Вычисляем видимые сообщения (последние MESSAGES_PER_PAGE)
  const visibleMessages = allMessages.slice(-MESSAGES_PER_PAGE);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Скроллим вниз только при добавлении новых сообщений (не при подгрузке старых)
  useEffect(() => {
    // Скроллим вниз только если мы внизу чата или добавляем новое сообщение
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom || allMessages.length <= MESSAGES_PER_PAGE) {
        scrollToBottom();
      }
    }
  }, [allMessages.length]);

  // Загружаем историю при монтировании и при смене пастора
  useEffect(() => {
    if (user) {
      loadChatHistory();
    }
  }, [selectedPastor.id, user]);

  const loadChatHistory = async () => {
    if (!user) return;
    
    setIsLoadingHistory(true);
    setLoadedOffset(0);
    try {
      const response = await fetch(
        getApiPath(`/api/chat/history?pastor_id=${selectedPastor.id}&limit=${MESSAGES_PER_PAGE}&offset=0`),
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.messages && Array.isArray(data.messages)) {
          // Нормализуем сообщения: убеждаемся, что text всегда строка
          const normalizedMessages = data.messages.map((msg: any) => ({
            ...msg,
            text: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)
          }));
          setAllMessages(normalizedMessages);
          setHasMoreMessages(data.hasMore || false);
          setLoadedOffset(MESSAGES_PER_PAGE);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!user || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    try {
      const newOffset = loadedOffset + MESSAGES_PER_PAGE;
      const response = await fetch(
        getApiPath(`/api/chat/history?pastor_id=${selectedPastor.id}&limit=${MESSAGES_PER_PAGE}&offset=${newOffset}`),
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.messages && Array.isArray(data.messages)) {
          // Нормализуем сообщения
          const normalizedMessages = data.messages.map((msg: any) => ({
            ...msg,
            text: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)
          }));
          
          // Сохраняем позицию скролла перед добавлением сообщений
          const container = chatContainerRef.current;
          const previousScrollHeight = container?.scrollHeight || 0;
          
          // Добавляем старые сообщения в начало
          setAllMessages(prev => [...normalizedMessages, ...prev]);
          setHasMoreMessages(data.hasMore || false);
          setLoadedOffset(newOffset);
          
          // Восстанавливаем позицию скролла после обновления DOM
          setTimeout(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight;
              const scrollDiff = newScrollHeight - previousScrollHeight;
              container.scrollTop += scrollDiff;
            }
          }, 0);
        }
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    // Если пользователь прокрутил близко к верху, загружаем больше сообщений
    if (container.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
      loadMoreMessages();
    }
  };

  const saveChatHistory = async (messagesToSave: ChatMessage[]) => {
    if (!user) return;
    
    try {
      await fetch(getApiPath('/api/chat/history'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          pastor_id: selectedPastor.id,
          messages: messagesToSave,
        }),
      });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isTyping || !user) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    const updatedMessages = [...allMessages, userMsg];
    setAllMessages(updatedMessages);
    setInput('');
    setIsTyping(true);

    // Сохраняем сообщение пользователя
    await saveChatHistory(updatedMessages);

    try {
      const responseText = await chatWithPastor(userMsg.text, allMessages, selectedPastor);

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, botMsg];
      setAllMessages(finalMessages);
      setIsTyping(false);

      // Сохраняем полную историю с ответом ИИ
      await saveChatHistory(finalMessages);
    } catch (error) {
      // Показываем красивое сообщение об ошибке
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: '', // Пустой текст, так как используем специальный UI для ошибок
        timestamp: Date.now(),
        isError: true
      };

      const finalMessages = [...updatedMessages, errorMsg];
      setAllMessages(finalMessages);
      setIsTyping(false);
      
      // Не сохраняем сообщение об ошибке в историю
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = async () => {
    if (!user) return;
    
    setAllMessages([]);
    setHasMoreMessages(false);
    setLoadedOffset(0);
    
    // Удаляем историю из базы данных
    try {
      await fetch(
        getApiPath(`/api/chat/history?pastor_id=${selectedPastor.id}`),
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-app-bg">
      {/* Header */}
      <div className="bg-app-surface px-4 py-3 border-b border-app-border shadow-app-sm z-10 flex flex-col">
        <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-bold text-app-text">Наставники</h2>
             <button onClick={clearChat} className="p-2 bg-app-surface-muted rounded-full text-app-text-secondary hover:bg-app-surface-elevated">
                 <RefreshCw size={16} />
             </button>
        </div>

        {/* Avatars Scroll */}
        <div className="flex space-x-5 overflow-x-auto pb-2 no-scrollbar px-1">
          {pastors.map(pastor => {
            const isSelected = selectedPastor.id === pastor.id;
            return (
            <button
              key={pastor.id}
              onClick={() => {
                  if (!isSelected) {
                      setSelectedPastor(pastor);
                      // История загрузится автоматически через useEffect
                  }
              }}
              className="flex-shrink-0 flex flex-col items-center space-y-2 group"
            >
              <div className={`w-16 h-16 rounded-full overflow-hidden p-0.5 transition-all ${
                  isSelected ? 'bg-gradient-to-tr from-app-accent to-orange-400 shadow-app-md scale-105' : 'bg-transparent grayscale group-hover:grayscale-0'
              }`}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-app-surface">
                     <img src={pastor.avatar} alt={pastor.name} className="w-full h-full object-cover" />
                </div>
              </div>
              <span className={`text-[11px] font-bold text-center leading-tight ${isSelected ? 'text-app-text' : 'text-app-text-muted'}`}>
                  {pastor.name.split(' ').pop() || pastor.name}
              </span>
            </button>
          )})}
        </div>
      </div>

      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-app-bg"
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="text-app-text-secondary text-sm">Загрузка старых сообщений...</div>
          </div>
        )}

        {visibleMessages.length === 0 && !isLoadingHistory && (
           <div className="flex flex-col items-center justify-center mt-10 opacity-70">
              <div className="w-16 h-16 bg-app-surface rounded-app-xl shadow-app-sm flex items-center justify-center mb-4">
                  <MoreHorizontal size={32} className="text-app-text-subtle" />
              </div>
              <h3 className="text-app-text font-bold mb-1">{selectedPastor.name}</h3>
              <p className="text-app-text-secondary text-sm text-center max-w-xs">{selectedPastor.description}</p>
           </div>
        )}

        {isLoadingHistory && (
          <div className="flex justify-center py-8">
            <div className="text-app-text-secondary text-sm">Загрузка истории...</div>
          </div>
        )}
        
        {visibleMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.isError ? (
              // Специальное сообщение об ошибке
              <div className="max-w-[80%] rounded-app-xl px-5 py-4 shadow-app-sm bg-app-surface-elevated border border-app-border-strong rounded-bl-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-app-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-app-text mb-1.5 text-[15px]">
                      Сервис временно недоступен
                    </h4>
                    <p className="text-app-text-secondary text-sm leading-relaxed">
                      К сожалению, наставник временно не может ответить. Пожалуйста, попробуйте позже или обратитесь к администратору.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`max-w-[80%] rounded-app-xl px-5 py-3 shadow-app-sm text-[15px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-app-accent text-app-text-inverse rounded-br-sm'
                    : 'bg-app-surface text-app-text rounded-bl-sm'
                }`}
              >
                <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-stone'}`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Заголовки
                      h1: (props) => <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0" {...props} />,
                      h2: (props) => <h2 className="text-lg font-bold mt-3 mb-2 first:mt-0" {...props} />,
                      h3: (props) => <h3 className="text-base font-semibold mt-3 mb-1.5 first:mt-0" {...props} />,
                      // Параграфы
                      p: (props) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                      // Списки
                      ul: (props) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                      ol: (props) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                      li: (props) => <li className="ml-2" {...props} />,
                      // Ссылки
                      a: (props) => (
                        <a
                          className={`underline hover:no-underline ${msg.role === 'user' ? 'text-app-text-inverse/80' : 'text-app-accent'}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props} 
                        />
                      ),
                      // Выделение текста
                      strong: (props) => <strong className="font-semibold" {...props} />,
                      em: (props) => <em className="italic" {...props} />,
                      // Код
                      code: (props: any) => {
                        const { inline, ...rest } = props;
                        if (inline) {
                          return (
                            <code 
                              className={`px-1.5 py-0.5 rounded text-sm font-mono ${
                                msg.role === 'user'
                                  ? 'bg-black/15 text-app-text-inverse'
                                  : 'bg-app-surface-muted text-app-text'
                              }`}
                              {...rest} 
                            />
                          );
                        }
                        return (
                          <code 
                            className={`block p-3 rounded-app-sm text-sm font-mono overflow-x-auto mb-2 ${
                              msg.role === 'user'
                                ? 'bg-black/15 text-app-text-inverse'
                                : 'bg-app-surface-muted text-app-text'
                            }`}
                            {...rest} 
                          />
                        );
                      },
                      pre: (props) => (
                        <pre className="mb-2 overflow-x-auto" {...props} />
                      ),
                      // Цитаты
                      blockquote: (props) => (
                        <blockquote 
                          className={`border-l-4 pl-4 my-2 italic ${
                            msg.role === 'user'
                              ? 'border-app-text-inverse/40 text-app-text-inverse/80'
                              : 'border-app-border-strong text-app-text-secondary'
                          }`}
                          {...props} 
                        />
                      ),
                      // Горизонтальная линия
                      hr: (props) => (
                        <hr 
                          className={`my-3 border-0 border-t ${
                            msg.role === 'user'
                              ? 'border-app-text-inverse/30'
                              : 'border-app-border-strong'
                          }`}
                          {...props} 
                        />
                      ),
                    }}
                  >
                    {typeof msg.text === 'string' ? msg.text : String(msg.text)}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
        {isTyping && (
           <div className="flex justify-start">
             <div className="bg-app-surface rounded-app-xl rounded-bl-sm px-4 py-3 shadow-app-sm flex items-center space-x-1.5">
                <div className="w-1.5 h-1.5 bg-app-text-muted rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-app-text-muted rounded-full animate-bounce" style={{animationDelay: '150ms'}}/>
                <div className="w-1.5 h-1.5 bg-app-text-muted rounded-full animate-bounce" style={{animationDelay: '300ms'}}/>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-app-surface p-3 border-t border-app-border">
        <div className="flex items-end gap-3 max-w-4xl mx-auto w-full">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Напишите сообщение..."
            className="flex-1 bg-app-surface-muted text-app-text placeholder-app-text-muted border-none rounded-app-xl px-5 py-3 focus:ring-2 focus:ring-app-accent-muted transition-all text-base resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || isTyping}
            className={`p-3 min-h-11 min-w-11 rounded-full flex items-center justify-center transition-transform duration-150 flex-shrink-0 mb-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
              input.trim() && !isTyping
                ? 'bg-app-accent text-app-text-inverse shadow-app-md active:scale-95'
                : 'bg-app-surface-muted text-app-text-subtle'
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
