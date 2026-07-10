/**
 * Custom not-found boundary (App Router root-level catch). Required with
 * `output: 'export'`: without it, Next.js auto-generates one that prerenders
 * outside our provider tree and crashes — see `global-error.tsx` and
 * `.ai-factory/plans/feature-static-export-hono-bff.md` T13.
 */
export default function NotFound() {
  return (
    <div style={{ padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p>Страница не найдена.</p>
    </div>
  );
}
