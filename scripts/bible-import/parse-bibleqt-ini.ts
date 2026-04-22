import fs from 'fs';
import path from 'path';

export interface BibleqtBookEntry {
  pathName: string;
  fullName: string;
  chapterQty: number;
}

/**
 * Parses bibleqt.INI (BibleQuote 7) book table: PathName / FullName / ChapterQty triplets.
 */
export function parseBibleqtIniFile(iniPath: string): BibleqtBookEntry[] {
  const raw = fs.readFileSync(iniPath, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const books: BibleqtBookEntry[] = [];

  let pathName: string | null = null;
  let fullName: string | null = null;

  const pushIfComplete = (chapterQty: number) => {
    if (pathName && fullName != null && Number.isFinite(chapterQty)) {
      books.push({ pathName, fullName, chapterQty });
    }
    pathName = null;
    fullName = null;
  };

  for (const line of lines) {
    if (line.startsWith('PathName=')) {
      pathName = line.slice('PathName='.length).trim();
    } else if (line.startsWith('FullName=')) {
      fullName = line.slice('FullName='.length).trim();
    } else if (line.startsWith('ChapterQty=')) {
      const qty = parseInt(line.slice('ChapterQty='.length), 10);
      pushIfComplete(qty);
    }
  }

  return books;
}

export function resolveBibleqtIniPath(sourceDir: string): string {
  const direct = path.join(sourceDir, 'bibleqt.INI');
  if (fs.existsSync(direct)) return direct;
  throw new Error(`bibleqt.INI not found under ${sourceDir}`);
}
