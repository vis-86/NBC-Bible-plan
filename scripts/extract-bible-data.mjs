import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Маппинг названий книг из BIBLE_STRUCTURE в имена файлов rst
const BOOK_NAME_TO_RST_FILE = {
  'Бытие': '01-genesis',
  'Исход': '02-exodus',
  'Левит': '03-leviticus',
  'Числа': '04-numbers',
  'Второзаконие': '05-deuteronomy',
  'Иисус Навин': '06-joshua',
  'Судьи': '07-judges',
  'Руфь': '08-ruth',
  '1-я Царств': '09-1samuel',
  '2-я Царств': '10-2samuel',
  '3-я Царств': '11-1kings',
  '4-я Царств': '12-2kings',
  '1-я Паралипоменон': '13-1chronicles',
  '2-я Паралипоменон': '14-2chronicles',
  'Ездра': '16-ezra',
  'Неемия': '17-nehemiah',
  'Есфирь': '21-esther',
  'Иов': '22-job',
  'Псалтирь': '23-psalms',
  'Притчи': '24-proverbs',
  'Екклесиаст': '25-ecclesiastes',
  'Песнь Песней': '26-songofsolomon',
  'Исаия': '29-isaiah',
  'Иеремия': '30-jeremiah',
  'Плач Иеремии': '31-lamentations',
  'Иезекииль': '34-ezekiel',
  'Даниил': '35-daniel',
  'Осия': '36-hosea',
  'Иоиль': '37-joel',
  'Амос': '38-amos',
  'Авдий': '39-obadiah',
  'Иона': '40-jonah',
  'Михей': '41-micah',
  'Наум': '42-nahum',
  'Аввакум': '43-habakkuk',
  'Софония': '44-zephaniah',
  'Аггей': '45-haggai',
  'Захария': '46-zechariah',
  'Малахия': '47-malachi',
  'От Матфея': '52-matthew',
  'От Марка': '53-mark',
  'От Луки': '54-luke',
  'От Иоанна': '55-john',
  'Деяния': '56-acts',
  'Иакова': '57-james',
  '1-е Петра': '58-1peter',
  '2-е Петра': '59-2peter',
  '1-е Иоанна': '60-1john',
  '2-е Иоанна': '61-2john',
  '3-е Иоанна': '62-3john',
  'Иуды': '63-jude',
  'Римлянам': '64-romans',
  '1-е Коринфянам': '65-1corinthians',
  '2-е Коринфянам': '66-2corinthians',
  'Галатам': '67-galatians',
  'Ефесянам': '68-ephesians',
  'Филиппийцам': '69-philippians',
  'Колоссянам': '70-colossians',
  '1-е Фессалоникийцам': '71-1thessalonians',
  '2-е Фессалоникийцам': '72-2thessalonians',
  '1-е Тимофею': '73-1timothy',
  '2-е Тимофею': '74-2timothy',
  'Титу': '75-titus',
  'Филимону': '76-philemon',
  'Евреям': '77-hebrews',
  'Откровение': '78-revelation'
};

const RST_DIR = '/tmp/rst-temp/parsed66';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'bible', 'books');

// Создаем директорию для вывода
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Парсит строку стиха из формата rst
 * Формат: #chapter:verse#текст
 * Или: #p# для нового параграфа
 */
function parseVerseLine(line) {
  line = line.trim();
  
  // Пропускаем пустые строки
  if (!line) return null;
  
  // Новый параграф
  if (line === '#p#') {
    return { type: 'paragraph' };
  }
  
  // Стих в формате #chapter:verse#текст
  const match = line.match(/^#(\d+):(\d+)#(.+)$/);
  if (match) {
    return {
      type: 'verse',
      chapter: parseInt(match[1], 10),
      verse: parseInt(match[2], 10),
      text: match[3]
    };
  }
  
  return null;
}

/**
 * Конвертирует HTML теги в markdown
 */
function convertHtmlToMarkdown(text) {
  // <i>текст</i> -> *текст*
  text = text.replace(/<i>(.*?)<\/i>/g, '*$1*');
  // &mdash; -> —
  text = text.replace(/&mdash;/g, '—');
  // Другие HTML entities можно добавить при необходимости
  return text;
}

/**
 * Обрабатывает один файл книги
 */
function processBookFile(bookName, rstFileName) {
  const filePath = path.join(RST_DIR, `${rstFileName}.dat`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`Файл не найден: ${filePath}`);
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const chapters = {};
  let currentChapter = null;
  let currentParagraph = [];
  
  for (const line of lines) {
    const parsed = parseVerseLine(line);
    
    if (!parsed) continue;
    
    if (parsed.type === 'paragraph') {
      // Сохраняем текущий параграф в текущую главу
      if (currentChapter !== null && currentParagraph.length > 0) {
        if (!chapters[currentChapter]) {
          chapters[currentChapter] = [];
        }
        chapters[currentChapter].push(currentParagraph.join(' '));
        currentParagraph = [];
      }
    } else if (parsed.type === 'verse') {
      // Если сменилась глава, сохраняем предыдущий параграф
      if (currentChapter !== null && parsed.chapter !== currentChapter && currentParagraph.length > 0) {
        if (!chapters[currentChapter]) {
          chapters[currentChapter] = [];
        }
        chapters[currentChapter].push(currentParagraph.join(' '));
        currentParagraph = [];
      }
      
      currentChapter = parsed.chapter;
      const verseText = convertHtmlToMarkdown(parsed.text);
      // Формат: "1 Текст стиха" или просто добавляем к параграфу
      currentParagraph.push(`${parsed.verse} ${verseText}`);
    }
  }
  
  // Сохраняем последний параграф
  if (currentChapter !== null && currentParagraph.length > 0) {
    if (!chapters[currentChapter]) {
      chapters[currentChapter] = [];
    }
    chapters[currentChapter].push(currentParagraph.join(' '));
  }
  
  // Конвертируем массивы параграфов в markdown текст
  const chaptersMarkdown = {};
  for (const [chapterNum, paragraphs] of Object.entries(chapters)) {
    chaptersMarkdown[chapterNum] = paragraphs.map(p => p.trim()).filter(p => p).join('\n\n');
  }
  
  return {
    name: bookName,
    chapters: chaptersMarkdown
  };
}

/**
 * Главная функция
 */
function main() {
  console.log('Начинаем извлечение данных из rst...');
  
  const index = {};
  const books = {};
  
  for (const [bookName, rstFileName] of Object.entries(BOOK_NAME_TO_RST_FILE)) {
    console.log(`Обрабатываем: ${bookName} (${rstFileName})`);
    
    const bookData = processBookFile(bookName, rstFileName);
    
    if (bookData) {
      const fileName = `${bookName}.json`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(bookData, null, 2), 'utf-8');
      
      index[bookName] = fileName;
      books[bookName] = {
        fileName,
        chapters: Object.keys(bookData.chapters).length
      };
      
      console.log(`  ✓ Сохранено: ${fileName} (${Object.keys(bookData.chapters).length} глав)`);
    } else {
      console.error(`  ✗ Ошибка при обработке: ${bookName}`);
    }
  }
  
  // Сохраняем индекс
  const indexPath = path.join(__dirname, '..', 'data', 'bible', 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\n✓ Индекс сохранен: ${indexPath}`);
  
  console.log(`\n✓ Всего обработано книг: ${Object.keys(books).length}`);
  console.log('Готово!');
}

main();

