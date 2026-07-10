'use client';

/**
 * Custom global-error boundary (App Router root-level catch). Required with
 * `output: 'export'`: without it, Next.js auto-generates one that prerenders
 * outside our provider tree and crashes (`useContext` on null) — see
 * `.ai-factory/plans/feature-static-export-hono-bff.md` T13. Must not depend
 * on any context provider — it replaces `html`/`body` when the whole tree throws.
 */
export default function GlobalError() {
  return (
    <html lang="ru">
      <body>
        <div style={{ padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <p>Что-то пошло не так. Обновите страницу.</p>
        </div>
      </body>
    </html>
  );
}
