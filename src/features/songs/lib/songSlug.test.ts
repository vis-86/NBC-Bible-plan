import { describe, expect, it } from 'vitest';

import { buildSongSlug, nextFreeSlug, slugifySongTitle } from './songSlug';

describe('slugifySongTitle', () => {
  it('повторяет формат корпуса', () => {
    // Реальные названия из data/songs — slug должен выйти такой же, как у импортёра.
    expect(slugifySongTitle('Всемогущий Бог (Псалом 61)')).toBe('всемогущий-бог-псалом-61');
    expect(slugifySongTitle('Глубока, подобно морю')).toBe('глубока-подобно-морю');
    expect(slugifySongTitle('Аллилуйя Наш Спаситель')).toBe('аллилуйя-наш-спаситель');
  });

  it('схлопывает разделители и срезает края', () => {
    expect(slugifySongTitle('  Свят —  свят!  ')).toBe('свят-свят');
    expect(slugifySongTitle('Ave Maria 2')).toBe('ave-maria-2');
  });

  it('название без букв и цифр даёт непустой slug (колонка NOT NULL)', () => {
    expect(slugifySongTitle('!!!')).toBe('песня');
    expect(slugifySongTitle('')).toBe('песня');
  });
});

describe('buildSongSlug', () => {
  it('склеивает номер и название', () => {
    expect(buildSongSlug(98, 'Вся земля хвалу поет')).toBe('98-вся-земля-хвалу-поет');
  });
});

describe('nextFreeSlug', () => {
  it('свободный базовый отдаёт как есть', () => {
    expect(nextFreeSlug('98-песня', ['1-иная'])).toBe('98-песня');
  });

  it('занятый базовый нумерует, пропуская занятые суффиксы', () => {
    expect(nextFreeSlug('98-песня', ['98-песня'])).toBe('98-песня-2');
    expect(nextFreeSlug('98-песня', ['98-песня', '98-песня-2'])).toBe('98-песня-3');
  });
});
