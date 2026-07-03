// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getPersistedText, persistText } from './bible-text-cache';
import { __resetDBConnection } from '@/shared/offline/db';

describe('bible-text-cache IDB read-through', () => {
  beforeEach(() => {
    __resetDBConnection();
  });

  it('persistText записывает главу, ключуя по переданному translationId', async () => {
    await persistText('nrt2019', 'Бытие', 1, 'В начале сотворил Бог...');
    const text = await getPersistedText('Бытие', 1, 'nrt2019');
    expect(text).toBe('В начале сотворил Бог...');
  });

  it('getPersistedText возвращает undefined для отсутствующей записи', async () => {
    const text = await getPersistedText('Исход', 3, 'rst');
    expect(text).toBeUndefined();
  });

  it('разные переводы одной главы хранятся под разными ключами', async () => {
    await persistText('rst', 'Бытие', 1, 'rst-текст');
    await persistText('nrt2019', 'Бытие', 1, 'nrt-текст');

    expect(await getPersistedText('Бытие', 1, 'rst')).toBe('rst-текст');
    expect(await getPersistedText('Бытие', 1, 'nrt2019')).toBe('nrt-текст');
  });
});
