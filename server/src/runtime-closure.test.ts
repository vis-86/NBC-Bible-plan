/**
 * Гейт на runtime-замыкание BFF-образа.
 *
 * BFF в проде запускается через tsx из `deploy/Dockerfile` (target `bff`), куда
 * копируется НЕ весь `src/`, а точечный список каталогов. Любой новый импорт из
 * `src/` в `server/src` без соответствующей COPY-строки роняет контейнер на
 * старте (ERR_MODULE_NOT_FOUND) — и весь `/app/api/*` отдаёт 502, включая логин.
 * Локально и в тестах это невидимо: там доступен весь репозиторий.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SERVER_SRC = path.join(REPO_ROOT, 'server/src');
const DOCKERFILE = path.join(REPO_ROOT, 'deploy/Dockerfile');

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    if (!entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.test.ts')) return [];
    return [full];
  });
}

/** Пути вида `src/lib/directus` — из относительных `../../../src/...` и алиаса `@/...`. */
function collectSrcImports(): Set<string> {
  const found = new Set<string>();
  const importRe = /from\s+'([^']+)'/g;

  for (const file of collectTsFiles(SERVER_SRC)) {
    const code = readFileSync(file, 'utf8');
    for (const [, spec] of code.matchAll(importRe)) {
      if (spec.startsWith('@/')) {
        found.add(`src/${spec.slice(2)}`);
      } else if (spec.startsWith('.')) {
        const resolved = path.relative(REPO_ROOT, path.resolve(path.dirname(file), spec));
        if (resolved.startsWith('src/')) found.add(resolved);
      }
    }
  }

  return found;
}

/** Каталоги, реально попадающие в bff-образ (COPY-строки stage `bff`). */
function collectCopiedDirs(): string[] {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');
  const bffStage = dockerfile.split(/^FROM .* AS bff$/m)[1];
  if (!bffStage) throw new Error('stage `bff` not found in deploy/Dockerfile');

  // Только stage `bff`, до следующего FROM.
  const body = bffStage.split(/^FROM /m)[0];

  return [...body.matchAll(/^COPY\s+(?!--from)(src\/\S+)\s/gm)].map(([, dir]) => dir);
}

describe('BFF runtime closure (deploy/Dockerfile stage `bff`)', () => {
  const copiedDirs = collectCopiedDirs();
  const srcImports = [...collectSrcImports()].sort();

  it('находит импорты из src/ и COPY-строки (иначе тест бессмысленно зелёный)', () => {
    expect(copiedDirs.length).toBeGreaterThan(0);
    expect(srcImports.length).toBeGreaterThan(0);
  });

  it.each(srcImports)('%s покрыт COPY в bff-образе', (importPath) => {
    const covered = copiedDirs.some(
      (dir) => importPath === dir || importPath.startsWith(`${dir}/`),
    );

    expect(
      covered,
      `server/src импортирует "${importPath}", но deploy/Dockerfile (stage bff) копирует только: ` +
        `${copiedDirs.join(', ')}. Без COPY контейнер упадёт на старте и весь API отдаст 502.`,
    ).toBe(true);
  });
});
