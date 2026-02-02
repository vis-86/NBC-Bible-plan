import { BibleReference } from '@/types';

const BOOK_ABBREVIATIONS: Record<string, string> = {
  'Быт.': 'Бытие',
  'Быт': 'Бытие',
  'Исх.': 'Исход',
  'Исх': 'Исход',
  'Лев.': 'Левит',
  'Лев': 'Левит',
  'Чис.': 'Числа',
  'Чис': 'Числа',
  'Втор.': 'Второзаконие',
  'Втор': 'Второзаконие',
  'Нав.': 'Иисус Навин',
  'Нав': 'Иисус Навин',
  'Суд.': 'Судьи',
  'Суд': 'Судьи',
  'Руф.': 'Руфь',
  'Руф': 'Руфь',
  '1Цар.': '1-я Царств',
  '1 Цар.': '1-я Царств',
  '1Цар': '1-я Царств',
  '1 Цар': '1-я Царств',
  '2Цар.': '2-я Царств',
  '2 Цар.': '2-я Царств',
  '2Цар': '2-я Царств',
  '2 Цар': '2-я Царств',
  '3Цар.': '3-я Царств',
  '3 Цар.': '3-я Царств',
  '3Цар': '3-я Царств',
  '3 Цар': '3-я Царств',
  '4Цар.': '4-я Царств',
  '4 Цар.': '4-я Царств',
  '4Цар': '4-я Царств',
  '4 Цар': '4-я Царств',
  '1Пар.': '1-я Паралипоменон',
  '1 Пар.': '1-я Паралипоменон',
  '1Пар': '1-я Паралипоменон',
  '1 Пар': '1-я Паралипоменон',
  '2Пар.': '2-я Паралипоменон',
  '2 Пар.': '2-я Паралипоменон',
  '2Пар': '2-я Паралипоменон',
  '2 Пар': '2-я Паралипоменон',
  'Езд.': 'Ездра',
  'Езд': 'Ездра',
  'Неем.': 'Неемия',
  'Неем': 'Неемия',
  'Есф.': 'Есфирь',
  'Есф': 'Есфирь',
  'Иов.': 'Иов',
  'Иов': 'Иов',
  'Пс.': 'Псалтирь',
  'Пс': 'Псалтирь',
  'Прит.': 'Притчи',
  'Прит': 'Притчи',
  'Еккл.': 'Екклесиаст',
  'Еккл': 'Екклесиаст',
  'Песн.': 'Песнь Песней',
  'Песн': 'Песнь Песней',
  'Ис.': 'Исаия',
  'Ис': 'Исаия',
  'Иер.': 'Иеремия',
  'Иер': 'Иеремия',
  'Плач.': 'Плач Иеремии',
  'Плач': 'Плач Иеремии',
  'Иез.': 'Иезекииль',
  'Иез': 'Иезекииль',
  'Дан.': 'Даниил',
  'Дан': 'Даниил',
  'Ос.': 'Осия',
  'Ос': 'Осия',
  'Иоиль.': 'Иоиль',
  'Иоиль': 'Иоиль',
  'Ам.': 'Амос',
  'Ам': 'Амос',
  'Авд.': 'Авдий',
  'Авд': 'Авдий',
  'Ион.': 'Иона',
  'Ион': 'Иона',
  'Мих.': 'Михей',
  'Мих': 'Михей',
  'Наум.': 'Наум',
  'Наум': 'Наум',
  'Авв.': 'Аввакум',
  'Авв': 'Аввакум',
  'Соф.': 'Софония',
  'Соф': 'Софония',
  'Агг.': 'Аггей',
  'Агг': 'Аггей',
  'Зах.': 'Захария',
  'Зах': 'Захария',
  'Мал.': 'Малахия',
  'Мал': 'Малахия',
  'Мф.': 'От Матфея',
  'Мф': 'От Матфея',
  'Мк.': 'От Марка',
  'Мк': 'От Марка',
  'Лк.': 'От Луки',
  'Лк': 'От Луки',
  'Ин.': 'От Иоанна',
  'Ин': 'От Иоанна',
  'Деян.': 'Деяния',
  'Деян': 'Деяния',
  'Иак.': 'Иакова',
  'Иак': 'Иакова',
  '1Пет.': '1-е Петра',
  '1 Пет.': '1-е Петра',
  '1Пет': '1-е Петра',
  '1 Пет': '1-е Петра',
  '2Пет.': '2-е Петра',
  '2 Пет.': '2-е Петра',
  '2Пет': '2-е Петра',
  '2 Пет': '2-е Петра',
  '1Ин.': '1-е Иоанна',
  '1 Ин.': '1-е Иоанна',
  '1Ин': '1-е Иоанна',
  '1 Ин': '1-е Иоанна',
  '2Ин.': '2-е Иоанна',
  '2 Ин.': '2-е Иоанна',
  '2Ин': '2-е Иоанна',
  '2 Ин': '2-е Иоанна',
  '3Ин.': '3-е Иоанна',
  '3 Ин.': '3-е Иоанна',
  '3Ин': '3-е Иоанна',
  '3 Ин': '3-е Иоанна',
  'Иуд.': 'Иуды',
  'Иуд': 'Иуды',
  'Рим.': 'Римлянам',
  'Рим': 'Римлянам',
  '1Кор.': '1-е Коринфянам',
  '1 Кор.': '1-е Коринфянам',
  '1Кор': '1-е Коринфянам',
  '1 Кор': '1-е Коринфянам',
  '2Кор.': '2-е Коринфянам',
  '2 Кор.': '2-е Коринфянам',
  '2Кор': '2-е Коринфянам',
  '2 Кор': '2-е Коринфянам',
  'Гал.': 'Галатам',
  'Гал': 'Галатам',
  'Еф.': 'Ефесянам',
  'Еф': 'Ефесянам',
  'Флп.': 'Филиппийцам',
  'Флп': 'Филиппийцам',
  'Кол.': 'Колоссянам',
  'Кол': 'Колоссянам',
  '1Фес.': '1-е Фессалоникийцам',
  '1 Фес.': '1-е Фессалоникийцам',
  '1Фес': '1-е Фессалоникийцам',
  '1 Фес': '1-е Фессалоникийцам',
  '2Фес.': '2-е Фессалоникийцам',
  '2 Фес.': '2-е Фессалоникийцам',
  '2Фес': '2-е Фессалоникийцам',
  '2 Фес': '2-е Фессалоникийцам',
  '1Тим.': '1-е Тимофею',
  '1 Тим.': '1-е Тимофею',
  '1Тим': '1-е Тимофею',
  '1 Тим': '1-е Тимофею',
  '2Тим.': '2-е Тимофею',
  '2 Тим.': '2-е Тимофею',
  '2Тим': '2-е Тимофею',
  '2 Тим': '2-е Тимофею',
  'Тит.': 'Титу',
  'Тит': 'Титу',
  'Флм.': 'Филимону',
  'Флм': 'Филимону',
  'Евр.': 'Евреям',
  'Евр': 'Евреям',
  'Откр.': 'Откровение',
  'Откр': 'Откровение'
};

