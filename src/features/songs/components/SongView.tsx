'use client';

import type React from 'react';
import { useMemo } from 'react';
import { parseSongBlocks } from '../lib/songParser';
import { SongBlock } from './render/SongBlock';
import './render/songs.css';

interface SongViewProps {
  /** Сырой ChordPro-контент песни. */
  content: string;
  title?: string;
  subtitle?: string;
  /** Тональность (проп назван songKey, чтобы не путать с React key). */
  songKey?: string;
  tempo?: string;
  /** Размер шрифта лирики в px — задаёт CSS-переменную `--lyric-size` на корне. */
  fontSize?: number;
  /** Скрыть аккорды (режим «только текст») — переключает `data-chords="off"` на корне. */
  hideChords?: boolean;
}

/**
 * Одноколоночный просмотр песни: шапка (title/subtitle/key·tempo) + список блоков.
 *
 * Порт `MobileBlocksLayout` без autoscroll: убраны `scrollIntoView`/эффект активного
 * блока и клики — в v1 песня статична (фокус-режим чтения).
 */
export const SongView: React.FC<SongViewProps> = ({ content, title, subtitle, songKey, tempo, fontSize, hideChords = false }) => {
  const blocks = useMemo(() => parseSongBlocks(content), [content]);

  if (process.env.NODE_ENV !== 'production') {
    // Standard logging: сколько блоков распарсили (диагностика пустых/битых песен).
    console.debug(`[SongView] parsed ${blocks.length} block(s)`, { title });
  }

  const meta = [songKey, tempo].filter(Boolean).join(' · ');

  return (
    <article
      className="cproSongBody"
      data-song-view
      data-chords={hideChords ? 'off' : undefined}
      style={fontSize ? ({ '--lyric-size': `${fontSize}px` } as React.CSSProperties) : undefined}
    >
      {(title || subtitle || meta) && (
        <header className="song-view-header" data-song-view-header>
          {title && <h1 className="song-view-title" data-song-view-title>{title}</h1>}
          {subtitle && <p className="song-view-subtitle" data-song-view-subtitle>{subtitle}</p>}
          {meta && <span className="song-view-meta" data-song-view-meta>{meta}</span>}
        </header>
      )}

      <div className="song-blocks-layout single" data-song-view-blocks>
        {blocks.map((block, index) => (
          <SongBlock key={index} block={block} blockIndex={index} />
        ))}
      </div>
    </article>
  );
};

export default SongView;
