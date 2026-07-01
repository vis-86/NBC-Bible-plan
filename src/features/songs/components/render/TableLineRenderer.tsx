'use client';

/**
 * Компонент для табличного рендеринга строки песни
 * Аналогично оригинальному ChordPro - таблица с аккордами сверху и лирикой снизу
 */
import type React from 'react';
import { useMemo } from 'react';
import { decomposeLine, escapeHtml } from '../../lib/chordProUtils';
import { ChordRenderer } from './ChordRenderer';

interface TableLineRendererProps {
  line: string;
  hideChords: boolean;
  fontSize?: number;
}

/**
 * Распределяет текст по ячейкам, минимизируя разрывы
 * Аналогично примеру из HTML - каждая ячейка содержит либо аккорд/спецсимвол с текстом, либо только текст
 * Текст объединяется в одну ячейку, если между фразами нет аккордов
 */
function distributeTextToCells(
  chords: string[],
  phrases: string[],
  specialSymbols: string[] = [],
): Array<{ chord: string; text: string; isEmpty: boolean; isSpecialSymbol?: boolean }> {
  const cells: Array<{ chord: string; text: string; isEmpty: boolean; isSpecialSymbol?: boolean }> = [];

  // Обрабатываем каждую позицию
  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i] || '';
    const specialSymbol = specialSymbols[i] || '';
    const phrase = phrases[i] || '';

    // Если есть специальный символ, создаем отдельную ячейку для него
    if (specialSymbol) {
      cells.push({
        chord: specialSymbol,
        text: phrase,
        isEmpty: false,
        isSpecialSymbol: true,
      });
    }
    // Если есть аккорд, создаем отдельную ячейку для него
    else if (chord.trim()) {
      cells.push({
        chord: chord,
        text: phrase,
        isEmpty: false,
        isSpecialSymbol: false,
      });
    }
    // Если нет ни аккорда, ни спецсимвола, но есть текст
    else if (phrase.trim()) {
      // Добавляем текст к предыдущей ячейке или создаем новую текстовую ячейку
      if (cells.length > 0 && !cells[cells.length - 1].chord.trim()) {
        // Объединяем с предыдущей текстовой ячейкой (минимизируем разрывы)
        cells[cells.length - 1].text += phrase;
      } else {
        // Создаем новую текстовую ячейку
        cells.push({
          chord: '',
          text: phrase,
          isEmpty: false,
          isSpecialSymbol: false,
        });
      }
    }
    // Если строка начинается с пустого аккорда и пустого спецсимвола, но есть текст - это отступ
    else if (i === 0 && phrase) {
      cells.push({ chord: '', text: phrase, isEmpty: false });
    }
  }

  // Если нет ячеек, создаем одну пустую
  if (cells.length === 0) {
    cells.push({ chord: '', text: '', isEmpty: true });
  }

  return cells;
}

export const TableLineRenderer: React.FC<TableLineRendererProps> = ({ line, hideChords, fontSize }) => {
  const cells = useMemo(() => {
    const { chords, phrases, hasIndent, specialSymbols = [] } = decomposeLine(line);

    // Проверяем, есть ли аккорды или специальные символы
    const hasChords = chords.some((c) => c.trim() !== '');
    const hasSpecialSymbols = specialSymbols.some((s) => s.trim() !== '');
    const hasAnyUpperContent = hasChords || hasSpecialSymbols;

    // Если нет аккордов/спецсимволов или скрыты, показываем только текст
    if ((!hasAnyUpperContent || hideChords) && !hasSpecialSymbols) {
      const lyricsText = phrases.join('').trimEnd();
      if (!lyricsText) {
        // Пустая строка - возвращаем пустую таблицу
        return {
          cells: [{ chord: '', text: '', isEmpty: true, hasIndent }],
          hasChords: false,
        };
      }

      return {
        cells: [{ chord: '', text: lyricsText, isEmpty: false, hasIndent }],
        hasChords: false,
      };
    }

    // Распределяем текст по ячейкам
    const distributedCells = distributeTextToCells(chords, phrases, specialSymbols);

    // Если нет ячеек после распределения, создаем пустую
    if (distributedCells.length === 0) {
      return {
        cells: [{ chord: '', text: '', isEmpty: true, hasIndent }],
        hasChords: false,
      };
    }

    return {
      cells: distributedCells.map((cell) => ({ ...cell, hasIndent: cell === distributedCells[0] && hasIndent })),
      hasChords: hasAnyUpperContent,
    };
  }, [line, hideChords]);

  const { cells: cellData, hasChords } = cells;

  return (
    <table className="cproTableLine" cellPadding="0" cellSpacing="0" style={{ fontSize: fontSize ? `${fontSize}px` : undefined }}>
      <tbody>
        {/* Ряд с аккордами и специальными символами */}
        <tr className="cproTableChords">
          {cellData.map((cell, i) => (
            <td key={`chord-${i}`} className={cell.hasIndent ? 'indent' : ''}>
              {
                cell.chord ? (
                  cell.isSpecialSymbol ? (
                    // Специальный символ отображается как обычный текст
                    <span className="cproSpecialSymbol">{escapeHtml(cell.chord)}</span>
                  ) : (
                    <ChordRenderer chord={cell.chord} lyrics="" isChordsOnly={false} hideChords={hideChords} />
                  )
                ) : hasChords ? (
                  ' '
                ) : null // Неразрывный пробел
              }
            </td>
          ))}
        </tr>
        {/* Ряд с лирикой */}
        <tr className="cproTableLyrics">
          {cellData.map((cell, i) => (
            <td key={`lyrics-${i}`} className={`cproTableLyricsCell ${cell.hasIndent ? 'indent' : ''}`}>
              {cell.text ? escapeHtml(cell.text) : hasChords ? ' ' : null}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
};

export default TableLineRenderer;
