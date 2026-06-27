# Workout

An ad-free, no-paywall iOS workout app — starting with strength training (lifting).
Everything in the app is free; the only thing you can pay for is an optional donation
(planned, not yet built). **Sign in with Apple only.**

> Repo codename: `frail-emu`. The package scope is `@workout/*` and can be renamed
> later with a project-wide find/replace.

## Stack

| Concern         | Choice                                                |
| --------------- | ----------------------------------------------------- |
| App             | React Native via **Expo** (dev client) + Expo Router  |
| Auth            | **Sign in with Apple** only (`expo-apple-authentication`) |
| Backend / DB    | **Supabase** (Postgres + Auth + Row Level Security)   |
| Language        | TypeScript everywhere                                  |
| Monorepo        | **pnpm** workspaces + **Turborepo**                   |
| CI              | GitHub Actions (typecheck / lint / format)            |

## Layout

```
.
├── apps/
│   └── mobile/            # Expo app (iOS). Expo Router, Apple sign-in.
├── packages/
│   ├── core/             # @workout/core — framework-agnostic domain types + pure logic
│   ├── supabase/         # @workout/supabase — typed client, auth helpers, DB types
│   ├── eslint-config/    # @workout/eslint-config — shared flat ESLint config
│   └── tsconfig/         # @workout/tsconfig — shared TS base configs
├── supabase/             # Supabase project: config.toml, migrations, seed (CLI-managed)
├── turbo.json            # Turborepo task graph
├── pnpm-workspace.yaml   # Workspace globs
└── .npmrc                # node-linker=hoisted (required for RN/Metro + pnpm)
```

Internal packages are **source-only**: they ship their `src/*.ts` directly and are
transpiled by Metro (the mobile app) or `tsc` (typecheck). There is no per-package
build step.

## Prerequisites

- **Node 22** (`nvm use` reads `.nvmrc`)
- **pnpm 11** — `corepack enable` then `corepack prepare pnpm@11.9.0 --activate`
- **Xcode** + iOS Simulator (for the mobile app)
- **Supabase CLI** — run via `pnpm supabase ...` (uses `pnpm dlx supabase`)

## Getting started

```bash
# 1. Install everything
pnpm install

# 2. Configure environment
cp .env.example .env            # fill in your Supabase project values

# 3. (Optional) Run Supabase locally
pnpm supabase start
pnpm supabase db reset          # apply migrations + seed

# 4. Run the app (iOS)
pnpm mobile run ios             # or: pnpm --filter @workout/mobile ios
```

## Common scripts (root)

| Command               | What it does                                  |
| --------------------- | --------------------------------------------- |
| `pnpm dev`            | Run all `dev` tasks via Turborepo             |
| `pnpm typecheck`      | Typecheck every package/app                   |
| `pnpm lint`           | Lint every package/app                        |
| `pnpm format`         | Prettier-format the repo                      |
| `pnpm mobile <cmd>`   | Run a script in the mobile app                |
| `pnpm supabase <cmd>` | Run the Supabase CLI                          |

## Principles

- **No ads, ever. No premium tier.** Feature parity for everyone.
- Donations are the only paid surface (planned).
- Apple sign-in only — no email/password, no other social providers.
