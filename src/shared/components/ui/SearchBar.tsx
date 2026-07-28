'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  /** Вызывается с задержкой (debounce) при вводе. */
  onSearch: (query: string) => void;
  placeholder?: string;
  /** Начальное значение (восстановление поискового запроса при возврате к списку). */
  initialValue?: string;
}

/** Строка поиска с debounce (200мс) и кнопкой очистки. */
export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, placeholder = 'Поиск песни…', initialValue = '' }) => {
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

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
        ref={inputRef}
        data-song-search-input
        type="search"
        inputMode="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Поиск песни"
        className="w-full rounded-app-md border border-app-border bg-app-surface py-2.5 pl-10 pr-11 text-app-text placeholder:text-app-text-muted outline-none transition-colors focus:border-app-primary"
      />
      {text && (
        <button
          type="button"
          data-song-search-clear
          onClick={() => {
            setText('');
            // Синхронно, прямо в обработчике клика: отложенный focus() (эффект, таймер)
            // iOS уже не считает жестом пользователя и клавиатуру не поднимает.
            inputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-app-text-muted transition-colors hover:text-app-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary rounded-r-app-md"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
