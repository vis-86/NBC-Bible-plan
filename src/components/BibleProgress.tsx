'use client';

import React, { useState, useMemo } from 'react';
import { ArrowLeft, ChevronRight, Check } from 'lucide-react';
import { BIBLE_STRUCTURE } from '@/lib/constants';

interface BibleProgressProps {
  readChapters: Set<string>;
  onToggleChapter: (book: string, chapter: number) => void;
  onClose: () => void;
}

const BibleProgress: React.FC<BibleProgressProps> = ({ readChapters, onToggleChapter, onClose }) => {
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  const bookStats = useMemo(() => {
    return BIBLE_STRUCTURE.map(book => {
      let readCount = 0;
      for (let i = 1; i <= book.chapters; i++) {
        if (readChapters.has(`${book.name}_${i}`)) {
          readCount++;
        }
      }
      return {
        ...book,
        readCount,
        progress: Math.round((readCount / book.chapters) * 100)
      };
    });
  }, [readChapters]);

  const totalChapters = BIBLE_STRUCTURE.reduce((acc, b) => acc + b.chapters, 0);
  const totalRead = bookStats.reduce((acc, b) => acc + b.readCount, 0);
  const overallProgress = Math.round((totalRead / totalChapters) * 100);

  if (selectedBook) {
    const bookData = BIBLE_STRUCTURE.find(b => b.name === selectedBook);
    if (!bookData) return null;

    return (
      <div className="flex flex-col h-full bg-white dark:bg-stone-900 animate-in fade-in duration-300">
        <header className="flex items-center p-4 border-b border-stone-100 dark:border-stone-700 sticky top-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm z-20">
          <button 
            onClick={() => setSelectedBook(null)}
            className="p-2 -ml-2 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="ml-2 flex-1 text-center pr-8">
            <h2 className="font-bold text-lg text-stone-900 dark:text-stone-100">{bookData.name}</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 font-medium">
              {bookStats.find(b => b.name === selectedBook)?.readCount} из {bookData.chapters} прочитано
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 pb-32">
          <div className="grid grid-cols-5 gap-4 justify-items-center">
            {Array.from({ length: bookData.chapters }, (_, i) => i + 1).map(chapter => {
              const isRead = readChapters.has(`${bookData.name}_${chapter}`);
              return (
                <button
                  key={chapter}
                  onClick={() => onToggleChapter(bookData.name, chapter)}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                    ${isRead 
                      ? 'bg-red-500 text-white shadow-md' 
                      : 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700'
                    }
                  `}
                >
                  {isRead ? <Check size={20} strokeWidth={3} /> : chapter}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-stone-900 animate-in fade-in duration-300">
      <header className="px-6 py-5 bg-white dark:bg-stone-800 shadow-sm border-b border-stone-100 dark:border-stone-700 sticky top-0 z-20 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-2xl text-stone-900 dark:text-stone-100 mb-1">Книги</h2>
            <div className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
               {overallProgress}% Завершено
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center bg-stone-100 dark:bg-stone-700 rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-600"
          >
            ✕
          </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 pb-20">
        {bookStats.map((book) => (
          <button
            key={book.name}
            onClick={() => setSelectedBook(book.name)}
            className="w-full bg-white dark:bg-stone-800 px-5 py-4 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm flex items-center justify-between hover:border-red-200 dark:hover:border-red-800 active:bg-stone-50 dark:active:bg-stone-700 transition-all group"
          >
            <div className="flex items-center gap-4">
               <div className="relative w-10 h-10 flex items-center justify-center">
                   <svg className="w-full h-full transform -rotate-90">
                       <circle cx="20" cy="20" r="18" strokeWidth="3" fill="none" className="stroke-stone-200 dark:stroke-stone-600" />
                       <circle 
                         cx="20" cy="20" r="18" 
                         stroke={book.progress === 100 ? '#22c55e' : '#ef4444'} 
                         strokeWidth="3" 
                         fill="none" 
                         strokeDasharray="113"
                         strokeDashoffset={113 - (113 * book.progress) / 100}
                         className="transition-all duration-1000 ease-out"
                       />
                   </svg>
                   <span className="absolute text-[10px] font-bold text-stone-600 dark:text-stone-300">{book.progress}%</span>
               </div>
               
               <div className="text-left">
                    <span className="block font-bold text-stone-800 dark:text-stone-100 text-lg">{book.name}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">{book.chapters} глав</span>
               </div>
            </div>
            
            <ChevronRight size={20} className="text-stone-300 dark:text-stone-500 group-hover:text-red-400 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default BibleProgress;
