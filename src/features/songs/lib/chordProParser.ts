import type { Song } from '../types';

export interface ChordProMetadata {
  title?: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  tempo?: string;
  time?: string;
  capo?: string;
  [key: string]: string | undefined;
}

export interface ParsedChordPro {
  metadata: ChordProMetadata;
  content: string;
  id: string;
}

/**
 * Парсит ChordPro файл и извлекает метаданные и контент.
 *
 * `filename` используется для извлечения числового id и как контекст в логах
 * при проблемах парсинга (standard logging — см. import-скрипт).
 */
export function parseChordProFile(content: string, filename: string): ParsedChordPro {
  const lines = content.split('\n');
  const metadata: ChordProMetadata = {};
  const contentLines: string[] = [];
  let inContent = false;

  // Извлекаем ID из имени файла (например, "123-название-песни.chordpro" -> "123")
  const idMatch = filename.match(/^(\d+)-/);
  const id = idMatch ? idMatch[1] : filename.replace(/\.chordpro$/i, '');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Пропускаем пустые строки в начале
    if (!inContent && !trimmedLine) {
      continue;
    }

    // Парсим метаданные в формате {key: value}
    const metadataMatch = trimmedLine.match(/^\{\s*([^:]+):\s*(.+?)\s*\}$/);
    if (metadataMatch && !inContent) {
      const key = metadataMatch[1].toLowerCase();
      const value = metadataMatch[2];

      // Пропускаем комментарии - они должны быть в контенте
      if (key === 'comment') {
        inContent = true;
        contentLines.push(line);
        continue;
      }

      // Обрабатываем специальные случаи
      switch (key) {
        case 'title':
          metadata.title = value;
          break;
        case 'subtitle':
          metadata.subtitle = value;
          // Если есть subtitle, используем его как artist
          if (!metadata.artist) {
            metadata.artist = value;
          }
          break;
        case 'key':
          metadata.key = value;
          break;
        case 'tempo':
          metadata.tempo = value;
          break;
        case 'time':
          metadata.time = value;
          break;
        case 'capo':
          metadata.capo = value;
          break;
        default:
          metadata[key] = value;
      }
      continue;
    }

    // Пропускаем теги {new_song}
    if (trimmedLine === '{new_song}') {
      continue;
    }

    // Если дошли до контента, начинаем его собирать
    if (!inContent && trimmedLine) {
      inContent = true;
    }

    if (inContent) {
      contentLines.push(line);
    }
  }

  // Объединяем контент обратно
  const fullContent = contentLines.join('\n').trim();

  // Если нет title в метаданных, пытаемся извлечь из контента
  if (!metadata.title) {
    const titleMatch = fullContent.match(/^\{\s*title:\s*(.+?)\s*\}$/m);
    if (titleMatch) {
      metadata.title = titleMatch[1];
    }
  }

  // Standard logging: сигналим о вероятных проблемах данных с контекстом файла.
  if (!metadata.title) {
    console.warn(`[chordProParser] no {title} directive found in "${filename}"`);
  }
  if (!fullContent) {
    console.warn(`[chordProParser] empty content after metadata in "${filename}"`);
  }

  return {
    metadata,
    content: fullContent,
    id,
  };
}

/**
 * Конвертирует парсированный ChordPro в доменный тип Song.
 */
export function chordProToSong(parsed: ParsedChordPro): Song {
  return {
    id: parsed.id,
    title: parsed.metadata.title || 'Без названия',
    subtitle: parsed.metadata.subtitle || parsed.metadata.artist || undefined,
    key: parsed.metadata.key,
    tempo: parsed.metadata.tempo,
    time: parsed.metadata.time,
    content: parsed.content,
  };
}
