# b0t - Workflow Automation Platform

Open-source, self-hostable workflow automation platform where you describe workflows in plain English to Claude Code, which generates, validates, and executes production-grade automations across 140+ integrated services.

## Project Structure

```
src/
  ├── app/              # Next.js App Router (pages, layouts, API routes)
  │   ├── api/rentals/  # Rental listings API (favorites, comments, rankings)
  │   └── dashboard/rentals/ # Rentals dashboard page
  ├── components/       # React UI components (workflows, credentials, clients)
  │   └── rentals/      # Rental listing components (table, dialog, widgets)
  ├── lib/              # Core utilities (workflow engine, auth, db, queue, scheduler)
  ├── modules/          # 16 domain modules, 140+ services (AI, social, communication, business, etc.)
  ├── types/            # TypeScript type definitions
  └── hooks/            # Custom React hooks
scripts/                # Workflow & database management utilities
tests/                  # Test suite with templates & fixtures
drizzle/                # Database migrations (Drizzle ORM)
worker.ts               # Background job worker (BullMQ)
```

## Organization Rules

**Keep code organized and modularized:**
- API routes → `src/app/api/`, one file per resource
- Components → `src/components/`, feature-based folders
- Workflows → `src/lib/workflows/`, separated by executor type
- Modules → `src/modules/`, one folder per domain (social, AI, etc.)
- Types → `src/types/` or co-located with usage
- Tests → `tests/` with matching structure

**Modularity principles:**
- Single responsibility per file
- Clear, descriptive naming
- Group related functionality together
- No monolithic files

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
npm run typecheck
npm run lint
```

Fix ALL errors/warnings before continuing.

If changes affect server/worker (not hot-reloadable):
1. Restart: `npm run dev:full` (starts Next.js + worker)
2. Read server logs for errors
3. Fix ALL warnings/errors before continuing

## Tech Stack

- **Frontend:** React 19, Next.js 15, Tailwind CSS 4, Radix UI
- **Backend:** Node.js 20+, Next.js API Routes, NextAuth v5
- **Database:** PostgreSQL, Drizzle ORM, Redis (BullMQ)
- **AI:** Anthropic Claude, OpenAI GPT
- **Testing:** Vitest, JSDOM

## Documentation

Do not create documentation UNLESS specifically requested to by the user as this wastes context.
