# Telegram Channel Copier

A web dashboard that copies all posts from one Telegram channel to another using MTProto API — preserving grouped albums and captions, removing spoiler formatting, posting without forwarding.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/tg-copier run dev` — run the frontend (port assigned by artifact)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (tables: `tg_session`, `copy_jobs`)
- Telegram: GramJS (`telegram` npm package) via MTProto
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite, TanStack Query, Tailwind CSS

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/jobs.ts` — DB schema (tg_session, copy_jobs tables)
- `artifacts/api-server/src/lib/telegram.ts` — GramJS client singleton + session persistence
- `artifacts/api-server/src/lib/copier.ts` — channel copy logic (album grouping, spoiler removal)
- `artifacts/api-server/src/routes/auth.ts` — Telegram auth routes (send-code, sign-in, 2FA, logout)
- `artifacts/api-server/src/routes/jobs.ts` — copy job CRUD routes
- `artifacts/tg-copier/src/` — React frontend dashboard

## Architecture decisions

- MTProto session string is stored in `tg_session` table (id=1 always), loaded on startup.
- Copy jobs run as background async tasks in the Express process; `copier.ts` has a `Map<jobId, {stop}>` for cancellation.
- Spoiler entities (`Api.MessageEntitySpoiler`) are filtered out before re-sending.
- Albums (grouped media) are detected by `message.groupedId` and sent as a group via `client.sendFile([...])`.
- `bufferutil` and `utf-8-validate` are in `onlyBuiltDependencies` in `pnpm-workspace.yaml` (needed by GramJS websocket transport).

## Gotchas

- After any `lib/*` change, run `pnpm run typecheck:libs` before checking artifact packages.
- `type: integer` in OpenAPI generates `zod.int()` which is Zod v4 syntax — use `type: number` instead since the Zod import in generated files targets v3.
- `bufferutil` and `utf-8-validate` must be in `onlyBuiltDependencies` to compile native modules.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
