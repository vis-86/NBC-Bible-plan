import { BibleReference } from "../types";

const BOOK_ABBREVIATIONS: Record<string, string> = {
  'Быт.': 'Бытие',
  'Исх.': 'Исход',
  'Лев.': 'Левит',
  'Чис.': 'Числа',
  'Втор.': 'Второзаконие',
  'Нав.': 'Иисус Навин',
  'Суд.': 'Судьи',
  'Руф.': 'Руфь',
  '1Цар.': '1-я Царств',
  '2Цар.': '2-я Царств',
  '3Цар.': '3-я Царств',
  '4Цар.': '4-я Царств',
  '1Пар.': '1-я Паралипоменон',
  '2Пар.': '2-я Паралипоменон',
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
  'Мф.': 'От Матфея',
  'Мк.': 'От Марка',
  'Лк.': 'От Луки',
  'Ин.': 'От Иоанна',
  'Деян.': 'Деяния',
  'Иак.': 'Иакова',
  '1Пет.': '1-е Петра',
  '2Пет.': '2-е Петра',
  '1Ин.': '1-е Иоанна',
  '2Ин.': '2-е Иоанна',
  '3Ин.': '3-е Иоанна',
  'Иуд.': 'Иуды',
  'Рим.': 'Римлянам',
  '1Кор.': '1-е Коринфянам',
  '2Кор.': '2-е Коринфянам',
  'Гал.': 'Галатам',
  'Еф.': 'Ефесянам',
  'Флп.': 'Филиппийцам',
  'Кол.': 'Колоссянам',
  '1Фес.': '1-е Фессалоникийцам',
  '2Фес.': '2-е Фессалоникийцам',
  '1Тим.': '1-е Тимофею',
  '2Тим.': '2-е Тимофею',
  'Тит.': 'Титу',
  'Флм.': 'Филимону',
  'Евр.': 'Евреям',
  'Откр.': 'Откровение'
};

/**
 * Parses a reading string from Directus (e.g. "Быт. 1-3") into an array of BibleReferences
 */
export function parseReading(readingStr: string): BibleReference[] {
  if (!readingStr) return [];

  // Simple parser: matches "Book Abbr. ChapterRange"
  // For now we only take the first chapter of the range for simplicity in the reader
  // as the current reader implementation handles one chapter at a time.
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
