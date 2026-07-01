import {
  type DecomposedLine,
  decomposeLine,
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

export interface SongBlock {
  comment: string;
  content: string;
  commentType?: 'normal' | 'italic' | 'box';
  isChorus?: boolean;
  isRepeated?: boolean;
}

export interface StructuredSection {
  type: 'verse' | 'chorus' | 'tab' | 'comment';
  comment?: string;
  commentType?: 'normal' | 'italic' | 'box';
  lines: DecomposedLine[];
  isRepeated?: boolean;
}

export interface StructuredSong {
  sections: StructuredSection[];
  chorus?: StructuredSection;
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

        // Пропускаем директивы припевов (они обрабатываются в structurizeSong)
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
    });
  }

  return blocks.filter((block) => block.content.trim() || block.comment);
};

/**
 * Структуризация песни с поддержкой припевов и повторений
 * Аналогично методу structurize из оригинального проекта
 */
export function structurizeSong(content: string): StructuredSong {
  const lines = content.split('\n');
  const sections: StructuredSection[] = [];
  let currentSection: StructuredSection | null = null;
  let chorus: StructuredSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Пропускаем пустые строки в начале
    if (!trimmed && !currentSection) {
      continue;
    }

    // Обработка директив
    if (isDirective(line)) {
      const directive = parseDirective(line);
      if (!directive) {
        // Неизвестная директива - добавляем как обычную строку
        if (currentSection && trimmed) {
          currentSection.lines.push(decomposeLine(line));
        }
        continue;
      }

      // Начало припева
      if (isStartOfChorus(directive.type)) {
        chorus = {
          type: 'chorus',
          lines: [],
          comment: directive.value,
        };
        currentSection = chorus;
        continue;
      }

      // Конец припева
      if (isEndOfChorus(directive.type)) {
        if (chorus && chorus.lines.length > 0) {
          sections.push(chorus);
        }
        currentSection = null;
        continue;
      }

      // Вставка припева
      if (isChorusRepeat(directive.type)) {
        if (chorus && chorus.lines.length > 0) {
          sections.push({
            ...chorus,
            isRepeated: true,
          });
        }
        continue;
      }

      // Обработка комментариев
      if (isComment(directive.type) || isCommentItalic(directive.type) || isCommentBox(directive.type)) {
        if (currentSection && currentSection.lines.length > 0) {
          sections.push(currentSection);
        }

        const commentType = isCommentItalic(directive.type) ? 'italic' : isCommentBox(directive.type) ? 'box' : 'normal';

        currentSection = {
          type: 'verse',
          comment: directive.value,
          commentType,
          lines: [],
        };
        continue;
      }

      // Пропускаем метаданные
      if (isMetadata(directive.type)) {
        continue;
      }
    }

    // Обработка обычных строк
    if (trimmed) {
      if (!currentSection) {
        // Создаем секцию без комментария, если её нет
        currentSection = {
          type: 'verse',
          lines: [],
        };
      }
      currentSection.lines.push(decomposeLine(line));
    } else if (currentSection) {
      // Пустая строка - добавляем как пустую строку для форматирования
      currentSection.lines.push({ chords: [''], phrases: [''] });
    }
  }

  // Добавляем последнюю секцию
  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return { sections, chorus: chorus || undefined };
}
