export interface BibleReference {
  book: string;
  chapter: number;
}

/** Отдельный пункт чтения (глава) в рамках дня */
export interface PlanItem {
  id: number;           // id записи в БД
  dayNumber: number;    // numbers - номер дня
  dateStr: string;      // day - дата
  readText: string;     // read - текст отрывка (напр. "Быт. 1")
  item: number;         // item - порядковый номер в дне (1, 2, 3...)
  completed: boolean;   // прочитано ли
}

export interface ReadingPlanDay {
  id: number;              // номер дня (numbers)
  dateStr: string;
  items: PlanItem[];       // все items (главы) дня
  readings: BibleReference[]; // для обратной совместимости
  completed: boolean;      // весь день прочитан (count = null)
  readCount: number | null; // сколько items прочитано (count из reading)
  totalItems: number;      // всего items в дне
}

export enum PastorType {
  THEOLOGIAN = 'THEOLOGIAN',
  PRACTICAL = 'PRACTICAL',
  COMFORTER = 'COMFORTER',
  HISTORIAN = 'HISTORIAN'
}

export interface PastorPersona {
  id: PastorType;
  name: string;
  title: string;
  avatar: string; // URL or emoji
  description: string;
  systemInstruction: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isError?: boolean; // Флаг для сообщений об ошибках
}

export enum AppView {
  PLAN = 'PLAN',
  READER = 'READER',
  CHAT = 'CHAT',
  REFERENCE = 'REFERENCE'
}
