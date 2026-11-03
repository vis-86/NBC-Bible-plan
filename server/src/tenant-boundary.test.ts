/**
 * Гейт границы команд.
 *
 * BFF ходит в Directus админ-токеном и видит данные всех команд, поэтому коллекции команд
 * (`songs`, `setlists`, `setlist_items`, `song_user_state`, `teams`, `team_members`) читаются
 * и пишутся только из сервисов фич, которые принимают `teamId` и сами ставят фильтр команды.
 * Тест сканирует исходники `server/src` и `src` (кроме тестов) и падает в любом другом файле на:
 * - вызове Directus SDK с литералом коллекции команды (в том числе под псевдонимом импорта);
 * - вызове SDK с коллекцией не литералом (переменная, вызов, шаблон с подстановкой) — по коду
 *   не видно, чья это коллекция, поэтому вне сервисов так нельзя ни с какой коллекцией;
 * - REST-пути `items/<коллекция>` с ведущим `/` или без.
 * `scripts/` не сканируется: это одноразовые миграции под админ-токеном, не рантайм BFF.
 * GraphQL-запросы не разбираются: BFF шлёт в Directus только мутации и запросы прогресса чтения.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCAN_ROOTS = ['server/src', 'src'];

const TEAM_COLLECTIONS = ['songs', 'setlists', 'setlist_items', 'song_user_state', 'teams', 'team_members'];

/**
 * Единственные файлы, которым разрешён прямой доступ к коллекциям команд. Каждый — сервис
 * с `teamId` (или, для `teams.ts`, само членство, из которого `teamId` и берётся).
 */
const ALLOWED_FILES = [
  'src/features/songs/services/songsServer.ts',
  'src/features/songs/services/songStateServer.ts',
  'src/features/setlists/services/setlistsServer.ts',
  'src/lib/teams.ts',
  // Участники и инвайты своей команды (`team_members`) для `team_admin`, `teamId` — из `requireTeam`.
  'src/features/team/services/teamServer.ts',
];

const COLLECTIONS_RE = TEAM_COLLECTIONS.join('|');

/**
 * Команды SDK с коллекцией первым аргументом. IndexedDB (`db.delete('songs', …)`) сюда не
 * попадает: у idb другие имена методов.
 */
const SDK_COMMANDS = [
  'readItems',
  'readItem',
  'createItems',
  'createItem',
  'updateItems',
  'updateItem',
  'updateItemsBatch',
  'deleteItems',
  'deleteItem',
  'aggregate',
];

const SDK_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@directus\/sdk['"]/g;

/** REST-путь Directus к коллекции команды: `/items/songs`, `'items/songs'`, `${url}/items/teams`. */
const REST_PATH_RE = new RegExp(`(?<![\\w.-])items/(?:${COLLECTIONS_RE})(?![\\w-])`, 'g');

/** Имена команд SDK в файле: сами команды плюс псевдонимы `import { readItems as x } from '@directus/sdk'`. */
function sdkCommandNames(code: string): string[] {
  const names = new Set(SDK_COMMANDS);
  for (const [, specifiers] of code.matchAll(SDK_IMPORT_RE)) {
    for (const specifier of specifiers.split(',')) {
      const alias = specifier.trim().match(/^(?:type\s+)?(\w+)\s+as\s+(\w+)$/);
      if (alias && SDK_COMMANDS.includes(alias[1])) names.add(alias[2]);
    }
  }
  return [...names];
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectSourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

function findTeamCollectionAccess(code: string): string[] {
  // Перенос строки и generic-аргументы между именем и первым аргументом допустимы.
  const call = `\\b(?:${sdkCommandNames(code).join('|')})\\s*(?:<[^>()]*>)?\\s*\\(\\s*`;
  const literal = new RegExp(`${call}(['"\`])(?:${COLLECTIONS_RE})\\1`, 'g');
  // Первый аргумент — идентификатор/вызов/свойство или шаблон с подстановкой.
  const dynamic = new RegExp(call + '(?:[A-Za-z_$]|`[^`]*\\$\\{)', 'g');
  return [...code.matchAll(literal), ...code.matchAll(dynamic), ...code.matchAll(REST_PATH_RE)].map((m) =>
    m[0].replace(/\s+/g, ' ')
  );
}

describe('граница команд: коллекции команд — только через сервисы фич', () => {
  it('регулярка видит вызовы во всех формах и не путает их с IndexedDB и чужими коллекциями', () => {
    const hits = [
      "readItems('songs', { limit: 1 })",
      'readItem("setlists", id)',
      'createItems(\n      `setlist_items`,\n      rows)',
      "updateItem('song_user_state', id, payload)",
      "deleteItems('setlists', [id])",
      "readItems<Schema>('team_members', {})",
      'fetch(`${url}/items/teams?limit=1`)',
      // REST-путь без ведущего `/`.
      "proxyToDirectus('items/songs', c)",
      // Коллекция не литералом.
      'readItems(COLLECTION, { limit: 1 })',
      'deleteItem(\n  collectionFor(kind),\n  id)',
      'updateItems(this.collection, keys, patch)',
      'readItems(`${prefix}songs`, {})',
      // Псевдоним импорта SDK — с литералом и без.
      "import { readItems as ri } from '@directus/sdk';\nri('songs', {})",
      "import { createItem, deleteItems as wipe } from '@directus/sdk';\nwipe(name, [id])",
    ];
    for (const code of hits) expect(findTeamCollectionAccess(code), code).toHaveLength(1);

    const misses = [
      "db.delete('songs', id)",
      "db.get('setlists', key)",
      "readItems('reading', {})",
      "readItems('songs_archive', {})",
      'readItems(\n  `plan`, {})',
      "app.request('/app/api/setlists')",
      "const key = 'line-items/songs'",
      "import { readItems as ri } from '@directus/sdk';\nri('reading', {})",
      // Псевдоним не из SDK не расширяет список команд.
      "import { foo as ri } from './local';\nri(name)",
    ];
    for (const code of misses) expect(findTeamCollectionAccess(code), code).toEqual([]);
  });

  it('каждый разрешённый файл действительно ходит в коллекции команд (список не устарел)', () => {
    for (const rel of ALLOWED_FILES) {
      const full = path.join(REPO_ROOT, rel);
      // Сервис может прийти из параллельной ветки раньше, чем появится в этой: отсутствие не нарушение.
      if (!existsSync(full)) continue;
      const code = readFileSync(full, 'utf8');
      expect(
        findTeamCollectionAccess(code).length,
        `${rel} больше не обращается к коллекциям команд — убери его из ALLOWED_FILES в tenant-boundary.test.ts`
      ).toBeGreaterThan(0);
    }
  });

  it('нет прямых обращений к коллекциям команд вне разрешённых сервисов', () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(path.join(REPO_ROOT, root))) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
        if (ALLOWED_FILES.includes(rel)) continue;
        for (const hit of findTeamCollectionAccess(readFileSync(file, 'utf8'))) {
          violations.push(`${rel}: ${hit}`);
        }
      }
    }

    expect(
      violations,
      'Прямой доступ к коллекциям команд мимо сервиса фичи. Ходи через сервис фичи с teamId ' +
        '(songsServer / songStateServer / setlistsServer / teamServer / src/lib/teams.ts): он ставит фильтр команды ' +
        'на каждый запрос, а teamId берётся только из requireTeam (c.get("teamId")). Вне сервисов ' +
        'коллекция в вызове SDK — только литералом, чтобы было видно, чья она. Новый сервис ' +
        'с teamId — добавь в ALLOWED_FILES осознанно.\n' +
        violations.join('\n')
    ).toEqual([]);
  });
});
