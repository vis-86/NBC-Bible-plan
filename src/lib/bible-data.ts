import fs from 'fs';
import path from 'path';

/**
 * Базовая директория с датасетами Библии.
 *
 * Поддерживаем две структуры:
 * 1) legacy: `data/bible/index.json` + `data/bible/books/*`
 * 2) multi-translation: `data/bible/{translationId}/index.json` + `.../books/*`
 */
const BIBLE_DATA_ROOT_DIR = path.join(process.cwd(), 'data', 'bible');

function getBibleDataDir(translationId?: string): string {
  if (translationId) {
    const candidate = path.join(BIBLE_DATA_ROOT_DIR, translationId);
    const candidateIndex = path.join(candidate, 'index.json');
    if (fs.existsSync(candidateIndex)) return candidate;
  }
  return BIBLE_DATA_ROOT_DIR;
}

function getBooksDir(translationId?: string): string {
  return path.join(getBibleDataDir(translationId), 'books');
}

// Словарь сокращений книг (должен совпадать с BOOK_ABBREVIATIONS из utils.ts)
const BOOK_ABBREVIATIONS: Record<string, string> = {
  // ── Ветхий Завет — аббревиатуры ──────────────────────────────────────────
  'Быт.': 'Бытие',
  'Исх.': 'Исход',
  'Лев.': 'Левит',
  'Чис.': 'Числа',
  'Втор.': 'Второзаконие',
  'Нав.': 'Иисус Навин',
  'Суд.': 'Судьи',
  'Руф.': 'Руфь',
  '1Цар.': '1-я Царств',
  '1 Цар.': '1-я Царств',
  '2Цар.': '2-я Царств',
  '2 Цар.': '2-я Царств',
  '3Цар.': '3-я Царств',
  '3 Цар.': '3-я Царств',
  '4Цар.': '4-я Царств',
  '4 Цар.': '4-я Царств',
  '1Пар.': '1-я Паралипоменон',
  '1 Пар.': '1-я Паралипоменон',
  '2Пар.': '2-я Паралипоменон',
  '2 Пар.': '2-я Паралипоменон',
  'Езд.': 'Ездра',
  'Неем.': 'Неемия',
  'Есф.': 'Есфирь',
  'Иов.': 'Иов',
  'Пс.': 'Псалтирь',
  'Прит.': 'Притчи',
  'Еккл.': 'Екклесиаст',
  'Песн.': 'Песнь Песней',
  'Ис.': 'Исаия',
  'Иер.': 'Иеремия',
  'Плач.': 'Плач Иеремии',
  'Иез.': 'Иезекииль',
  'Дан.': 'Даниил',
  'Ос.': 'Осия',
  'Иоиль.': 'Иоиль',
  'Ам.': 'Амос',
  'Авд.': 'Авдий',
  'Ион.': 'Иона',
  'Мих.': 'Михей',
  'Наум.': 'Наум',
  'Авв.': 'Аввакум',
  'Соф.': 'Софония',
  'Агг.': 'Аггей',
  'Зах.': 'Захария',
  'Мал.': 'Малахия',
  // ── Новый Завет — аббревиатуры ───────────────────────────────────────────
  'Мф.': 'От Матфея',
  'Матф.': 'От Матфея',
  'Мк.': 'От Марка',
  'Марк.': 'От Марка',
  'Лк.': 'От Луки',
  'Лук.': 'От Луки',
  'Ин.': 'От Иоанна',
  'Иоан.': 'От Иоанна',
  'Деян.': 'Деяния',
  'Иак.': 'Иакова',
  '1Пет.': '1-е Петра',
  '1 Пет.': '1-е Петра',
  '2Пет.': '2-е Петра',
  '2 Пет.': '2-е Петра',
  '1Ин.': '1-е Иоанна',
  '1 Ин.': '1-е Иоанна',
  '2Ин.': '2-е Иоанна',
  '2 Ин.': '2-е Иоанна',
  '3Ин.': '3-е Иоанна',
  '3 Ин.': '3-е Иоанна',
  'Иуд.': 'Иуды',
  'Рим.': 'Римлянам',
  '1Кор.': '1-е Коринфянам',
  '1 Кор.': '1-е Коринфянам',
  '2Кор.': '2-е Коринфянам',
  '2 Кор.': '2-е Коринфянам',
  'Гал.': 'Галатам',
  'Еф.': 'Ефесянам',
  'Флп.': 'Филиппийцам',
  'Кол.': 'Колоссянам',
  '1Фес.': '1-е Фессалоникийцам',
  '1 Фес.': '1-е Фессалоникийцам',
  '2Фес.': '2-е Фессалоникийцам',
  '2 Фес.': '2-е Фессалоникийцам',
  '1Тим.': '1-е Тимофею',
  '1 Тим.': '1-е Тимофею',
  '2Тим.': '2-е Тимофею',
  '2 Тим.': '2-е Тимофею',
  'Тит.': 'Титу',
  'Флм.': 'Филимону',
  'Евр.': 'Евреям',
  'Откр.': 'Откровение',
  // ── Расширенные формы (полные названия) ──────────────────────────────────
  'Евангелие от Матфея': 'От Матфея',
  'Евангелие от Марка': 'От Марка',
  'Евангелие от Луки': 'От Луки',
  'Евангелие от Иоанна': 'От Иоанна',
  // ── Canonical self-mapping (все 66 имён из data/bible/index.json) ─────────
  'Бытие': 'Бытие',
  'Исход': 'Исход',
  'Левит': 'Левит',
  'Числа': 'Числа',
  'Второзаконие': 'Второзаконие',
  'Иисус Навин': 'Иисус Навин',
  'Судьи': 'Судьи',
  'Руфь': 'Руфь',
  '1-я Царств': '1-я Царств',
  '2-я Царств': '2-я Царств',
  '3-я Царств': '3-я Царств',
  '4-я Царств': '4-я Царств',
  '1-я Паралипоменон': '1-я Паралипоменон',
  '2-я Паралипоменон': '2-я Паралипоменон',
  'Ездра': 'Ездра',
  'Неемия': 'Неемия',
  'Есфирь': 'Есфирь',
  'Иов': 'Иов',
  'Псалтирь': 'Псалтирь',
  'Притчи': 'Притчи',
  'Екклесиаст': 'Екклесиаст',
  'Песнь Песней': 'Песнь Песней',
  'Исаия': 'Исаия',
  'Иеремия': 'Иеремия',
  'Плач Иеремии': 'Плач Иеремии',
  'Иезекииль': 'Иезекииль',
  'Даниил': 'Даниил',
  'Осия': 'Осия',
  'Иоиль': 'Иоиль',
  'Амос': 'Амос',
  'Авдий': 'Авдий',
  'Иона': 'Иона',
  'Михей': 'Михей',
  'Наум': 'Наум',
  'Аввакум': 'Аввакум',
  'Софония': 'Софония',
  'Аггей': 'Аггей',
  'Захария': 'Захария',
  'Малахия': 'Малахия',
  'От Матфея': 'От Матфея',
  'От Марка': 'От Марка',
  'От Луки': 'От Луки',
  'От Иоанна': 'От Иоанна',
  'Деяния': 'Деяния',
  'Иакова': 'Иакова',
  '1-е Петра': '1-е Петра',
  '2-е Петра': '2-е Петра',
  '1-е Иоанна': '1-е Иоанна',
  '2-е Иоанна': '2-е Иоанна',
  '3-е Иоанна': '3-е Иоанна',
  'Иуды': 'Иуды',
  'Римлянам': 'Римлянам',
  '1-е Коринфянам': '1-е Коринфянам',
  '2-е Коринфянам': '2-е Коринфянам',
  'Галатам': 'Галатам',
  'Ефесянам': 'Ефесянам',
  'Филиппийцам': 'Филиппийцам',
  'Колоссянам': 'Колоссянам',
  '1-е Фессалоникийцам': '1-е Фессалоникийцам',
  '2-е Фессалоникийцам': '2-е Фессалоникийцам',
  '1-е Тимофею': '1-е Тимофею',
  '2-е Тимофею': '2-е Тимофею',
  'Титу': 'Титу',
  'Филимону': 'Филимону',
  'Евреям': 'Евреям',
  'Откровение': 'Откровение',
};

