'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ReadingSettings } from '@/features/reading/types';
import { markVerseNumbers } from './verse-markup';

interface BibleTextProps {
  text: string;
  settings: ReadingSettings;
  displayTheme?: 'light' | 'dark' | 'sepia';
}

export const BibleText: React.FC<BibleTextProps> = ({ text, settings, displayTheme }) => {
  const themeForColor = displayTheme ?? (settings.theme === 'system' ? 'light' : settings.theme) as 'light' | 'dark' | 'sepia';
  const textAlignClass = settings.text_align === 'center' ? 'text-center' : 
                         settings.text_align === 'justify' ? 'text-justify' : 'text-left';
  const textColorClass = themeForColor === 'dark' ? 'text-stone-100' :
                        themeForColor === 'sepia' ? 'text-stone-900' : 'text-stone-800';

  // Разметка стихов считается один раз; из неё же берём номер ПЕРВОГО стиха главы —
  // перед ним не ставим перенос при verse_per_line (иначе пустая строка в начале).
  // Номера стихов уникальны и строго возрастают (см. markVerseNumbers), поэтому
  // сравнение с первым номером надёжно опознаёт первый стих без счётчика-мутации.
  const markedText = markVerseNumbers(text);
  const firstVerseNum = markedText.match(/\*\*(\d+)\*\*/)?.[1] ?? null;

  return (
    <article
      className="prose prose-stone prose-lg"
      style={{
        '--reading-font-size': `${settings.font_size}px`,
        '--reading-line-height': settings.line_height,
      } as React.CSSProperties}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p
              className={`mb-7 ${textColorClass} font-serif ${textAlignClass}`}
              style={{
                fontSize: 'var(--reading-font-size)',
                lineHeight: 'var(--reading-line-height)',
              }}
            >{children}</p>
          ),
          strong: ({ children }) => {
            if (typeof children === 'string' && /^\d+$/.test(children.trim())) {
              const verseNum = children.trim();
              const isFirstVerse = verseNum === firstVerseNum;
              // «Стих с новой строки»: перенос ПЕРЕД номером, кроме самого первого стиха
              // главы (иначе перед текстом была бы пустая строка). При скрытых номерах
              // (verse_numbers_visible=false) перенос сохраняется — виден только сам разрыв.
              const verseBreak = settings.verse_per_line && !isFirstVerse ? <br /> : null;
              // data-verse ставим ВСЕГДА, даже когда номер визуально скрыт — это единственный
              // якорь начала стиха в DOM, по которому getTopVisibleVerse/scrollToVerse
              // восстанавливают позицию скролла при смене перевода (см. verse-anchor.ts).
              if (!settings.verse_numbers_visible) {
                return <>{verseBreak}<strong data-verse={verseNum} className="hidden">{children}</strong></>;
              }
              return <>{verseBreak}<strong data-verse={verseNum} className="font-bold px-2">{children}</strong></>;
            }
            return <span className="text-app-accent font-sans text-[0.55em] font-semibold mr-1 -ml-2 align-top select-none opacity-70 relative top-[-1px]">{children}</span>;
          }
        }}
      >
        {markedText}
      </ReactMarkdown>
    </article>
  );
};

