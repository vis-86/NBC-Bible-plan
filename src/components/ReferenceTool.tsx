'use client';

import React, { useState } from 'react';
import { Search, BookOpen, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getReferenceInfo } from '@/lib/ai';

const ReferenceTool: React.FC = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    const info = await getReferenceInfo(query);
    setResult(info);
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-6 pb-20 h-full flex flex-col bg-stone-50">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-serif font-bold text-stone-900 mb-2">Библейский Справочник</h1>
        <p className="text-stone-500 text-sm">Словарь, история, география и персоналии.</p>
      </header>

      <form onSubmit={handleSearch} className="mb-8 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Например: Кто такой Мелхиседек?"
          className="w-full bg-white border border-stone-200 rounded-xl px-5 py-4 pl-12 text-lg shadow-sm focus:ring-2 focus:ring-red-100 focus:outline-none transition-all placeholder:text-stone-300"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
        <button 
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-stone-800 text-white p-2 rounded-lg disabled:opacity-50"
        >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <span className="text-xs font-bold px-1">Найти</span>}
        </button>
      </form>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-stone-100 p-6 overflow-y-auto">
        {!result && !loading && (
           <div className="flex flex-col items-center justify-center h-full text-stone-300">
             <BookOpen size={64} strokeWidth={1} className="mb-4" />
             <p className="text-center text-sm max-w-xs">Введите термин, имя или вопрос, чтобы получить справку из базы знаний.</p>
           </div>
        )}

        {loading && (
           <div className="flex flex-col items-center justify-center h-full space-y-4">
             <Loader2 size={32} className="text-red-500 animate-spin" />
             <p className="text-stone-400 text-sm">Поиск информации...</p>
           </div>
        )}

        {result && (
          <article className="prose prose-stone prose-p:text-stone-700">
            <ReactMarkdown>{result}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  );
};

export default ReferenceTool;
