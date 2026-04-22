#!/usr/bin/env npx tsx
/**
 * Converts BibleQuote modules (bibleqt.INI + numbered .htm books) into app datasets:
 * `data/bible/<translationId>/index.json` + `books/<Name>.json`.
 *
 * Source folders (examples): `data/Bible_Russian_Kassian_2019-05-30`, `data/Bible_Russian_NRT_2019-05-30`.
 * Ensure distribution rights for the text before setting translations to self-hosted in production.
 */
import fs from 'fs';
import path from 'path';
import { BIBLE_STRUCTURE } from '../../src/lib/constants';
import { moduleFullNameToCanonical } from './canonical-names';
import { parseBibleqtIniFile, resolveBibleqtIniPath } from './parse-bibleqt-ini';
import { parseBiblequoteBookHtml } from './parse-biblequote-html';

const LOG = '[convert-bible]';

const APP_CANON_CHAPTER_COUNT = new Map(BIBLE_STRUCTURE.map((b) => [b.name, b.chapters]));

function isDebug(): boolean {
  return process.env.DEBUG === '1' || process.env.DEBUG === 'true';
}

function parseArgs(argv: string[]): {
  source: string;
  translationId: string;
  outDir: string;
  booksFilter: Set<string> | null;
} {
  let source = '';
  let translationId = '';
  let outDir = '';
  let booksCsv = '';

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source' && argv[i + 1]) {
      source = argv[++i];
    } else if (a === '--translationId' && argv[i + 1]) {
      translationId = argv[++i];
    } else if (a === '--out' && argv[i + 1]) {
      outDir = argv[++i];
    } else if (a === '--books' && argv[i + 1]) {
      booksCsv = argv[++i];
    }
  }

  if (!source || !translationId) {
    console.error(
      `Usage: npx tsx scripts/bible-import/cli.ts --source <dir-with-bibleqt.ini> --translationId <id> [--out <dir>] [--books canonicalName1,canonicalName2]`
    );
    process.exit(1);
  }

  const booksFilter =
    booksCsv.trim().length > 0
      ? new Set(
          booksCsv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : null;

  const resolvedOut =
    outDir.trim().length > 0 ? outDir : path.join(process.cwd(), 'data', 'bible', translationId);

  return { source, translationId, outDir: resolvedOut, booksFilter };
}

function main(): void {
  const { source, translationId, outDir, booksFilter } = parseArgs(process.argv);
  const iniPath = resolveBibleqtIniPath(source);

  console.error(
    `${LOG} INFO source=${source} translationId=${translationId} out=${outDir} booksFilter=${booksFilter ? [...booksFilter].join('|') : 'all'}`
  );

  const entries = parseBibleqtIniFile(iniPath);
  const index: Record<string, string> = {};
  let converted = 0;
  let skipped = 0;
  const errors: string[] = [];

  fs.mkdirSync(path.join(outDir, 'books'), { recursive: true });

  for (const entry of entries) {
    const canonical = moduleFullNameToCanonical(entry.fullName);
    if (!canonical) {
      console.error(`${LOG} WARN unknown FullName="${entry.fullName}" file=${entry.pathName}`);
      skipped++;
      continue;
    }

    if (booksFilter && !booksFilter.has(canonical)) {
      if (isDebug()) console.error(`${LOG} DEBUG skip (not in --books) ${canonical}`);
      continue;
    }

    const htmlPath = path.join(source, entry.pathName);
    if (!fs.existsSync(htmlPath)) {
      const msg = `Missing HTML: ${htmlPath}`;
      console.error(`${LOG} ERROR ${msg}`);
      errors.push(msg);
      continue;
    }

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const chapters = parseBiblequoteBookHtml(html);
    const chapterKeys = Object.keys(chapters);
    if (chapterKeys.length === 0) {
      const msg = `No chapters parsed for ${canonical} (${htmlPath})`;
      console.error(`${LOG} WARN ${msg}`);
      errors.push(msg);
    }

    if (isDebug()) {
      for (const ck of chapterKeys) {
        const len = chapters[ck]?.length ?? 0;
        console.error(`${LOG} DEBUG book=${canonical} chapter=${ck} textLen=${len}`);
      }
    }

    const canonChapters = APP_CANON_CHAPTER_COUNT.get(canonical);
    if (canonChapters != null) {
      if (chapterKeys.length !== canonChapters) {
        console.error(
          `${LOG} WARN book=${canonical} appCanonChapters=${canonChapters} parsedChapters=${chapterKeys.length} iniChapterQty=${entry.chapterQty}`
        );
      } else if (entry.chapterQty > 0 && entry.chapterQty !== canonChapters && isDebug()) {
        console.error(
          `${LOG} DEBUG book=${canonical} iniChapterQty=${entry.chapterQty} appCanonChapters=${canonChapters} parsedChapters=${chapterKeys.length} (INI metadata may include deuterocanon counts; HTML matches app canon)`
        );
      }
    } else if (entry.chapterQty > 0 && chapterKeys.length !== entry.chapterQty) {
      console.error(
        `${LOG} WARN book=${canonical} ChapterQty=${entry.chapterQty} parsedChapters=${chapterKeys.length} (no app canon entry)`
      );
    }

    const bookFile = `${canonical}.json`;
    const payload = { name: canonical, chapters };
    fs.writeFileSync(path.join(outDir, 'books', bookFile), JSON.stringify(payload, null, 2), 'utf-8');
    index[canonical] = bookFile;
    converted++;
    console.error(`${LOG} INFO wrote ${path.join('books', bookFile)} chapters=${chapterKeys.length}`);
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  console.error(`${LOG} INFO done converted=${converted} skippedUnknown=${skipped} indexKeys=${Object.keys(index).length}`);
  if (errors.length) {
    console.error(`${LOG} WARN issues=${errors.length}`);
  }
}

main();
