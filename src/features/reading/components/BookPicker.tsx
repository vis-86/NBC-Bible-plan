'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { getApiPath } from '@/shared/utils/api';
import { readThrough } from '@/shared/offline/readThrough';

const BOOKS_CACHE_KEY = 'bible:books';

interface Book {
  name: string;
  chapters: number;
}

interface BookPickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentBook?: string | null;
  currentChapter?: number | null;
  onSelectBook: (book: string, chapter: number) => void;
}

export const BookPicker: React.FC<BookPickerProps> = ({
  isOpen,
  onClose,
  currentBook,
  currentChapter,
  onSelectBook
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  useEffect(() => {
    if (isOpen && books.length === 0) {
      fetchBooks();
    }
  }, [isOpen]);

  useEffect(() => {
    // Сбрасываем выбранную книгу при закрытии
    if (!isOpen) {
      setSelectedBook(null);
    }
  }, [isOpen]);

  const fetchBooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readThrough(BOOKS_CACHE_KEY, async () => {
        const response = await fetch(getApiPath('/api/bible/books'), {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Не удалось загрузить список книг');
        }
        return response.json();
      });
      setBooks(data.books || []);
    } catch (err: any) {
      console.error('Error fetching books:', err);
      setError(err.message || 'Ошибка при загрузке книг');
    } finally {
      setLoading(false);
    }
  };

  const handleBookClick = (book: Book) => {
    // При клике на книгу показываем сетку глав
    setSelectedBook(book);
  };

  const handleChapterClick = (chapter: number) => {
    if (selectedBook) {
      onSelectBook(selectedBook.name, chapter);
      onClose();
    }
  };

  const handleBackToBooks = () => {
    setSelectedBook(null);
  };

  // Разделяем книги на Ветхий и Новый Завет
  // Ветхий Завет: первые 40 книг (до "Малахия" включительно)
  // Новый Завет: остальные книги (начиная с "От Матфея")
  const oldTestamentBooks = books.filter((book, index) => index < 40);
  const newTestamentBooks = books.filter((book, index) => index >= 40);

  // Если выбрана книга, показываем сетку глав
  if (selectedBook) {
    const chapters = Array.from({ length: selectedBook.chapters }, (_, i) => i + 1);
    const isCurrentBook = currentBook === selectedBook.name;

    return (
      <BottomSheet 
        isOpen={isOpen} 
        onClose={onClose}
        title={selectedBook.name}
        maxHeight="max-h-[90vh]"
      >
        <div className="pb-24">
          {/* Кнопка назад */}
          <button
            onClick={handleBackToBooks}
            className="flex items-center gap-2 mb-4 text-app-text-secondary hover:text-app-text transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Назад к книгам</span>
          </button>

          {/* Сетка глав */}
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3">
            {chapters.map((chapter) => {
              const isCurrent = isCurrentBook && currentChapter === chapter;
              return (
                <button
                  key={chapter}
                  onClick={() => handleChapterClick(chapter)}
                  className={`
                    aspect-square rounded-app-sm border-2 flex items-center justify-center text-sm font-bold transition-all
                    ${isCurrent
                      ? 'border-app-primary bg-app-primary-light text-app-primary'
                      : 'border-app-border hover:border-app-border-subtle bg-app-surface text-app-text hover:bg-app-surface-muted'
                    }
                    active:scale-95
                  `}
                >
                  {chapter}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet 
      isOpen={isOpen} 
      onClose={onClose}
      title="Выберите книгу"
      maxHeight="max-h-[90vh]"
    >
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-app-text-muted">Загрузка...</div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-12">
          <div className="text-app-accent">{error}</div>
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <div className="space-y-6 pb-24">
          {/* Ветхий Завет */}
          <div>
            <h3 className="text-sm font-bold text-app-text-muted uppercase tracking-wider mb-3 sticky top-0 bg-app-surface py-2 z-10">
              Ветхий Завет
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {oldTestamentBooks.map((book) => {
                const isCurrent = currentBook === book.name;
                return (
                  <button
                    key={book.name}
                    onClick={() => handleBookClick(book)}
                    className={`
                      p-3 rounded-app-md border-2 text-left transition-all
                      ${isCurrent
                        ? 'border-app-primary bg-app-primary-light text-app-primary font-semibold'
                        : 'border-app-border hover:border-app-border-subtle bg-app-surface text-app-text'
                      }
                      active:scale-95
                    `}
                  >
                    <div className="text-sm font-medium leading-tight mb-1">
                      {book.name}
                    </div>
                    <div className="text-xs text-app-text-muted">
                      {book.chapters} {book.chapters === 1 ? 'глава' : book.chapters < 5 ? 'главы' : 'глав'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Новый Завет */}
          <div>
            <h3 className="text-sm font-bold text-app-text-muted uppercase tracking-wider mb-3 sticky top-0 bg-app-surface py-2 z-10">
              Новый Завет
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {newTestamentBooks.map((book) => {
                const isCurrent = currentBook === book.name;
                return (
                  <button
                    key={book.name}
                    onClick={() => handleBookClick(book)}
                    className={`
                      p-3 rounded-app-md border-2 text-left transition-all
                      ${isCurrent
                        ? 'border-app-primary bg-app-primary-light text-app-primary font-semibold'
                        : 'border-app-border hover:border-app-border-subtle bg-app-surface text-app-text'
                      }
                      active:scale-95
                    `}
                  >
                    <div className="text-sm font-medium leading-tight mb-1">
                      {book.name}
                    </div>
                    <div className="text-xs text-app-text-muted">
                      {book.chapters} {book.chapters === 1 ? 'глава' : book.chapters < 5 ? 'главы' : 'глав'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};

