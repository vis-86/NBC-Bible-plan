/**
 * Гейт на runtime-замыкание BFF-образа.
 *
 * BFF в проде запускается через tsx из `deploy/Dockerfile` (target `bff`), куда
 * копируется НЕ весь `src/`, а точечный список каталогов. Любой импорт из
 * `src/`, достижимый из `server/src`, без соответствующей COPY-строки роняет
 * контейнер на старте (ERR_MODULE_NOT_FOUND) — и весь `/app/api/*` отдаёт 502,
 * включая логин. Локально и в тестах это невидимо: там доступен весь репозиторий.
 *
 * Обход ТРАНЗИТИВНЫЙ: скопированный `src/`-файл тянет свои импорты, и они тоже
 * обязаны быть в образе (реальный инцидент: `songsServer.ts` → `../lib/searchText`
 * при `COPY src/features/songs/services` — 502 на всём API).
 * `import type` не различаем осознанно: tsx их стирает, но требовать COPY для
 * всего проще и не даёт ошибиться на смешанных формах импорта.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
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

/** Путь импорта → файл на диске (как это сделает tsx: расширение или index). */
function resolveToFile(base: string): string | null {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/**
 * Транзитивное замыкание импортов из `src/`, достижимых из server/src.
 * Возвращает пути вида `src/features/songs/lib/searchText` (без расширения) —
 * в таком виде их сопоставляем с COPY-каталогами.
 */
function collectSrcImports(): Set<string> {
  const found = new Set<string>();
  const importRe = /from\s+'([^']+)'/g;

  const queue = collectTsFiles(SERVER_SRC);
  const visited = new Set(queue);

  while (queue.length > 0) {
    const file = queue.shift()!;
    const code = readFileSync(file, 'utf8');

    for (const [, spec] of code.matchAll(importRe)) {
      let base: string | null = null;
      if (spec.startsWith('@/')) base = path.join(REPO_ROOT, 'src', spec.slice(2));
      else if (spec.startsWith('.')) base = path.resolve(path.dirname(file), spec);
      if (!base) continue;

      const rel = path.relative(REPO_ROOT, base);
      if (rel.startsWith('src/')) found.add(rel);

      const resolved = resolveToFile(base);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }

  return found;
}

/**
 * Пути, реально попадающие в bff-образ (COPY-строки stage `bff`).
 * Расширение отрезаем: импорты собираются без него (`.../types`, не `.../types.ts`).
 */
function collectCopiedDirs(): string[] {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');
  const bffStage = dockerfile.split(/^FROM .* AS bff$/m)[1];
  if (!bffStage) throw new Error('stage `bff` not found in deploy/Dockerfile');

  // Только stage `bff`, до следующего FROM.
  const body = bffStage.split(/^FROM /m)[0];

  return [...body.matchAll(/^COPY\s+(?!--from)(src\/\S+)\s/gm)].map(([, dir]) =>
    dir.replace(/\.tsx?$/, ''),
  );
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
