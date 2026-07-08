/**
 * Чистый liveness-пинг: без auth, без обращений к Directus/SQLite. Используется
 * клиентом (`isServerReachable` в `@/shared/offline/sync`) как гейт перед
 * `online`-триггером синка outbox — `online` в браузере значит «есть сетевой
 * интерфейс», не «сервер достижим» (lie-fi).
 */
export async function GET() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
