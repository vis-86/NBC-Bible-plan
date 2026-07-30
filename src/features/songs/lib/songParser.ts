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
 * Поддерживает старый формат для обратной совместимости
 */
export const parseSongBlocks = (content: string): SongBlock[] => {
  const blocks: SongBlock[] = [];
  const lines = content.split('\n');

  let currentComment = '';
  let currentCommentType: 'normal' | 'italic' | 'box' = 'normal';
  let currentContent = '';
  let hasStartedFirstBlock = false;

  lines.forEach((line) => {
    // Проверяем директивы
    if (isDirective(line)) {
      const directive = parseDirective(line);
      if (directive) {
        // Обрабатываем комментарии
        if (isComment(directive.type) || isCommentItalic(directive.type) || isCommentBox(directive.type)) {
          if ((currentContent.trim() || currentComment) && hasStartedFirstBlock) {
            blocks.push({
              comment: currentComment,
              content: currentContent.trim(),
              commentType: currentCommentType,
              kind: classifySection(currentComment),
            });
          }
          currentContent = '';
          currentComment = directive.value || '';
          currentCommentType = isCommentItalic(directive.type) ? 'italic' : isCommentBox(directive.type) ? 'box' : 'normal';
          hasStartedFirstBlock = true;
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

    const isEmptyLine = line.trim() === '';

    // Старый формат комментариев для обратной совместимости
    const commentMatch = line.match(/^\s*\{\s*comment:\s*(.+?)\s*\}\s*$/i);
    if (commentMatch) {
      if ((currentContent.trim() || currentComment) && hasStartedFirstBlock) {
        blocks.push({
          comment: currentComment,
          content: currentContent.trim(),
          commentType: currentCommentType,
          kind: classifySection(currentComment),
        });
      }
      currentContent = '';
      currentComment = commentMatch[1];
      currentCommentType = 'normal';
      hasStartedFirstBlock = true;
    } else if (isEmptyLine && !hasStartedFirstBlock) {
      return;
    } else {
      currentContent += `${line}\n`;
      if (!hasStartedFirstBlock && line.trim() && currentComment) {
        hasStartedFirstBlock = true;
      }
    }
  });

  if ((currentContent.trim() || currentComment) && hasStartedFirstBlock) {
    blocks.push({
      comment: currentComment,
      content: currentContent.trim(),
      commentType: currentCommentType,
      kind: classifySection(currentComment),
    });
  }

  return blocks.filter((block) => block.content.trim() || block.comment);
};