/**
 * Нормализует имя книги, преобразуя сокращения и варианты в полное имя
 * @param bookName - имя книги (может быть сокращением или полным именем)
 * @returns нормализованное полное имя книги или исходное имя, если не найдено
 */
function normalizeBookName(bookName: string): string {
  if (!bookName) return bookName;
  
  // Убираем лишние пробелы
  const trimmed = bookName.trim();
  
  // Проверяем, является ли это сокращением
  if (BOOK_ABBREVIATIONS[trimmed]) {
    return BOOK_ABBREVIATIONS[trimmed];
  }
  
  // Если это уже полное имя, возвращаем как есть
  return trimmed;
}

/**
 * Находит правильное имя книги в индексе, пробуя различные варианты
 * @param bookName - имя книги для поиска
 * @param index - индекс книг
 * @returns правильное имя книги из индекса или null, если не найдено
 */
function findBookInIndex(bookName: string, index: Record<string, string>): string | null {
  // Сначала пробуем нормализованное имя
  const normalized = normalizeBookName(bookName);
  if (normalized in index) {
    return normalized;
  }
  
  // Пробуем исходное имя
  if (bookName in index) {
    return bookName;
  }
  
  // Пробуем варианты с разными пробелами (для книг типа "1-я Царств")
  const variants = [
    bookName.replace(/\s+/g, ' '), // Нормализуем пробелы
    bookName.replace(/\s/g, ''), // Убираем все пробелы
    bookName.replace(/(\d+)\s*-\s*я/g, '$1-я'), // Нормализуем "1 - я" -> "1-я"
    bookName.replace(/(\d+)\s*-\s*е/g, '$1-е'), // Нормализуем "1 - е" -> "1-е"
  ];
  
  for (const variant of variants) {
    if (variant in index) {
      return variant;
    }
  }
  
  // Пробуем поиск без учета регистра (хотя в нашем случае это не нужно)
  for (const key in index) {
    if (key.toLowerCase() === bookName.toLowerCase()) {
      return key;
    }
  }
  
  return null;
}

