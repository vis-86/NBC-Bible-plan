import {
  isChorusRepeat,
  isComment,
  isCommentBox,
  isCommentItalic,
  isDirective,
  isEndOfChorus,
  isMetadata,
  isStartOfChorus,
  parseDirective,
} from './chordProUtils';
import { classifySection, type SongSectionKind } from './songSectionKind';

export interface SongBlock {
  comment: string;
  content: string;
  commentType?: 'normal' | 'italic' | 'box';
  /** Вид секции, выведенный из метки `{comment:}` (§3.6). */
  kind: SongSectionKind;
}

/**
 * Разбиение контента песни на логические блоки (куплеты/припевы и т.п.)
 * Поддерживает старый формат для обратной совместимости.
 *
 * Текст до первой метки `{comment:}` (и песня без меток целиком) — отдельный блок
 * без метки (`kind: 'other'`), а не выброшенный текст (M9, T0.4).
 */
export const parseSongBlocks = (content: string): SongBlock[] => {
  const blocks: SongBlock[] = [];
  const lines = content.split('\n');

  let currentComment = '';
  let currentCommentType: 'normal' | 'italic' | 'box' = 'normal';
  let currentContent = '';

  const flush = () => {
    if (currentContent.trim() || currentComment) {
      blocks.push({
        comment: currentComment,
        content: currentContent.trim(),
        commentType: currentCommentType,
        kind: classifySection(currentComment),
      });
    }
  };

  lines.forEach((line) => {
    // Проверяем директивы
    if (isDirective(line)) {
      const directive = parseDirective(line);
      if (directive) {
        // Обрабатываем комментарии
        if (isComment(directive.type) || isCommentItalic(directive.type) || isCommentBox(directive.type)) {
          flush();
          currentContent = '';
          currentComment = directive.value || '';
          currentCommentType = isCommentItalic(directive.type) ? 'italic' : isCommentBox(directive.type) ? 'box' : 'normal';
          return;
        }

        // Пропускаем метаданные
        if (isMetadata(directive.type)) {
          return;
        }

        // Пропускаем директивы припевов
        if (isStartOfChorus(directive.type) || isEndOfChorus(directive.type) || isChorusRepeat(directive.type)) {
          return;
        }
      }
    }

    // Старый формат комментариев для обратной совместимости
    const commentMatch = line.match(/^\s*\{\s*comment:\s*(.+?)\s*\}\s*$/i);
    if (commentMatch) {
      flush();
      currentContent = '';
      currentComment = commentMatch[1];
      currentCommentType = 'normal';
    } else {
      currentContent += `${line}\n`;
    }
  });

  flush();

  return blocks.filter((block) => block.content.trim() || block.comment);
};
