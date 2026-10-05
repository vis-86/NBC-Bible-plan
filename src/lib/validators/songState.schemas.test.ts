import { describe, expect, it } from 'vitest';
import { SongAnnotationsSchema } from './songState.schemas';

function body(anchor: Record<string, unknown>) {
  return {
    strokes: [{ id: 's1', tool: 'pen', anchor, points: [[1, 2, 0.5]], color: '#000', width: 2 }],
    updatedAt: 1,
  };
}

describe('SongAnnotationsSchema: якорь пометки', () => {
  it('сохраняет хэш строки', () => {
    // `z.object` молча режет неизвестные ключи: без явного поля хэш терялся бы на
    // каждой записи, и после перезагрузки с сервера якорь снова держался бы за индекс.
    const parsed = SongAnnotationsSchema.parse(body({ section: 1, line: 2, hash: 'abc123' }));
    expect(parsed.strokes[0].anchor).toEqual({ section: 1, line: 2, hash: 'abc123' });
  });

  it('принимает старые якоря без хэша', () => {
    const parsed = SongAnnotationsSchema.parse(body({ section: 1, line: 2 }));
    expect(parsed.strokes[0].anchor).toEqual({ section: 1, line: 2 });
  });

  it('отвергает пустой и слишком длинный хэш', () => {
    expect(SongAnnotationsSchema.safeParse(body({ section: 0, line: 0, hash: '' })).success).toBe(false);
    expect(SongAnnotationsSchema.safeParse(body({ section: 0, line: 0, hash: 'x'.repeat(17) })).success).toBe(false);
  });
});
