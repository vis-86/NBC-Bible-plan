'use client';

/**
 * Компонент для рендеринга строки песни
 * Принцип: Single Responsibility - только рендеринг строки
 */
import React, { useMemo } from 'react';
import { ChordRenderer } from './ChordRenderer';
import { hasLetters, parseLine, splitIntoWords } from '../../lib/lineParser';

interface LineRendererProps {
  line: string;
}

/**
 * Рендерит слово с аккордами
 * Возвращает объект с элементом и информацией о том, начинается/заканчивается ли слово аккордом
 */
const renderWord = (word: string, isChordsOnly: boolean, key: number): { element: React.ReactNode; startsWithChord: boolean; endsWithChord: boolean } => {
  const parts = word.split(/(\[.*?\])/g).filter(Boolean);
  const children: React.ReactNode[] = [];
  let childKey = 0;
  let startsWithChord = false;
  let endsWithChord = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith('[') && part.endsWith(']')) {
      // Проверяем паттерн [(][аккорд][)] - объединяем скобки с аккордом
      const chord = part.slice(1, -1);
      const nextPart = parts[i + 1];
      const nextNextPart = parts[i + 2];

      // Если текущий токен - открывающая скобка, следующий - аккорд, а после - закрывающая скобка
      if (chord === '(' && nextPart?.startsWith('[') && nextPart?.endsWith(']')) {
        const middleChord = nextPart.slice(1, -1);
        // Проверяем, что средний токен не является скобкой (это аккорд)
        if (middleChord !== '(' && middleChord !== ')') {
          // Проверяем, что следующий токен - закрывающая скобка
          if (nextNextPart?.startsWith('[') && nextNextPart?.endsWith(']')) {
            const closingBracket = nextNextPart.slice(1, -1);
            if (closingBracket === ')') {
              // Объединяем: (аккорд)
              const combinedChord = `(${middleChord})`;
              const lyricsPart = parts[i + 3];
              const lyrics = lyricsPart && !lyricsPart.startsWith('[') ? lyricsPart : '';

              children.push(<ChordRenderer key={`chord-${key}-${childKey++}`} chord={combinedChord} lyrics={lyrics} isChordsOnly={isChordsOnly} />);

              // Пропускаем обработанные токены
              i += 2; // Пропускаем [(] и [аккорд]
              if (lyrics) {
                i++; // Пропускаем текст
              }
              continue;
            }
          }
        }
      }

      // Обычная обработка аккорда
      const nextIsChord = nextPart?.startsWith('[') && nextPart?.endsWith(']');
      const lyrics = nextPart && !nextIsChord ? nextPart : '';

      children.push(<ChordRenderer key={`chord-${key}-${childKey++}`} chord={chord} lyrics={lyrics} isChordsOnly={isChordsOnly} />);

      if (lyrics) {
        i++; // Пропускаем следующий токен
      }
    } else if (part.trim()) {
      // Текст
      children.push(<React.Fragment key={`text-${key}-${childKey++}`}>{part}</React.Fragment>);
    }
  }

  // Определяем, начинается ли слово с аккорда
  if (children.length > 0) {
    const firstChild = children[0];
    startsWithChord = React.isValidElement(firstChild) && firstChild.type === ChordRenderer;
  }

  // Определяем, заканчивается ли слово аккордом
  if (children.length > 0) {
    const lastChild = children[children.length - 1];
    endsWithChord = React.isValidElement(lastChild) && lastChild.type === ChordRenderer;
  }

  // Проверяем, есть ли в слове аккорды
  const hasChords = children.some((child) => React.isValidElement(child) && child.type === ChordRenderer);

  const wordHasLetters = hasLetters(word);
  if (wordHasLetters) {
    const classes = ['wordWrapper'];
    if (!hasChords) {
      classes.push('wordWrapper-only-lyric');
    } else {
      if (startsWithChord) {
        classes.push('wordWrapper-with-start-chord');
      }
      // Добавляем wordWrapper-with-end-chord только если слово больше 3 символов
      // Если меньше 3, добавляем wordWrapper-min-3
      if (endsWithChord) {
        const textOnly = word.replace(/\[.*?\]/g, '').trim();
        if (textOnly.length > 3) {
          classes.push('wordWrapper-with-end-chord');
        } else {
          classes.push('wordWrapper-min-3');
        }
      }
    }

    return {
      element: (
        <span key={`word-${key}`} className={classes.join(' ')}>
          {children}
        </span>
      ),
      startsWithChord,
      endsWithChord,
    };
  }

  // Слово только из аккордов
  return {
    element: <React.Fragment key={`chords-only-${key}`}>{children}</React.Fragment>,
    startsWithChord,
    endsWithChord,
  };
};

export const LineRenderer: React.FC<LineRendererProps> = ({ line }) => {
  const { isChordsOnly } = useMemo(() => parseLine(line), [line]);
  const className = `cproSongLine${isChordsOnly ? ' chordsOnly' : ''}`;

  const segments = useMemo(() => {
    const words = splitIntoWords(line);
    const result: React.ReactNode[] = [];
    const wordInfo: Array<{ element: React.ReactNode; startsWithChord: boolean; endsWithChord: boolean }> = [];
    let key = 0;

    for (const word of words) {
      if (/\s+/.test(word)) {
        // Пробелы
        result.push(<React.Fragment key={`space-${key++}`}>{word}</React.Fragment>);
      } else {
        // Слово
        const wordData = renderWord(word, isChordsOnly, key++);
        wordInfo.push(wordData);
        result.push(wordData.element);
      }
    }

    // Оптимизация: переносим хвостовые аккорды в последнее слово с буквами
    let lastWordIdx = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      const segment = result[i];
      if (React.isValidElement(segment) && segment.type === 'span') {
        const props = segment.props as { className?: string };
        if (props.className?.includes('wordWrapper')) {
          lastWordIdx = i;
          break;
        }
      }
    }

    if (lastWordIdx >= 0 && lastWordIdx < result.length - 1) {
      const tailChords: React.ReactNode[] = [];
      for (let i = result.length - 1; i > lastWordIdx; i--) {
        const segment = result[i];
        if (React.isValidElement(segment) && segment.type === 'span') {
          const props = segment.props as { className?: string };
          if (props.className === 'chordWrapper') {
            tailChords.unshift(segment);
            result.splice(i, 1);
          }
        }
      }

      if (tailChords.length > 0) {
        const lastWord = result[lastWordIdx];
        if (React.isValidElement(lastWord)) {
          const lastWordProps = lastWord.props as { children?: React.ReactNode };
          result[lastWordIdx] = React.cloneElement(lastWord, { key: lastWord.key }, ...React.Children.toArray(lastWordProps.children), ...tailChords);
        }
      }
    }

    return result;
  }, [line, isChordsOnly]);

  return <span className={className}>{segments}</span>;
};

export default LineRenderer;
