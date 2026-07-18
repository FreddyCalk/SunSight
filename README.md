# Sunsight

Sunsight is an Expo mobile app backed by Supabase for sharing short-lived,
nearby sunset alerts.

## Project layout

- `mobile/`: Expo Router application for iOS and Android
- `supabase/`: local Supabase configuration, migrations, seeds, and functions
- `packages/database-types/`: canonical output for generated TypeScript database
  types
- `docs/`: credential inventory and deployment runbooks

## Mobile development

Install the locked mobile dependencies, then start Expo:

```sh
cd mobile
npm ci
npm run start
```

Use `npm run ios` or `npm run android` from `mobile/` to launch a platform
target.

## Local Supabase

Install the locked root tooling and start the local stack:

```sh
npm ci
npm run supabase:start
```

The source of truth for local services is `supabase/config.toml`. Its enabled
service ports currently include:

- API: `54321`
- Postgres: `54322`
- Studio: `54323`
- Local email UI: `54324`
- Analytics: `54327`
- Edge Functions inspector: `8083`

Reset the local database with `npm run supabase:reset`. Generate database types
with `npm run types:gen`; generated types belong at
`packages/database-types/src/database.types.ts`.

## Operations

- [Credentials and secrets](docs/credentials.md)
- [Deployment runbook](docs/deployment.md)
