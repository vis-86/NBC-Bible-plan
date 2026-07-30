import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySection } from './songSectionKind';

/**
 * Приёмка классификатора на РЕАЛЬНОМ корпусе (§3.6), по образцу `transpose.corpus.test.ts`:
 * `data/songs/*.chordpro` лежит в репозитории, и именно эти файлы импортируются в Directus.
 *
 * Смысл теста: новая песня с незнакомой меткой роняет сборку, а не тихо теряет рельс.
 */
const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'songs');

const COMMENT_RE = /\{comment(?:_italic|_box)?:\s*([^}]*)\}/g;

/**
 * Единственная метка корпуса, которая ЗАКОННО попадает в `other`: это не название секции,
 * а ремарка «припева у песни нет».
 */
const OTHER_ALLOWLIST = new Set(['Припева нет']);

function corpusLabels(): string[] {
  const labels = new Set<string>();
  for (const file of readdirSync(CORPUS_DIR).filter((name) => name.endsWith('.chordpro'))) {
    const content = readFileSync(join(CORPUS_DIR, file), 'utf-8');
    for (const match of content.matchAll(COMMENT_RE)) {
      const label = match[1].trim();
      if (label) labels.add(label);
    }
  }
  return [...labels];
}

describe('классификация меток корпуса', () => {
  const labels = corpusLabels();

  it('корпус вычитан и метки найдены', () => {
    expect(labels.length).toBeGreaterThan(50);
  });

  it('каждая метка корпуса классифицируется, кроме явного allowlist', () => {
    const unclassified = labels.filter((label) => classifySection(label) === 'other' && !OTHER_ALLOWLIST.has(label));
    expect(unclassified).toEqual([]);
  });

  it('allowlist не протух: каждая его метка всё ещё встречается в корпусе', () => {
    for (const label of OTHER_ALLOWLIST) {
      expect(labels, `${label} исчезла из корпуса — удалить из allowlist`).toContain(label);
    }
  });
});
