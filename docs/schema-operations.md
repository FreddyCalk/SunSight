# Schema and local backend operations

This document describes the foundation migration currently in the repository.
It does not describe planned mobile screens, Edge Functions, media processors,
or queue workers as if they already exist.

## Database shape

The migration enables PostGIS in `extensions`, pgcrypto in `extensions`,
Supabase Vault in `vault`, and a non-Data-API `private` schema.

Stable enums:

- `profile_status`: `pending`, `active`, `suspended`, `deleted`
- `blast_kind`: `nudge`, `photo`
- `blast_status`: `draft`, `uploading`, `ready`, `dispatching`, `dispatched`,
  `failed_invalid_input`, `failed_upload`, `failed_delivery`
- `recipient_delivery_state`: `pending`, `queued`, `accepted`, `delivered`,
  `failed`, `invalid_token`
- `device_platform`: `ios`, `android`
- `location_source`: `foreground`, `background`

Tables and relationships:

- `profiles`: one row per `auth.users` row. The Auth trigger creates it as
  `pending`; verified-phone finalization can activate it.
- `devices`: many devices per profile; push token is globally unique.
- `location_snapshots`: at most one current coarse geography row per profile,
  with capture, expiry, accuracy, and source metadata.
- `sunset_blasts`: sender-owned nudge or photo records with a sender-scoped
  idempotency key, capture geography, expiry, state, and private object paths.
- `blast_recipients`: unique blast/recipient eligibility snapshots. A trigger
  freezes audience identity and eligibility fields after selection.
- `blocks`: directed blocker/blocked pairs; self-blocks are rejected.
- `notification_preferences`: at most one mute/quiet-hours row per profile.
- `notification_deliveries`: per-recipient, per-device delivery attempts and
  provider result metadata.
- `contact_matches`: expiring, one-way owner-to-matched-user rows. Raw contact
  numbers and contact HMACs are not stored here.
- `notification_outbox`: one transactional notification event per persisted
  recipient.
- `app_config`: constrained integer JSON values for radius, location TTL,
  maximum location accuracy, shared cooldown, visibility, and recipient cap.

The seed supplies repeatable local defaults: 1,609-meter radius, four-hour
location TTL, 500-meter maximum accuracy, thirty-minute cooldown, four-hour
maximum visibility, and a 100-recipient cap.

## Client access and server ownership

RLS is enabled on all 11 public application tables. Table grants and policies
both apply.

- `profiles`: authenticated users can select only their own row and can update
  only `display_name`. `phone_hmac`, `phone_hmac_version`, status, and
  privacy-acceptance fields are server-owned under the current grants.
- `location_snapshots`: users can select only their own row. Writes go through
  `public.upsert_location_snapshot`; direct table writes are not granted.
- `sunset_blasts`: users can select only blasts they sent. Creation goes through
  `public.create_blast`; direct table writes are not granted.
- `blocks`: users can select, insert, and delete only rows where they are the
  blocker.
- `notification_preferences`: users can select and insert their own row and
  update only preference columns. Identity and timestamps are not
  client-writable.
- `devices`, `blast_recipients`, `notification_deliveries`, `app_config`,
  `contact_matches`, and `notification_outbox`: no authenticated table grants.
  They are server-owned.
- Anonymous users receive no application-table grants.

The authenticated RPC surface is:

- `public.finalize_verified_profile(policy_version)`
- `public.upsert_location_snapshot(...)`
- `public.create_blast(...)`
- `public.select_and_persist_recipients(uuid)`

These functions derive identity from `auth.uid()` and use explicit empty
`search_path` settings. Recipient selection currently implements expiring
one-way contact matches, active profiles, fresh and accurate locations,
configured distance and cap, bilateral blocks, disabled blasts, and active
mutes. Quiet-hour evaluation is not implemented.

## Private photo storage

The migration creates `sunset-photos` as a private bucket with a 15 MiB object
limit and JPEG, PNG, and WebP MIME allowlist. Authenticated select, insert,
update, and delete policies intentionally evaluate false. Arbitrary client
object access is therefore denied.

Signed upload/read URL issuance, recipient-gated reads, decoded-image
validation, EXIF removal, derivatives, and deletion are not implemented. The
bucket and object-path columns are schema foundations only.

## Auth profile bootstrap and finalization

