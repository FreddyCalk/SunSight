# @sunsight/database-types

Generated TypeScript definitions for Sunsight's `public` Supabase schema. Import
the complete generated contract from `@sunsight/database-types` or
`@sunsight/database-types/generated`.

## Prerequisites

- Install repository dependencies from the repository root with `npm install`.
- Start the local Supabase stack with `npx supabase start`.
- Install this package's development dependency with
  `npm install --prefix packages/database-types`.

The generator uses the repository-pinned Supabase CLI and refuses to run if the
installed CLI version does not match the root manifest.

## Commands

Run these from this directory:

```sh
npm run generate
npm run check:drift
npm run typecheck
```

`generate` replaces `src/database.types.ts` only after generation succeeds.
`check:drift` compares a temporary generation byte-for-byte with the tracked
file, exits nonzero when they differ, and never overwrites the tracked file.
Temporary output is removed whether generation succeeds or fails.

Do not hand-edit `src/database.types.ts`. Make schema changes through Supabase
migrations, reset the local database, and regenerate the contract.
