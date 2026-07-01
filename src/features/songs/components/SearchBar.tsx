'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  /** Вызывается с задержкой (debounce) при вводе. */
  onSearch: (query: string) => void;
  placeholder?: string;
}

/** Строка поиска с debounce (200мс) и кнопкой очистки. */
export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, placeholder = 'Поиск песни…' }) => {
  const [text, setText] = useState('');

  useEffect(() => {
    const t = setTimeout(() => onSearch(text), 200);
    return () => clearTimeout(t);
  }, [text, onSearch]);

  return (
    <div className="relative" data-song-search>
      <Search
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted"
        aria-hidden
      />
      <input
        data-song-search-input
        type="search"
        inputMode="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Поиск песни"
        className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-10 pr-10 text-app-text placeholder:text-app-text-muted outline-none transition-colors focus:border-app-primary"
      />
      {text && (
        <button
          type="button"
          data-song-search-clear
          onClick={() => setText('')}
          aria-label="Очистить поиск"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted transition-colors hover:text-app-text-secondary"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