`private.bootstrap_profile()` runs after insertion into `auth.users` and creates
only a pending profile. It does not trust user metadata and does not derive a
phone HMAC.

Clients call the exposed `public.finalize_verified_profile(policy_version)` RPC
after SMS confirmation. That security-invoker wrapper calls
`private.finalize_verified_profile(policy_version)`, which:

1. requires `auth.uid()`;
2. requires a non-empty `policy_version` string;
3. loads the caller's confirmed phone from `auth.users`;
4. accepts only canonical `+1` E.164 shape;
5. reads the newest Vault secret named `PHONE_HMAC_SECRET`;
6. requires at least 32 bytes;
7. stores an HMAC-SHA-256 identifier at version 1;
8. writes `privacy_policy_version` and `privacy_policy_accepted_at`; and
9. changes the pending profile to `active`.

The function never accepts a phone or user ID from the caller. Privacy-policy
acceptance is part of this RPC, not a separate client write.

## Vault provisioning and rotation

Provision a distinct `PHONE_HMAC_SECRET` in each environment through the
Supabase Dashboard Vault UI or `vault.create_secret` from a trusted SQL session.
Keep only its name and purpose in repository documentation; keep its value in
the team password manager. Do not put it in migrations, seeds, logs, shell
history, chat, or mobile configuration.

The migration remains reproducible without the value. Finalization fails closed
while the secret is absent or too short.

Do not rotate version 1 in place. Provision a new named/versioned secret, add
dual-version matching in a migration, backfill and verify identifiers, then
retire the old secret. The current schema and function support only version 1,
so rotation requires implementation work before changing the active value.

## Twilio Verify configuration

Local `config.toml` reads:

- `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
- `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
- `SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID`

Despite the TOML field name `message_service_sid`, the `twilio_verify` provider
requires a Verify Service SID with the `VA` prefix. A Messaging Service SID with
the `MG` prefix is a different resource and must not be used in that field.

The committed local test-OTP mapping uses a reserved fictional number and avoids
provider delivery. Never copy fixed OTP mappings to staging or production.
Local CAPTCHA is currently disabled in `config.toml`; hosted CAPTCHA and Auth
provider settings must be configured and tested separately. Operator steps for
local smoke and hosted live SMS are in [auth.md](auth.md#local-auth).

## Local commands

Run from the repository root with Docker available. The root lockfile pins
Supabase CLI `2.109.1`.

```sh
npm ci
cp .env.example .env   # root .env; or export the three Twilio env names
npm run supabase:start
npm run auth:smoke
npm run supabase:reset
npx supabase test db supabase/tests/database --local
npx supabase test db supabase/tests/foundation_test.sql --local
npx supabase db lint --local --schema public --level error --fail-on error
npx supabase db advisors --local --type all --level warn --fail-on error
npm run types:gen
```

Copy the root `.env.example` to the ignored root `.env`, or export the three
Twilio environment names, before starting the stack. The CLI reads `env(...)`
values for `config.toml` from the root `.env`, not `supabase/.env`.
Placeholders satisfy configuration parsing; local OTP uses the committed
`test_otp` mapping
(`+12025550100` → `123456`), not Twilio delivery. See
[auth.md — Local Auth](auth.md#local-auth) for smoke and hosted verification
steps.

`npm run auth:smoke` proves OTP verification creates a session. Run it after
the stack is healthy and again after Auth configuration changes.

`npm run types:gen` writes the canonical generated contract to
`packages/database-types/src/database.types.ts`. Run it only after the local
stack is healthy and after every migration change.

## Not implemented

The foundation migration creates records and constraints needed by later
operations, but it does not implement:

- a worker that claims `notification_outbox`, batches provider calls, retries,
  stores receipts, or disables invalid tokens;
- retention jobs for stale locations, expired blasts and media, abandoned
  uploads, old contact matches, outbox rows, or delivery records;
- photo upload authorization, server-side image validation, EXIF stripping,
  display/thumbnail derivatives, signed read URLs, or expiry deletion;
- Edge Functions for contact ingestion, media orchestration, or delivery;
- quiet-hours evaluation, report/account-deletion operations, observability, or
  notification-provider integration; or
- the mobile Auth, blast, capture, and Sky Window flows.

Do not treat schema presence as proof that these runtime behaviors exist.
