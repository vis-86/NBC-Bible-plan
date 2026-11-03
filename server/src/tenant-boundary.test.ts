/**
 * Гейт границы команд.
 *
 * BFF ходит в Directus админ-токеном и видит данные всех команд, поэтому коллекции команд
 * (`songs`, `setlists`, `setlist_items`, `song_user_state`, `teams`, `team_members`) читаются
 * и пишутся только из сервисов фич, которые принимают `teamId` и сами ставят фильтр команды.
 * Тест сканирует исходники `server/src` и `src` (кроме тестов) и падает на любом вызове
 * Directus SDK или REST-пути `/items/<коллекция>` к этим коллекциям из другого файла.
 * `scripts/` не сканируется: это одноразовые миграции под админ-токеном, не рантайм BFF.
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
 * Команды SDK с коллекцией первым аргументом: `readItem(s)`, `createItem(s)`, `updateItem(s)`,
 * `updateItemsBatch`, `deleteItem(s)`, `aggregate`. Литерал в любых кавычках, перенос строки
 * между скобкой и литералом допустим. IndexedDB (`db.delete('songs', …)`) сюда не попадает.
 */
const SDK_CALL_RE = new RegExp(
  `\\b(?:readItems?|createItems?|updateItems?|updateItemsBatch|deleteItems?|aggregate)\\s*(?:<[^>()]*>)?\\s*\\(\\s*(['"\`])(?:${COLLECTIONS_RE})\\1`,
  'g'
);

/** Голый REST-путь Directus к коллекции команды (`fetch(\`${url}/items/songs\`)` и т.п.). */
const REST_PATH_RE = new RegExp(`/items/(?:${COLLECTIONS_RE})(?![a-z_])`, 'g');

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
  return [...code.matchAll(SDK_CALL_RE), ...code.matchAll(REST_PATH_RE)].map((m) => m[0].replace(/\s+/g, ' '));
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
    ];
    for (const code of hits) expect(findTeamCollectionAccess(code), code).toHaveLength(1);

    const misses = [
      "db.delete('songs', id)",
      "db.get('setlists', key)",
      "readItems('reading', {})",
      "readItems('songs_archive', {})",
      "app.request('/app/api/setlists')",
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
        'на каждый запрос, а teamId берётся только из requireTeam (c.get("teamId")). Новый сервис ' +
        'с teamId — добавь в ALLOWED_FILES осознанно.\n' +
        violations.join('\n')
    ).toEqual([]);
  });
});
