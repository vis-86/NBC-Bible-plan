import { z } from 'zod';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const TitleSchema = z.string().trim().min(1, 'Название обязательно').max(100, 'Название: максимум 100 символов');
const DateSchema = z.string().regex(DATE_ONLY, 'Дата в формате YYYY-MM-DD').nullable();
const SongIdsSchema = z
  .array(z.number().int().min(1))
  .min(1, 'Выберите хотя бы одну песню')
  .max(100, 'Слишком много песен')
  .refine((ids) => new Set(ids).size === ids.length, 'Песни не должны повторяться');

export const CreateSetlistSchema = z.object({
  title: TitleSchema,
  date: DateSchema.optional(),
  songIds: SongIdsSchema,
});

export const UpdateSetlistSchema = z.object({
  title: TitleSchema.optional(),
  date: DateSchema.optional(),
  songIds: SongIdsSchema.optional(),
});

export type CreateSetlistInput = z.infer<typeof CreateSetlistSchema>;
export type UpdateSetlistInput = z.infer<typeof UpdateSetlistSchema>;

/** Хелпер: первое сообщение об ошибке из ZodError (zod v4: .issues). */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Некорректные данные';
}
