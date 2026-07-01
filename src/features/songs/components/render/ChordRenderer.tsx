'use client';

/**
 * Компонент для рендеринга аккорда
 * Принцип: Single Responsibility - только отображение аккорда
 */
import type React from 'react';
import { useMemo } from 'react';

interface ChordRendererProps {
  chord: string;
  lyrics?: string;
  isChordsOnly: boolean;
  hideChords: boolean;
}

/**
 * Интерфейс для токена аккорда
 */
interface ChordToken {
  text: string;
  type: 'note' | 'sharp' | 'flat' | 'number' | 'slash' | 'minor' | 'modifier' | 'bracket' | 'other';
  startIndex: number;
}

/**
 * Разбивает аккорд на токены (нота, модификаторы, цифры и т.д.)
 */
function tokenizeChord(chord: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  let i = 0;

  // Список известных модификаторов (более длинные должны идти первыми)
  const modifiers = ['dim7', 'aug7', 'maj7', 'min7', 'dom7', 'add', 'sus', 'dim', 'aug', 'maj', 'min', 'dom'];

  while (i < chord.length) {
    const char = chord[i];

    // Ноты (A-H)
    if (/[A-H]/.test(char)) {
      const note = char;
      i++;
      // Проверяем диез или бемоль после ноты
      if (i < chord.length) {
        if (chord[i] === '#' || chord[i] === '♯') {
          tokens.push({ text: note, type: 'note', startIndex: i - 1 });
          tokens.push({ text: chord[i], type: 'sharp', startIndex: i });
          i++;
          continue;
        }
        if (chord[i] === 'b' || chord[i] === '♭') {
          // Проверяем, не является ли это частью модификатора (например, "maj")
          if (i + 1 < chord.length && /[a-z]/.test(chord[i + 1])) {
            // Это часть модификатора, не бемоль
            tokens.push({ text: note, type: 'note', startIndex: i - 1 });
            i++;
            continue;
          }
          tokens.push({ text: note, type: 'note', startIndex: i - 1 });
          tokens.push({ text: chord[i], type: 'flat', startIndex: i });
          i++;
          continue;
        }
      }
      tokens.push({ text: note, type: 'note', startIndex: i - 1 });
      continue;
    }

    // Слэш (для басовых нот)
    if (char === '/') {
      tokens.push({ text: char, type: 'slash', startIndex: i });
      i++;
      continue;
    }

    // Скобки
    if (/[()]/.test(char)) {
      tokens.push({ text: char, type: 'bracket', startIndex: i });
      i++;
      continue;
    }

    // Модификаторы (+, -)
    if (/[+-]/.test(char)) {
      tokens.push({ text: char, type: 'modifier', startIndex: i });
      i++;
      continue;
    }

    // Проверяем многосимвольные модификаторы (важно делать это до обработки одиночных букв)
    let foundModifier = false;
    const remaining = chord.substring(i).toLowerCase();
    for (const modifier of modifiers) {
      if (remaining.startsWith(modifier.toLowerCase())) {
        // Сохраняем оригинальный регистр из аккорда
        const originalModifier = chord.substring(i, i + modifier.length);
        tokens.push({ text: originalModifier, type: 'modifier', startIndex: i });
        i += modifier.length;
        foundModifier = true;
        break;
      }
    }
    if (foundModifier) continue;

    // Минор (m) - только если это не часть другого слова
    if (char === 'm' && i > 0 && !/[a-z]/.test(chord[i - 1]) && (i === chord.length - 1 || !/[a-z]/.test(chord[i + 1]))) {
      tokens.push({ text: char, type: 'minor', startIndex: i });
      i++;
      continue;
    }

    // Цифры
    if (/\d/.test(char)) {
      let number = char;
      i++;
      // Собираем все следующие цифры
      while (i < chord.length && /\d/.test(chord[i])) {
        number += chord[i];
        i++;
      }
      tokens.push({ text: number, type: 'number', startIndex: i - number.length });
      continue;
    }

    // Остальные символы (буквы, которые не являются нотами или модификаторами)
    if (/[a-z]/.test(char)) {
      let text = char;
      i++;
      // Собираем все следующие буквы
      while (i < chord.length && /[a-z]/.test(chord[i])) {
        text += chord[i];
        i++;
      }
      // Проверяем, не является ли это модификатором
      const lowerText = text.toLowerCase();
      if (modifiers.some((m) => m.toLowerCase() === lowerText)) {
        tokens.push({ text: text, type: 'modifier', startIndex: i - text.length });
      } else {
        tokens.push({ text: text, type: 'other', startIndex: i - text.length });
      }
      continue;
    }

    // Неизвестный символ
    tokens.push({ text: char, type: 'other', startIndex: i });
    i++;
  }

  return tokens;
}

/**
 * Преобразует тип токена в CSS класс
 */
function getTokenClassName(type: ChordToken['type']): string {
  const classMap: Record<ChordToken['type'], string> = {
    note: 'chordSignNote',
    sharp: 'chordSignSharp',
    flat: 'chordSignFlat',
    number: 'chordSignNumber',
    slash: 'chordSignSlash',
    minor: 'chordSignMinor',
    modifier: 'chordSignModifier',
    bracket: 'chordSignBracket',
    other: 'chordSign',
  };
  return classMap[type] || 'chordSign';
}

/**
 * Разбивает аккорд на токены и оборачивает каждый в wrapper
 */
function renderChordSigns(chord: string): React.ReactNode[] {
  const tokens = tokenizeChord(chord);

  return tokens.map((token, tokenIndex) => {
    const className = getTokenClassName(token.type);

    // Если токен состоит из нескольких символов, оборачиваем каждый символ
    if (token.text.length > 1) {
      return (
        <span key={`token-${tokenIndex}`} className="chordToken">
          {Array.from(token.text).map((char, charIndex) => (
            <span
              key={`sign-${token.startIndex + charIndex}`}
              className={`chordSign ${className}`}
              data-char={char}
              data-index={token.startIndex + charIndex}
              data-token-type={token.type}
            >
              {char}
            </span>
          ))}
        </span>
      );
    }

    // Одиночный символ
    return (
      <span key={`sign-${token.startIndex}`} className={`chordSign ${className}`} data-char={token.text} data-index={token.startIndex} data-token-type={token.type}>
        {token.text}
      </span>
    );
  });
}

export const ChordRenderer: React.FC<ChordRendererProps> = ({ chord, lyrics = '', isChordsOnly, hideChords }) => {
  const chordSigns = useMemo(() => renderChordSigns(chord), [chord]);
  const hasChordLyricsSpace = !lyrics && !isChordsOnly;

  if (hideChords) {
    return lyrics ? <>{lyrics}</> : null;
  }

  const classes = ['chordWrapper'];
  if (hasChordLyricsSpace) {
    classes.push('wordWrapper-with-start-chord');
    // wordWrapper-with-end-chord добавляется только в LineRenderer.tsx с проверкой длины слова
  }

  return (
    <span className={classes.join(' ')}>
      <code className="chord" data-chordname={chord}>
        {chordSigns}
      </code>
      <span className="chordLyrics">{lyrics || (!isChordsOnly ? <span className="chordLyricsSpace">{'_'}</span> : ' ')}</span>
    </span>
  );
};

export default ChordRenderer;