/**
 * Returns the full book name from an abbreviation or the original string if not found
 */
export function getFullBookName(bookName: string): string {
  if (!bookName) return bookName;
  const trimmed = bookName.trim();
  return BOOK_ABBREVIATIONS[trimmed] || trimmed;
}

/**
 * Parses a single reading item string (e.g. "Быт. 1" or "Мал.") into a BibleReference
 * Now data is already split by items in DB, so each read is a single chapter
 * If only book name is provided without chapter number, defaults to chapter 1
 */
export function parseReadingItem(readingStr: string): BibleReference | null {
  if (!readingStr) return null;

  // First, try standard format "Book Chapter"
  // Modified regex to support:
  // 1. Optional dot and spaces: "Пс. 118", "Пс.118", "Пс 118"
  // 2. Suffixes in parentheses: "Пс.118 (1)"
  const regex = /^(.+?)(?:\.|\s+)\s*(\d+)(?:\s*\(\d+\))?$/;
  const match = readingStr.match(regex);

  if (match) {
    const abbrRaw = match[1].trim();
    // Try both with and without dot for abbreviations
    const abbrWithDot = abbrRaw.endsWith('.') ? abbrRaw : abbrRaw + '.';
    const abbrWithoutDot = abbrRaw.endsWith('.') ? abbrRaw.slice(0, -1) : abbrRaw;
    
    const chapter = parseInt(match[2]);
    const fullBookName = BOOK_ABBREVIATIONS[abbrWithDot] || 
                        BOOK_ABBREVIATIONS[abbrWithoutDot] || 
                        abbrRaw;

    return {
      book: fullBookName,
      chapter
    };
  }

  // If no chapter number found, try to recognize just the book name
  const trimmed = readingStr.trim();
  
  // Check if it's a known abbreviation
  if (BOOK_ABBREVIATIONS[trimmed]) {
    return {
      book: BOOK_ABBREVIATIONS[trimmed],
      chapter: 1 // Default to chapter 1 if no chapter specified
    };
  }

  // Check if it's already a full book name (check values in BOOK_ABBREVIATIONS)
  const bookNames = Object.values(BOOK_ABBREVIATIONS);
  if (bookNames.includes(trimmed)) {
    return {
      book: trimmed,
      chapter: 1 // Default to chapter 1 if no chapter specified
    };
  }

  return null;
}

