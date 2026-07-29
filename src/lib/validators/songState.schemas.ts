import { z } from 'zod';

/**
 * Валидация тела `PUT /api/songs/:id/state`.
 *
 * `user_id` здесь СОЗНАТЕЛЬНО отсутствует: он берётся только из iron-session.
 * Любое поле владельца в теле запроса игнорируется — иначе авторизованный
 * пользователь переписал бы чужие пометки (BFF ходит в Directus админ-токеном,
 * права Directus — второй рубеж, а не защита).
 */

/** Верхняя граница на всякий случай: не даём одним PUT залить мегабайты json. */
const MAX_STROKES = 2000;
const MAX_POINTS = 5000;

const PointSchema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const StrokeSchema = z.object({
  id: z.string().min(1).max(64),
  tool: z.enum(['pen', 'highlighter', 'arrow', 'text']),
  anchor: z.object({
    section: z.number().int().min(0),
    line: z.number().int().min(0),
  }),
  points: z.array(PointSchema).min(1).max(MAX_POINTS),
  color: z.string().min(1).max(32),
  width: z.number().positive().max(200),
  text: z.string().max(500).optional(),
  vertical: z.boolean().optional(),
});

export const SongAnnotationsSchema = z.object({
  strokes: z.array(StrokeSchema).max(MAX_STROKES),
  /** Метка времени устройства (ms). Ноль/отрицательные отбрасываем — LWW на них ломается. */
  updatedAt: z.number().int().positive(),
});

export type SongAnnotationsInput = z.infer<typeof SongAnnotationsSchema>;
