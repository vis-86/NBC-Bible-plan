export interface BibleReference {
  book: string;
  chapter: number;
}

export interface ReadingPlanDay {
  id: number;
  dateStr: string;
  readings: BibleReference[];
  completed: boolean;
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
}

export enum AppView {
  PLAN = 'PLAN',
  READER = 'READER',
  CHAT = 'CHAT',
  REFERENCE = 'REFERENCE'
}
