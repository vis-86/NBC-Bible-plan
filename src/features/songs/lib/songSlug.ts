/**
 * Slug песни (M9) — идентичность записи в Directus: `songs.slug` объявлен NOT NULL
 * и UNIQUE, дефолта у него нет, поэтому создание песни ОБЯЗАНО его задать.
 *
 * Формат повторяет корпус: `{sort}-{название кебабом}` → `12-вся-земля-хвалу-поет`.
 * Кириллица остаётся кириллицей — так выглядят все 97 существующих записей, и по
 * этому же slug импортёр корпуса (`scripts/songs-import`) делает upsert.
 *
 * При правке названия slug НЕ пересчитывается: это идентичность, а не отображение.
 */

/** Кебаб из названия: строчные буквы/цифры, остальное — разделитель. */
export function slugifySongTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  // Название из одних знаков препинания slug не даёт, а пустой нарушит NOT NULL.
  return slug || 'песня';
}

export function buildSongSlug(sort: number, title: string): string {
  return `${sort}-${slugifySongTitle(title)}`;
}

/**
 * Свободный slug при занятом базовом: `12-имя`, `12-имя-2`, `12-имя-3`…
 * `taken` — уже существующие slug'и (UNIQUE-констрейнт иначе даст 500 на создании).
 */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  // Сто одноимённых песен с одним номером — не данные, а ошибка вызывающего.
  throw new Error(`[songSlug] не удалось подобрать свободный slug для "${base}"`);
}
