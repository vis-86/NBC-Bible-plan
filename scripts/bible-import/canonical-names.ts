/**
 * Maps BibleQuote / MyBible `FullName` from bibleqt.INI to canonical Russian book titles
 * used in this app (`BIBLE_STRUCTURE`, RST `index.json` keys).
 */
import { BIBLE_STRUCTURE } from '../../src/lib/constants';

const CANONICAL = new Set(BIBLE_STRUCTURE.map((b) => b.name));

/** Module titles that differ from `BIBLE_STRUCTURE` spelling. */
const MANUAL_ALIASES: Record<string, string> = {
  'Песня Песней': 'Песнь Песней'
};

function stripKPrefix(name: string): string {
  const t = name.trim();
  if (t.startsWith('К ')) return t.slice(2).trim();
  return t;
}

/**
 * @returns canonical book name or null if unknown
 */
export function moduleFullNameToCanonical(fullName: string): string | null {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  const alias = MANUAL_ALIASES[normalized];
  if (alias && CANONICAL.has(alias)) return alias;

  if (CANONICAL.has(normalized)) return normalized;

  const withoutK = stripKPrefix(normalized);
  if (withoutK !== normalized && CANONICAL.has(withoutK)) return withoutK;

  return null;
}

export function getCanonicalBookNames(): readonly string[] {
  return BIBLE_STRUCTURE.map((b) => b.name);
}