/**
 * @deprecated Use parseReadingItem instead - data is now pre-split in DB
 * Parses a reading string from Directus (e.g. "Быт. 1-3") into an array of BibleReferences
 */
export function parseReading(readingStr: string): BibleReference[] {
  if (!readingStr) return [];

  const regex = /^(.+?)\s+(\d+)(?:-(\d+))?$/;
  const match = readingStr.match(regex);

  if (match) {
    const abbr = match[1].trim();
    const startChapter = parseInt(match[2]);
    const endChapter = match[3] ? parseInt(match[3]) : startChapter;
    const fullBookName = BOOK_ABBREVIATIONS[abbr] || abbr;

    const readings: BibleReference[] = [];
    for (let i = startChapter; i <= endChapter; i++) {
      readings.push({
        book: fullBookName,
        chapter: i
      });
    }
    return readings;
  }

  return [];
}

/**
 * Получает сокращенное название дня недели (например, "Пн.")
 */
export function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  
  const parts = dateStr.split('.');
  if (parts.length !== 3) return '';
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return '';
  
  const dayNames = ['Вс.', 'Пн.', 'Вт.', 'Ср.', 'Чт.', 'Пт.', 'Сб.'];
  return dayNames[date.getDay()];
}

/**
 * Форматирует дату из формата "DD.MM.YYYY" в формат "dd mmm" (например, "05 янв")
 */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // месяцы в JS начинаются с 0
  const year = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  
  if (isNaN(date.getTime())) return dateStr;
  
  return `${day.toString().padStart(2, '0')} ${monthNames[month]}`;
}

function isLeapYear(year: number): boolean {
  // Gregorian calendar leap year rules
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Преобразует номер дня в году (1..365/366) в строку даты "DD.MM.YYYY".
 * Если dayOfYear выходит за границы года — нормализуется в диапазон.
 */
export function dayOfYearToDateStr(dayOfYear: number, year: number = new Date().getFullYear()): string {
  const max = isLeapYear(year) ? 366 : 365;
  const normalized = Math.min(max, Math.max(1, Math.trunc(dayOfYear || 1)));

  // Jan 1 + (dayOfYear - 1)
  const date = new Date(year, 0, 1);
  date.setDate(date.getDate() + (normalized - 1));

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