/**
 * Загружает индекс книг
 */
export function loadBibleIndex(): Record<string, string> {
  return loadBibleIndexByTranslation(undefined);
}

export function loadBibleIndexByTranslation(translationId?: string): Record<string, string> {
  const indexPath = path.join(getBibleDataDir(translationId), 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error('Bible index not found');
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

/**
 * Загружает данные книги
 */
export function loadBookData(bookName: string): { name: string; chapters: Record<string, string> } | null {
  const index = loadBibleIndex();
  const correctBookName = findBookInIndex(bookName, index);
  
  if (!correctBookName) {
    return null;
  }
  
  const fileName = index[correctBookName];
  if (!fileName) {
    return null;
  }
  
  const filePath = path.join(getBooksDir(undefined), fileName);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function loadBookDataByTranslation(
  bookName: string,
  translationId?: string
): { name: string; chapters: Record<string, string> } | null {
  const index = loadBibleIndexByTranslation(translationId);
  const correctBookName = findBookInIndex(bookName, index);

  if (!correctBookName) return null;

  const fileName = index[correctBookName];
  if (!fileName) return null;

  const filePath = path.join(getBooksDir(translationId), fileName);
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Получает текст главы
 */
export function getChapterText(bookName: string, chapter: number): string | null {
  const bookData = loadBookData(bookName);
  
  if (!bookData) {
    return null;
  }
  
  const chapterKey = String(chapter);
  return bookData.chapters[chapterKey] || null;
}

export function getChapterTextByTranslation(
  bookName: string,
  chapter: number,
  translationId?: string
): string | null {
  const chapterKey = String(chapter);

  const readChapter = (tid: string | undefined): string | null => {
    const bookData = loadBookDataByTranslation(bookName, tid);
    if (!bookData) return null;
    return bookData.chapters[chapterKey] || null;
  };

  const primary = readChapter(translationId);
  if (primary != null) return primary;

  // Частичный датасет (например, неполный index.json после тестового импорта): книга/глава в переводе отсутствуют
  if (translationId && translationId !== 'rst') {
    return readChapter('rst');
  }

  return null;
}

/**
 * Получает нормализованное имя книги
 */
export function getNormalizedBookName(bookName: string): string | null {
  const index = loadBibleIndex();
  return findBookInIndex(bookName, index);
}

export function getNormalizedBookNameByTranslation(
  bookName: string,
  translationId?: string
): string | null {
  const index = loadBibleIndexByTranslation(translationId);
  return findBookInIndex(bookName, index);
}

/**
 * Проверяет, существует ли книга
 */
export function bookExists(bookName: string): boolean {
  const index = loadBibleIndex();
  return findBookInIndex(bookName, index) !== null;
}

/**
 * Получает список всех книг с количеством глав
 */
export function getAllBooks(): Array<{ name: string; chapters: number }> {
  const index = loadBibleIndex();
  const books: Array<{ name: string; chapters: number }> = [];
  
  for (const bookName in index) {
    const bookData = loadBookData(bookName);
    if (bookData) {
      books.push({
        name: bookName,
        chapters: Object.keys(bookData.chapters).length
      });
    }
  }
  
  return books;
}

export function getAllBooksByTranslation(translationId?: string): Array<{ name: string; chapters: number }> {
  const index = loadBibleIndexByTranslation(translationId);
  const books: Array<{ name: string; chapters: number }> = [];

  for (const bookName in index) {
    const bookData = loadBookDataByTranslation(bookName, translationId);
    if (bookData) {
      books.push({
        name: bookName,
        chapters: Object.keys(bookData.chapters).length
      });
    }
  }

  return books;
}

