# Local development runbook

Run commands from the repository root unless noted. Docker must be running.
The root manifest pins Supabase CLI `2.109.1`.

## Environment files

1. Copy `.env.example` to the ignored root `.env`. It supplies the three
   `SUPABASE_AUTH_SMS_TWILIO_*` names used by `supabase/config.toml`. The
   committed placeholders only allow local config parsing; local Auth uses the
   fixed fictional test OTP.
2. Copy `supabase/functions/.env.example` to an ignored local file such as
   `supabase/functions/.env.local`. Set:
   - `PHONE_HMAC_SECRET` to the same version 1 key provisioned in local Vault.
   - `DISPATCH_WORKER_SECRET` to at least 32 random bytes.
3. Create ignored `mobile/.env.local` with the exact variables read by the
   mobile client:
   - `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase status>`

Both `EXPO_PUBLIC_*` values are client-visible. Never put a service-role key,
worker secret, phone HMAC key, Twilio token, or provider credential there.

## Start, reset, and test

```sh
npm ci
cp .env.example .env
npm run supabase:start
npm run supabase:reset
npx supabase test db supabase/tests --local
npx supabase db lint --local --schema public --level error --fail-on error
npx supabase db advisors --local --type all --level warn --fail-on error
npm run auth:smoke
```

Provision the local Vault secret named `PHONE_HMAC_SECRET` after a reset if a
test or manual flow finalizes profiles. A reset rebuilds the database and does
not preserve operational secrets.

## Generate and check database types

The canonical generated file is
`packages/database-types/src/database.types.ts`.

```sh
npm install --prefix packages/database-types
npm run generate --prefix packages/database-types
npm run check:drift --prefix packages/database-types
npm run typecheck --prefix packages/database-types
```

The package scripts verify the pinned CLI and generate from the running local
database. `check:drift` does not overwrite the tracked file.

## Serve Edge Functions

Start the local stack first, then run this in a second terminal:

```sh
npx supabase functions serve \
  --env-file supabase/functions/.env.local
```

The runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The custom env file supplies only
`PHONE_HMAC_SECRET` and `DISPATCH_WORKER_SECRET`.

The implemented function names are:

- `match-contacts`
- `register-device`
- `upsert-location`
- `create-blast`
- `complete-photo-upload`
- `get-blast-access`
- `dispatch-notifications`

CLI `2.109.1` has no `supabase functions invoke` subcommand. Invoke local
functions over HTTP at
`http://127.0.0.1:54321/functions/v1/<function-name>`.
Authenticated functions require the user's access token:

```sh
curl --fail-with-body \
  'http://127.0.0.1:54321/functions/v1/get-blast-access' \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "apikey: $LOCAL_ANON_KEY" \
  -H 'content-type: application/json' \
  --data '{"blastId":"<blast-uuid>"}'
```

Do not paste real tokens into tracked files or shell transcripts intended for
sharing.

`create-blast` requires `timezone` in addition to `kind`, `idempotencyKey`, and
`expiresAt`. The database, not the client, computes the maximum expiry from
server time as the earlier of the configured visibility limit and local
midnight in that IANA timezone. `expiresAt` can shorten that interval but is
clamped if it attempts to extend it.

`register-device` permits an authenticated user to refresh their own existing
Expo push token. It rejects a token already owned by another user rather than
transferring ownership.

## Invoke the dispatch worker

`dispatch-notifications` intentionally disables gateway JWT verification and
authenticates the operator with `x-worker-secret`. The request body accepts a
batch limit from 1 through 100 and defaults to 50.

```sh
curl --fail-with-body \
  'http://127.0.0.1:54321/functions/v1/dispatch-notifications' \
  -H "x-worker-secret: $DISPATCH_WORKER_SECRET" \
  -H 'content-type: application/json' \
  --data '{"limit":50}'
```

Use a scheduler or worker process to invoke this endpoint repeatedly in hosted
environments. Never expose `DISPATCH_WORKER_SECRET` to mobile clients.
If a worker abandons a claim, its outbox lock expires after five minutes.
Running the worker again can reclaim the work, including an orphaned `queued`
delivery whose `next_attempt_at` is null. A null retry time is terminal only
for a delivery in the `failed` state, not for an abandoned queued delivery.

## Current photo completion boundary

`complete-photo-upload` currently fails closed with HTTP 503 and
`MEDIA_PROCESSOR_UNAVAILABLE` after validating basic byte, MIME/magic, and
dimension limits. It does not advance the blast, create derivatives, or expose
the original. Nudge creation, contact matching, recipient selection, and text
push dispatch remain available. Photo completion must not be treated as a
working local or hosted flow until an Edge-compatible decoder/encoder strips
metadata and creates bounded derivatives. The underlying
`complete_photo_blast` RPC is executable only by `service_role`; authenticated
users cannot call it directly.
