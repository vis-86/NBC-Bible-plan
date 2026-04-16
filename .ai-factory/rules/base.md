# Project Base Rules

> Auto-detected conventions from codebase analysis. Edit as needed.

## Naming Conventions

- **Files:** PascalCase for components (`PlanView.tsx`, `DayNavigationBar.tsx`), camelCase for hooks/utils (`usePlan.ts`, `date.ts`)
- **Components:** Named exports with explicit React.FC typing (`export const PlanView: React.FC<PlanViewProps> = ...`)
- **Hooks:** prefix `use` (`usePlan`, `useDayCompletion`, `useReadingSettings`)
- **Types/Interfaces:** PascalCase, defined in `src/types/index.ts` or `types.ts` within feature
- **API routes:** kebab-case directories (`app/api/user/reading-settings/route.ts`)
- **Variables:** camelCase
- **CSS classes:** Tailwind utilities, custom tokens via CSS variables

## Module Structure (FSD)

- `src/app/` — Next.js App Router pages, layouts, API routes only
- `src/features/<name>/` — self-contained feature slices:
  - `components/` — React components for this feature
  - `hooks/` — React hooks
  - `contexts/` — React contexts
  - `types.ts` — feature-local types
- `src/shared/` — cross-feature shared code:
  - `components/layout/`, `animations/`, `ui/`, `bible/`, `skeletons/`
  - `hooks/` — generic shared hooks
  - `services/api/` — API client, endpoints, graphql
  - `utils/` — pure utility functions
  - `types/` — global type definitions

## Component Patterns

- Always use `'use client'` directive for client components
- Props interface named `<ComponentName>Props` inline in file
- Import order: React → Next.js → external libs → internal features → shared → local
- Use `cn()` utility (from `@/shared/utils/cn`) for conditional class merging
- Prefer named exports over default exports

## Error Handling

- API routes: return `NextResponse.json({ error: ... }, { status: ... })`
- Client fetch: use `ApiClientError` from `@/shared/services/api/client`
- Async state: explicit loading/error states in component (`useState`)

## Path Aliases

- `@/` maps to `src/` (configured in `tsconfig.json`)
- Use `@/` for cross-feature imports, relative for within-feature

## Styling

- Tailwind CSS v4 (CSS-first config in `globals.css`)
- Custom CSS variables for design tokens (colors, spacing)
- `tailwind-merge` for dynamic class composition via `cn()`
- Framer Motion (`motion`) for animations

## Directus Integration

- Directus SDK: `@directus/sdk` v20
- Server-side only: `DIRECTUS_ADMIN_TOKEN` via env vars
- Client proxy: `/api/directus/[...path]/route.ts` — all client Directus calls go through this proxy
- Never expose admin token to client

## Authentication

- Lucia v3 sessions stored in SQLite via `better-sqlite3`
- Session cookie: httpOnly, server-side only
- Telegram auth: verified via `TELEGRAM_BOT_TOKEN` in `/api/auth/telegram/route.ts`
- Middleware (`src/middleware.ts`) protects `/dashboard` routes

## Deployment

- Next.js `output: 'standalone'`
- `NEXT_PUBLIC_BASE_PATH=/app` — all paths prefixed with `/app`
- Use `getApiPath()` from `@/shared/utils/api` for constructing API URLs client-side
- Deploy via `./copy-prod.sh` to production server
