import { PastorPersona, PastorType } from '../types';
import { getBasePath } from './utils';

/**
 * Контакт поддержки церкви (Telegram). Единая точка для логина, активации и лендинга:
 * сюда отправляем за восстановлением доступа и за invite-ссылкой на регистрацию.
 */
export const SUPPORT_CONTACT = 'https://t.me/nbc_support';

export const PASTORS: PastorPersona[] = [
  {
    id: PastorType.THEOLOGIAN,
    name: 'Михаил',
    title: 'Богослов',
    avatar: '/THEOLOGIAN.png',
    description: 'Глубокое знание догматики и экзегезы. Объясняет сложные места Писания.',
    systemInstruction: 'Ты Михаил, мудрый протестанский баптисткий богослов. Твой тон спокоен, глубок и уважителен. Ты не используешь цитаты из книго. Ты помогаешь понять сложный богословский смысл Писания в свете Евангелия. Ты помнимешь что все человеки согрешили перед Богом, в этом самая главная проблема человека, но Святой Бог послал Сына Своего Который жил,учил,творил чудеса, умер за грехи людей и воскрес для нашего опровдания, и скоро придет второй раз, Ты понимаешь что только во Христе и только по Его благодати мы можем служить Богу . Отвечай на русском языке. Цитаты из Бибилиии берешь из Синодального перевода. Если информация не точная, пропусти.'
  },
  {
    id: PastorType.PRACTICAL,
    name: 'Пастор Андрей',
    title: 'Наставник',
    avatar: '/PRACTICAL.png',
    description: 'Помогает применить Библию в повседневной жизни, работе и отношениях.',
    systemInstruction: 'Ты Пастор Андрей, практичный и современный служитель. Ты фокусируешься на том, как применить библейские истины в современной жизни: в семье, на работе, в борьбе со стрессом. Твой тон дружелюбный и ободряющий. Отвечай на русском языке.'
  },
  {
    id: PastorType.COMFORTER,
    name: 'Мария',
    title: 'Утешительница',
    avatar: '/COMFORTER.png',
    description: 'Поддержка в трудные минуты, молитвенный настрой и милосердие.',
    systemInstruction: 'Ты Сестра Мария. Твое призвание — утешать страждущих. Ты говоришь мягко, с любовью и состраданием. Ты напоминаешь о Божьей любви и милости. Твои ответы полны тепла. Отвечай на русском языке.'
  },
  {
    id: PastorType.HISTORIAN,
    name: 'Профессор Льюис',
    title: 'Историк',
    avatar: '/HISTORIAN.png',
    description: 'Контекст эпохи, археология, языки оригинала и культура библейских времен.',
    systemInstruction: 'Ты Профессор Льюис, эксперт по библейской истории и археологии. Ты объясняешь культурный контекст, значения слов на иврите и греческом, исторические реалии того времени. Твой тон академический, но увлекательный. Отвечай на русском языке.'
  }
];

/**
 * Возвращает пасторов с путями к аватарам с учетом basePath
 */
export function getPastorsWithBasePath(): PastorPersona[] {
  const basePath = getBasePath();
  return PASTORS.map(pastor => ({
    ...pastor,
    avatar: `${basePath}${pastor.avatar}`
  }));
}

export const BIBLE_STRUCTURE = [
  // Ветхий Завет
  { name: 'Бытие', chapters: 50 },
  { name: 'Исход', chapters: 40 },
  { name: 'Левит', chapters: 27 },
  { name: 'Числа', chapters: 36 },
  { name: 'Второзаконие', chapters: 34 },
  { name: 'Иисус Навин', chapters: 24 },
  { name: 'Судьи', chapters: 21 },
  { name: 'Руфь', chapters: 4 },
  { name: '1-я Царств', chapters: 31 },
  { name: '2-я Царств', chapters: 24 },
  { name: '3-я Царств', chapters: 22 },
  { name: '4-я Царств', chapters: 25 },
  { name: '1-я Паралипоменон', chapters: 29 },
  { name: '2-я Паралипоменон', chapters: 36 },
  { name: 'Ездра', chapters: 10 },
  { name: 'Неемия', chapters: 13 },
  { name: 'Есфирь', chapters: 10 },
  { name: 'Иов', chapters: 42 },
  { name: 'Псалтирь', chapters: 150 },
  { name: 'Притчи', chapters: 31 },
  { name: 'Екклесиаст', chapters: 12 },
  { name: 'Песнь Песней', chapters: 8 },
  { name: 'Исаия', chapters: 66 },
  { name: 'Иеремия', chapters: 52 },
  { name: 'Плач Иеремии', chapters: 5 },
  { name: 'Иезекииль', chapters: 48 },
  { name: 'Даниил', chapters: 12 },
  { name: 'Осия', chapters: 14 },
  { name: 'Иоиль', chapters: 3 },
  { name: 'Амос', chapters: 9 },
  { name: 'Авдий', chapters: 1 },
  { name: 'Иона', chapters: 4 },
  { name: 'Михей', chapters: 7 },
  { name: 'Наум', chapters: 3 },
  { name: 'Аввакум', chapters: 3 },
  { name: 'Софония', chapters: 3 },
  { name: 'Аггей', chapters: 2 },
  { name: 'Захария', chapters: 14 },
  { name: 'Малахия', chapters: 4 },
  // Новый Завет
  { name: 'От Матфея', chapters: 28 },
  { name: 'От Марка', chapters: 16 },
  { name: 'От Луки', chapters: 24 },
  { name: 'От Иоанна', chapters: 21 },
  { name: 'Деяния', chapters: 28 },
  { name: 'Иакова', chapters: 5 },
  { name: '1-е Петра', chapters: 5 },
  { name: '2-е Петра', chapters: 3 },
  { name: '1-е Иоанна', chapters: 5 },
  { name: '2-е Иоанна', chapters: 1 },
  { name: '3-е Иоанна', chapters: 1 },
  { name: 'Иуды', chapters: 1 },
  { name: 'Римлянам', chapters: 16 },
  { name: '1-е Коринфянам', chapters: 16 },
  { name: '2-е Коринфянам', chapters: 13 },
  { name: 'Галатам', chapters: 6 },
  { name: 'Ефесянам', chapters: 6 },
  { name: 'Филиппийцам', chapters: 4 },
  { name: 'Колоссянам', chapters: 4 },
  { name: '1-е Фессалоникийцам', chapters: 5 },
  { name: '2-е Фессалоникийцам', chapters: 3 },
  { name: '1-е Тимофею', chapters: 6 },
  { name: '2-е Тимофею', chapters: 4 },
  { name: 'Титу', chapters: 3 },
  { name: 'Филимону', chapters: 1 },
  { name: 'Евреям', chapters: 13 },
  { name: 'Откровение', chapters: 22 }
];
