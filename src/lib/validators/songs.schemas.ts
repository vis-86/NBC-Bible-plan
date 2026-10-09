/**
 * Валидация тела запросов записи песни (M9, T2). Контур — BFF: Directus-права
 * второй рубеж, приложение ходит туда админ-токеном.
 *
 * `content` — ГОТОВЫЙ ChordPro: конвертация «аккордов над строкой» происходит на
 * клиенте (решение 3 в `.ai-factory/plans/feature-song-editor.md`).
 *
 * `slug`, `sort` и `status` в тело НЕ входят намеренно: slug — идентичность записи
 * (по нему upsert'ит импортёр корпуса), sort и status ставит сервер.
 */
import { z } from 'zod';

const TitleSchema = z.string().trim().min(1, 'Название обязательно').max(200, 'Название: максимум 200 символов');
const SubtitleSchema = z.string().trim().max(200, 'Подзаголовок: максимум 200 символов').nullable();
const KeySchema = z.string().trim().max(16, 'Тональность: максимум 16 символов').nullable();
const TempoSchema = z.number().int().min(20, 'Темп: от 20').max(400, 'Темп: до 400').nullable();
const TimeSchema = z.string().trim().max(16, 'Размер: максимум 16 символов').nullable();
// Самая длинная песня корпуса — единицы килобайт; лимит отсекает вставку целого
// песенника, а не длинную песню.
const ContentSchema = z.string().min(1, 'Текст песни обязателен').max(50_000, 'Текст песни слишком длинный');
// Не задана при создании ⇒ дефолт колонки в Directus (`public`).
const VisibilitySchema = z.enum(['public', 'members']);

export const CreateSongSchema = z.object({
  title: TitleSchema,
  subtitle: SubtitleSchema.optional(),
  songKey: KeySchema.optional(),
  defaultKey: KeySchema.optional(),
  tempo: TempoSchema.optional(),
  time: TimeSchema.optional(),
  content: ContentSchema,
  visibility: VisibilitySchema.optional(),
});

export const UpdateSongSchema = z
  .object({
    title: TitleSchema.optional(),
    subtitle: SubtitleSchema.optional(),
    songKey: KeySchema.optional(),
    defaultKey: KeySchema.optional(),
    tempo: TempoSchema.optional(),
    time: TimeSchema.optional(),
    content: ContentSchema.optional(),
    visibility: VisibilitySchema.optional(),
  })
  // Пустой PATCH молча поднял бы date_updated и разослал песню дельта-синком всем
  // устройствам, ничего не изменив.
  .refine((patch) => Object.keys(patch).length > 0, 'Нечего сохранять');

export type CreateSongInput = z.infer<typeof CreateSongSchema>;
export type UpdateSongInput = z.infer<typeof UpdateSongSchema>;
