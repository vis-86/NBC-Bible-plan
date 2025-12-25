'use client';

import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Book, Info, Loader2, ChevronLeft, ChevronRight, Settings, Share2, Volume2 } from 'lucide-react';
import { BibleReference } from '@/types';
import { getBibleText, getReferenceInfo } from '@/lib/ai';

interface ReadingViewProps {
  reading: BibleReference | null;
  onBack: () => void;
}

const ReadingView: React.FC<ReadingViewProps> = ({ reading, onBack }) => {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [contextInfo, setContextInfo] = useState<string | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const currentChapter = reading?.chapter || 1;

  useEffect(() => {
    if (reading) {
      loadText(reading);
      setContextInfo(null);
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  const loadText = async (ref: BibleReference) => {
    setLoading(true);
    setText("");
    const result = await getBibleText(ref);
    setText(result);
    setLoading(false);
  };

  const handleExplain = async () => {
    if (!reading) return;
    setInfoLoading(true);
    const summary = await getReferenceInfo(
      `О чем говорится в главе ${reading.chapter} книги ${reading.book}?`,
      `Текст главы: ${text.substring(0, 1000)}...` 
    );
    setContextInfo(summary);
    setInfoLoading(false);
  };

  const handleNextChapter = () => {
    if (reading) loadText({ ...reading, chapter: reading.chapter + 1 });
  };
  const handlePrevChapter = () => {
    if (reading && reading.chapter > 1) loadText({ ...reading, chapter: reading.chapter - 1 });
  };

  if (!reading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-stone-400 bg-white">
        <Book size={64} className="mb-6 opacity-10" />
        <h3 className="text-lg font-bold text-stone-700 mb-2">Библия</h3>
        <p className="text-center text-stone-500 mb-8 max-w-xs">Выберите книгу и главу в плане чтения для начала изучения.</p>
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-red-600 text-white rounded-full font-bold shadow-lg active:scale-95 transition-transform"
        >
          Открыть План
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-100 flex items-center justify-between px-2 h-[56px] shadow-sm">
        <button 
          onClick={onBack}
          className="p-3 text-stone-500 hover:text-stone-900 active:scale-90 transition-transform"
        >
          <ArrowLeft size={22} />
        </button>
        
        <div className="flex flex-col items-center cursor-pointer active:opacity-70">
          <span className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-0.5">{reading.book}</span>
          <div className="flex items-center space-x-1">
             <span className="font-bold text-stone-900 text-lg leading-none">Глава {currentChapter}</span>
             <ChevronRight size={14} className="text-stone-400 rotate-90" />
          </div>
        </div>

        <div className="flex items-center">
            <button className="p-3 text-stone-400 hover:text-stone-800">
                <Settings size={20} />
            </button>
            <button className="p-3 text-stone-400 hover:text-stone-800">
                <Volume2 size={20} />
            </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto w-full bg-white" ref={contentRef}>
        <div className="max-w-xl mx-auto px-6 py-8 pb-32">
            {loading ? (
            <div className="flex flex-col items-center justify-center py-40 space-y-4">
                <Loader2 className="animate-spin text-red-600" size={40} />
            </div>
            ) : (
            <>
                <div className="mb-8 flex justify-center">
                   <span className="text-6xl font-serif font-bold text-stone-100 select-none">{reading.chapter}</span>
                </div>

                <article className="prose prose-stone prose-lg">
                    {infoLoading && (
                        <div className="my-6 p-4 rounded-xl bg-stone-50 border border-stone-100 flex items-center gap-3 animate-pulse">
                            <Loader2 size={18} className="animate-spin text-stone-400" />
                            <span className="text-sm font-medium text-stone-500">Загрузка контекста...</span>
                        </div>
                    )}
                    
                    {contextInfo && !infoLoading && (
                        <div className="my-6 bg-yellow-50/80 border border-yellow-100 rounded-xl p-5 relative">
                            <h4 className="font-bold text-yellow-800 text-sm uppercase tracking-wide mb-2 flex items-center gap-2">
                                <Info size={16} /> Контекст
                            </h4>
                            <div className="text-sm text-yellow-900/80 leading-relaxed">
                                <ReactMarkdown>{contextInfo}</ReactMarkdown>
                            </div>
                            <button 
                            onClick={() => setContextInfo(null)}
                            className="absolute top-2 right-2 p-2 text-yellow-700/50 hover:text-yellow-800"
                            >
                            ✕
                            </button>
                        </div>
                    )}

                    <ReactMarkdown 
                    components={{
                        p: ({node, ...props}) => <p className="mb-6 text-stone-800 font-serif text-[20px] leading-8" {...props} />,
                        strong: ({node, ...props}) => <span className="text-red-600 font-sans text-[0.7em] font-bold mr-1 -ml-2 align-top select-none opacity-60" {...props} />
                    }}
                    >
                    {text}
                    </ReactMarkdown>
                </article>
                
                <div className="mt-12 flex items-center justify-center space-x-6 border-t border-stone-100 pt-8">
                    <button 
                        onClick={handleExplain}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-12 h-12 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 group-hover:bg-red-50 group-hover:text-red-500 transition-colors">
                            <Info size={24} />
                        </div>
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-wide">Справка</span>
                    </button>
                    <button className="flex flex-col items-center gap-2 group">
                        <div className="w-12 h-12 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 group-hover:bg-stone-100 group-hover:text-stone-600 transition-colors">
                            <Share2 size={24} />
                        </div>
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-wide">Поделиться</span>
                    </button>
                </div>
            </>
            )}
        </div>
      </div>

      {!loading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center bg-white shadow-2xl rounded-full border border-stone-100 px-1 py-1 z-20">
            <button 
                onClick={handlePrevChapter}
                disabled={currentChapter <= 1}
                className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-stone-100 disabled:opacity-30 text-stone-600"
            >
                <ChevronLeft size={24} />
            </button>
            <div className="h-6 w-px bg-stone-200 mx-1"></div>
            <button 
                onClick={handleNextChapter}
                className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-600"
            >
                <ChevronRight size={24} />
            </button>
        </div>
      )}
    </div>
  );
};

export default ReadingView;
