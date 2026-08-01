# Deployment runbook

This runbook covers the Supabase backend and Expo mobile application. Staging
auto-deploys from the `preview` branch; production mobile ships only from a
`vX.Y.Z` tag via `deploy-to-production`. Deploy to staging first, complete the
release checks, then promote. Do not use a production project as a staging
target. See [Branch model and release flow](#branch-model-and-release-flow).

## Current repository readiness

As of this runbook:

- the root project pins Supabase CLI `2.109.1`;
- the mobile project uses Expo SDK `57`;
- EAS CLI is not installed in the repository, so this runbook pins
  `eas-cli@21.0.2` through `npx`;
- `mobile/eas.json` and the locked app identifiers (bundle ID, package name,
  scheme, display name) are configured in-repo for the **preview** and
  **production** profiles only;
- EAS project linkage (`extra.eas.projectId`) still requires a one-time manual
  `eas init` and commit of the resulting project ID;
- Supabase migrations, database tests, and seven Edge Functions exist;
- generated database types live under `packages/database-types`; and
- photo completion intentionally fails closed with
  `MEDIA_PROCESSOR_UNAVAILABLE` until a production media processor is added.

There is no EAS `development` profile. Local work uses Expo locally with
`mobile/.env.local` and local Supabase; it does not go through EAS build
profiles.

## Environment model

Use three isolated environments, mapped to two EAS profiles:

| Environment | Supabase | EAS profile | App identity |
|---|---|---|---|
| **Local** | Local containers + `mobile/.env.local` | None (no EAS profile) | Local Expo run |
| **Staging** | Hosted staging project | `preview` | Preview identifiers |
| **Production** | Hosted production project | `production` | Store identifiers |

- **preview** ↔ staging Supabase (Twilio Verify, Firebase, and CAPTCHA for
  staging).
- **production** ↔ production Supabase (separate Twilio, Firebase, and
  CAPTCHA).

The deployer must know the target's Supabase project reference and must verify
the mobile Supabase URL before starting a build. See
[credentials.md](credentials.md) for every value and retrieval path.

## One-time provider setup

### 1. Create hosted Supabase projects

Create `Sunsight Staging` and `Sunsight Production` in the
[Supabase Dashboard](https://supabase.com/dashboard). For each:

1. Save the project reference and database password.
2. Create/copy a publishable API key for the mobile app.
3. Configure **Authentication > Providers > Phone** with that environment's
   Twilio Verify credentials.
4. Configure Auth redirect/deep-link URLs for the locked schemes:
   - staging Supabase: allow `sunsight-preview://`;
   - production Supabase: allow `sunsight://`.
5. Confirm the Postgres major version matches `db.major_version = 17` in
   `supabase/config.toml` before the first migration push.
6. Set Edge Function application secrets.
7. Confirm tables exposed through the Data API will use explicit grants and
   RLS. Do not rely on dashboard-created schema.

Schema, policies, database functions, storage policies, and seed-safe reference
data must originate in versioned local migrations. Do not create production
schema manually in the SQL editor.

### 2. Locked mobile identifiers

App identifiers are configured in-repo. Do not invent alternatives for the
first release:

| Profile | iOS / Android ID | Scheme | Display name |
|---|---|---|---|
| preview | `com.sunsight.app.preview` | `sunsight-preview` | Sunsight Preview |
| production | `com.sunsight.app` | `sunsight` | Sunsight |

Preview and production install side by side. Bundle identifiers are durable
external contracts. Changing them later creates a different app in Apple and
Google systems.

### 3. Link the Expo project (manual checklist)

`mobile/eas.json` already defines **preview** and **production** only (no EAS
`development` profile). The remaining one-time step is EAS project linkage.

From `mobile/`:

```sh
npx eas-cli@21.0.2 login
npx eas-cli@21.0.2 init
```

Commit the resulting `extra.eas.projectId` in app configuration. Never commit
downloaded signing or push credentials.

Each profile selects the matching EAS environment (`preview` → `preview`,
`production` → `production`). Add platform versioning and submit profiles only
after the Apple and Google application records exist.

### First EAS push

Run once per Expo account / project before the first staging binary:

1. `npx eas-cli@21.0.2 login`
2. `npx eas-cli@21.0.2 init` (from `mobile/`)
3. Commit `extra.eas.projectId` in app configuration
4. Create EAS env vars for `preview` and `production` (see below)
5. Configure iOS and Android credentials (`eas credentials`)
6. `npx eas-cli@21.0.2 build --profile preview`

### 4. Configure EAS environment values

Create the staging values in EAS `preview` and production values in EAS
`production`. Required names:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CAPTCHA_SITE_KEY` when the mobile CAPTCHA challenge is used

```sh
cd mobile

npx eas-cli@21.0.2 env:create \
  --environment preview \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value 'https://<staging-project-ref>.supabase.co' \
  --visibility plaintext

npx eas-cli@21.0.2 env:create \
  --environment preview \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value '<staging-anon-key>' \
  --visibility plaintext

npx eas-cli@21.0.2 env:create \
  --environment preview \
  --name EXPO_PUBLIC_CAPTCHA_SITE_KEY \
  --value '<staging-captcha-site-key>' \
  --visibility plaintext
```

Repeat for production with the production project and
`--environment production`. Then verify:

```sh
npx eas-cli@21.0.2 env:list --environment preview
npx eas-cli@21.0.2 env:list --environment production
```

The publishable key, URL, and CAPTCHA site key are public by design. No server
secret may use the `EXPO_PUBLIC_` prefix. Local development continues to read
the same names from `mobile/.env.local` against local Supabase.

### 5. Configure signing, push, and submission credentials

Use EAS remote credential management:

```sh
cd mobile
npx eas-cli@21.0.2 credentials --platform ios
npx eas-cli@21.0.2 credentials --platform android
```

Complete the provider work in [credentials.md](credentials.md):

- Apple distribution certificate, provisioning profile, and APNs key;
- App Store Connect app record and API key for non-interactive submission;
- Firebase Android registration for **both** package names
  (`com.sunsight.app.preview` and `com.sunsight.app`) and
  `google-services.json` integration;
- FCM V1 service-account key uploaded to EAS;
- Google Play app record and submission service-account key uploaded to EAS.

Do not reuse production signing or push configuration for an app identifier
that belongs to staging (preview).

## Local release verification

Run from the repository root unless a command changes directories.

### Install locked dependencies

```sh
npm ci
(cd mobile && npm ci)
```

### Rebuild the local backend

Docker must be running:

```sh
npm run supabase:start
npm run supabase:reset
```

`supabase db reset` must succeed from an empty local database. It is the proof
that migration history, not an unrecorded dashboard change, can reproduce the
schema.

Generate database types after the canonical
`packages/database-types/src/` path has been created:

```sh
npm run types:gen
```

The generated file must have no unexpected diff. A schema change and its
generated types belong in the same release.

### Run available checks

Run the implemented database suites, schema lint, and mobile checks:

```sh
npx supabase test db supabase/tests/database --local
npx supabase test db supabase/tests/foundation_test.sql --local
npx supabase db lint --local --schema public --level error --fail-on error
(cd mobile && npm run lint && npx tsc --noEmit)
```

Edge Function, mobile integration, and device suites have not been added. A
production release must eventually cover denied permissions, upload retry,
notification deep links, signed URL expiry, and delivery-worker behavior.

Run local database advisors with the pinned Supabase CLI:

```sh
npx supabase db advisors \
  --local \
  --type all \
  --level warn \
  --fail-on error
```

Resolve every security error before deployment. Review warnings rather than
automatically suppressing them.

## Deploy the Supabase backend

The following sequence is run once for staging and, only after acceptance, once
for production.

### 1. Authenticate and identify the target

For an interactive workstation:

```sh
npx supabase login
```

For CI, set `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and
`SUPABASE_DB_PASSWORD` in the CI provider's encrypted secret store. Do not echo
them. Check the target explicitly:

```sh
export SUPABASE_PROJECT_ID='<target-project-ref>'
npx supabase link \
  --project-ref "$SUPABASE_PROJECT_ID" \
  --password "$SUPABASE_DB_PASSWORD"
```

Linking writes local project state under ignored `supabase/.temp/`. Never infer
the target from an old link without checking the project reference.

### 2. Compare and dry-run migrations

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Read the complete dry-run. Stop if it targets the wrong project, includes an
unexpected migration, drops or rewrites data without an approved migration
plan, or requires a missing secret/configuration dependency.

### 3. Apply migrations

```sh
npx supabase db push --linked
npx supabase migration list --linked
```

Do not use `--include-seed` for production unless the seed file has been
explicitly reviewed as safe, repeatable production reference data. The current
`supabase/seed.sql` is intended for local fixtures.

### 4. Provision the database Vault secret

The profile finalizer reads the database Vault secret named
`PHONE_HMAC_SECRET`, and `match-contacts` reads an Edge Function secret with the
same name. Provision the same version 1 value in both stores for the target
environment. Also provision a distinct `DISPATCH_WORKER_SECRET` of at least 32
random bytes for `dispatch-notifications` and its server-side invoker.

Keep all values in the password manager and out of command lines, shell
history, logs, migrations, seed data, and mobile configuration. Follow the
versioned rotation procedure in [schema-operations.md](schema-operations.md)
before changing an active HMAC key.

Updated hosted secrets are available to functions without a redeploy, but a
deployment is still required when function code changed.

### 5. Deploy Edge Functions

After function source exists and local function tests pass:

```sh
npx supabase functions deploy \
  --project-ref "$SUPABASE_PROJECT_ID"

npx supabase functions list \
  --project-ref "$SUPABASE_PROJECT_ID"
```

Authenticated Sunsight functions retain JWT verification. The implemented
`dispatch-notifications` function is the only exception configured with
`verify_jwt = false`; it requires `x-worker-secret` matching
`DISPATCH_WORKER_SECRET`. Do not disable JWT verification for other functions
as a deployment workaround.

The `complete-photo-upload` Edge Function authenticates the sender but uses its
server-side service-role client for the final `complete_photo_blast` RPC.
Database execute permission for that RPC belongs only to `service_role`; do not
grant it to authenticated users. Until a processor can strip metadata and
create bounded derivatives, the Edge Function must continue to fail closed with
`MEDIA_PROCESSOR_UNAVAILABLE` before invoking the RPC.

### 6. Run hosted checks

```sh
npx supabase db advisors \
  --linked \
  --type all \
  --level warn \
  --fail-on error
```

Also open the project's **Database > Advisors** and review security and
performance findings. Then verify:

- Auth can send and verify an OTP using the target Twilio Verify service;
- an authenticated caller can invoke each intended Edge Function;
- an unauthenticated or unauthorized caller is rejected;
- all exposed tables have RLS and least-privilege grants;
- the sunset media bucket is private;
- signed media access fails for non-recipients and expired blasts;
- blast creation requires a valid IANA timezone and server-side expiry is the
  earliest of local midnight, configured visibility, and any shorter client
  hint;
- device registration rejects an Expo push token already owned by another
  user;
- an abandoned notification claim is reclaimable after the five-minute lock
  TTL, including queued delivery rows with a null retry time;
- secret, phone, coordinate, push-token, and signed-URL values do not appear in
  logs;
- queues/outbox processing and provider receipts are healthy.

Do not proceed to the mobile production build if backend verification fails.

## Branch model and release flow

Sunsight uses three long-lived git branches. The default bookkeeping branch is
`master` (not `main`).

| Branch | Role |
|---|---|
| `local` | Day-to-day development. Feature work lands here first. |
| `preview` | Staging auto-deploy branch. Push or merge here triggers staging Supabase deploy and EAS preview delivery. |
| `master` | Bookkeeping / default branch. Receives the tagged production commit via `deploy-to-production` after a successful production deploy. Does **not** auto-deploy staging or production. |

### Flow

1. Develop and open PRs against `local`.
2. Merge `local` into `preview` when ready for staging.
3. Push to `preview` auto-deploys:
   - Supabase staging (GitHub Environment `staging`);
   - EAS preview delivery (defaults to **OTA**; see [OTA vs binary](#ota-vs-binary)).
4. After a successful preview deploy, CI creates (or reuses) annotated tag
   `vX.Y.Z` on the deployed SHA, then patch-bumps the marketing version in
   `mobile/app.config.ts` and `mobile/package.json`, commits that bump to
   `local`, and fast-forwards `preview` to match. Bumps are **patch only**
   (`X.Y.Z` → `X.Y.(Z+1)`). The tip of `preview` after the bump is **ahead**
   of the release tag.
5. Production mobile release is **only** via an existing preview-created tag
   plus the `deploy-to-production` workflow (`workflow_dispatch`). Production
   is never triggered by a push to `master` or `preview`.
6. After production succeeds, `deploy-to-production` merges the **tagged**
   commit into `master` for bookkeeping (not the post-bump `preview` tip).

### Production tags

Tag format is `vX.Y.Z`, where `X.Y.Z` matches the `version` field in
`mobile/app.config.ts` at the tagged commit. Example: if app config says
`1.2.3`, the release tag is `v1.2.3`.

**Preview CI owns tag creation** for each marketing version on the SHA that
was staged. Do **not** mint a new tag on the post-bump tip of `preview` /
`local`. To ship production, pick the existing tag that corresponds to the
accepted staging deploy, then run `deploy-to-production` with:

- `delivery`: `ota` or `binary`;
- `submit_to_stores`: optional, only meaningful with `delivery=binary`.

#### Sticky-tag recovery

If the post-deploy version bump fails after the tag was created, the next
preview push at a new SHA will fail because `vX.Y.Z` already points at the
old SHA. Recover by either:

1. Completing the intended bump: run `npm run version:bump-patch --prefix mobile`
   on `local`, commit `chore: bump app version to …`, push `local`, and
   fast-forward `preview`; or
2. Only with care, deleting and recreating the tag on the correct SHA (avoid
   if anyone already consumed that tag).

Do not create a second tag for the same marketing version on a different SHA.

### runtimeVersion and OTA compatibility

The app uses EAS `runtimeVersion` with the **fingerprint** policy, and
`mobile/fingerprint.config.js` skips marketing version fields
(`ExpoConfigVersions`) so CI patch bumps do not invalidate OTA against
existing binaries. An OTA update remains compatible until the native
fingerprint changes (native modules, SDK, or other fingerprint inputs). When
the fingerprint changes, ship a new **binary** before relying on further OTAs.

## OTA vs binary

| Situation | Delivery | How |
|---|---|---|
| Routine JS/TS or asset change on staging | OTA | Push to `preview` (default) |
| Staging needs a new native binary (fingerprint change, first install, credentials) | Binary | `workflow_dispatch` on the preview/EAS workflow with `delivery=binary` |
| Production JS/TS or asset change, fingerprint unchanged | OTA | Tag `vX.Y.Z` + `deploy-to-production` with `delivery=ota` |
| Production native change, store build, or first production binary | Binary | Tag `vX.Y.Z` + `deploy-to-production` with `delivery=binary` |
| Ship the binary to App Store / Play | Binary + submit | Same as above with `submit_to_stores` enabled |

Push notifications and store-signed installs still require a binary on device.
OTA cannot replace the first install or a fingerprint-incompatible native
change.

## Build and distribute the mobile app

Prefer the CI paths above for staging and production. The commands below remain
valid for one-off interactive builds (for example credential bootstrapping).

### Staging/preview

Before building, confirm the preview environment shows the staging Supabase
URL:

```sh
cd mobile
npx eas-cli@21.0.2 env:list --environment preview
npx eas-cli@21.0.2 build --profile preview --platform all
```

Install the resulting builds on physical iOS and Android devices. Push
notifications are not adequately verified in a web build or simulator-only
flow. Test at minimum:

- CAPTCHA-protected SMS OTP registration and returning login;
- CAPTCHA rejection, OTP resend cooldown, wrong/expired OTP, and persisted
  session restoration;
- contacts, location, camera, photos, and notification permission denial;
- Look up without opening the camera;
- Capture review/retake before send, with completion currently expected to
  return `MEDIA_PROCESSOR_UNAVAILABLE`;
- cooldown shared across Look up and Capture;
- text push fallback and notification deep link to the Sky Window;
- nudge access by an eligible recipient; photo recipient access remains blocked
  until the media processor is implemented;
- unauthorized and expired Sky Window states;
- offline capture and retry under the same idempotency key;
- no received image written to the shared photo gallery.

### Production build

Confirm the production environment contains the production URL and publishable
key, then freeze the release commit and build:

```sh
cd mobile
npx eas-cli@21.0.2 env:list --environment production
npx eas-cli@21.0.2 build \
  --profile production \
  --platform all \
  --freeze-credentials
```

`--freeze-credentials` prevents a non-interactive build from silently creating
or changing credentials. If the build reports missing credentials, configure
them deliberately with `eas credentials`, then rerun.

Record the release commit, EAS build URLs/IDs, app versions/build numbers,
Supabase migration version, and approver in the release log. Do not record
credential values.

## Submit to app stores

### iOS

After the production iOS build completes:

```sh
cd mobile
npx eas-cli@21.0.2 submit \
  --platform ios \
  --profile production \
  --latest
```

EAS uploads the build to App Store Connect. It does not complete Apple's review
or release controls. In App Store Connect:

1. Wait for processing and inspect compliance warnings.
2. Distribute to internal TestFlight testers first.
3. Complete privacy labels, export compliance, age rating, screenshots, and
   review information.
4. Attach the verified build to the release.
5. Select manual or phased release according to the release decision.

### Android

After the production Android build completes:

```sh
cd mobile
npx eas-cli@21.0.2 submit \
  --platform android \
  --profile production \
  --latest
```

For a new Google Play app, complete the app record and any required first
manual upload/account setup before expecting API submission to work. Start on
the internal testing track. Complete the Data safety form, content rating,
privacy policy, store listing, testing requirements, and review tasks before
promotion. Use staged rollout for production once the app has enough users to
make staged monitoring meaningful.

## Post-deployment checks

Immediately after backend or mobile rollout:

1. Run a production smoke test with designated test accounts and numbers.
2. Confirm nudge creation and dispatch succeed. Confirm photo upload completion
   fails closed with `MEDIA_PROCESSOR_UNAVAILABLE` and does not dispatch or
   expose the original.
3. Confirm recipient selection, queue depth, dispatch latency, push acceptance,
   invalid-token rate, Sky Window opens, and expiry behavior.
4. Inspect Supabase Auth, Edge Function, Postgres, Twilio Verify, Expo push,
   Firebase, and store dashboards for errors.
5. Verify logs contain opaque request IDs but no phone numbers, contact lists,
   exact coordinates, push tokens, media URLs, or secrets.
6. Confirm expired and abandoned media is eligible for the retention job.
7. Keep the prior store version available for rollback while monitoring the
   new release.

Push acceptance is not proof of delivery. Test opening the notification on real
devices.

## Rollback

### Mobile

- Stop or pause the store rollout in App Store Connect or Google Play.
- Re-submit/promote the last known-good binary if store policy permits.
- Correct server behavior compatibly because already-installed mobile builds
  cannot be recalled.
- Never rotate public Supabase configuration merely to roll back an app; old
  builds will retain values compiled at build time.

### Edge Functions

- Redeploy the last known-good function source from its immutable release
  commit.
- Preserve request and response compatibility with installed app versions.
- If a secret rotation caused the failure, restore access using overlapping
  old/new secret versions when safe; do not print either value.

### Database

- Prefer a forward corrective migration. Supabase migration history is
  append-only after it has been shared.
- Do not edit an applied migration, run a destructive reset, or delete
  production data to make migration history match.
- For a destructive migration, follow the separately approved backup/restore
  and data-recovery plan. A code rollback cannot undo data loss.

### Twilio, push, or store credentials

- Restore a still-valid previous credential only if it was not compromised.
- Otherwise create a replacement at the provider, update Supabase or EAS, and
  verify delivery before revoking the broken credential.
- Remember that deleting a credential from EAS may not revoke it at Apple,
  Google, or Twilio.

## CI adoption

CI covers merge gates, Supabase deploys, and EAS preview/production delivery.
Use the pinned CLIs (`supabase@2.109.1` via root `npx supabase`,
`eas-cli@21.0.2` via `npx`). Do not use floating `latest` versions.

### Merge gates

Gates run on pull requests and on pushes to **`preview`**, plus
`workflow_dispatch` on the CI workflow (must target the `preview` branch for
deploy jobs). Direct pushes to `local` or `master` do **not** run gates unless
opened as a PR.

- mobile lint / typecheck / expo-doctor / unit tests with coverage;
- database-types typecheck;
- Edge Function `deno check` + `deno test`;
- local Supabase reset, database tests, generated-type drift, and blocking
  local advisors.

### Staging auto-deploy (`preview` only)

After gates pass on a push to **`preview`** (or `workflow_dispatch` while
checked out on `preview`):

1. Create or reuse annotated tag `vX.Y.Z` on the deployed SHA.
2. Deploy Supabase to staging (GitHub Environment `staging`).
3. Deliver the mobile app to EAS preview (Environment `staging`). Default
   delivery is **OTA**.
4. For a staging **binary**, run CI via `workflow_dispatch` on the `preview`
   branch with `delivery=binary` (dispatch from another branch is rejected).
5. On success, patch-bump `mobile/app.config.ts` and `mobile/package.json`,
   commit to `local`, and fast-forward `preview`.

`master` is bookkeeping only. Pushing to `master` does **not** auto-deploy
staging or production.

### Production deploy (tag + `deploy-to-production`)

Production is never auto-deployed from a branch push. Operators:

1. Identify the preview-created tag `vX.Y.Z` for the accepted staging SHA
   (do not create a new tag on the post-bump tip).
2. Run `deploy-to-production` (`workflow_dispatch`) against that tag with
   `delivery=ota` or `delivery=binary`, and optional `submit_to_stores`.
3. Use GitHub Environment `production` (configure required reviewers in repo
   settings).
4. On success, the workflow merges the tagged commit into `master` for
   bookkeeping.

Staging redeploys use the CI workflow on `preview` (`push` or
`workflow_dispatch` with `delivery`). Production Supabase and EAS ship only
through `deploy-to-production`.

### GitHub Environment and repository secrets checklist

Create Environments **`staging`** and **`production`**. Put the same secret
names on each environment with environment-specific values:

| Secret | Where | Purpose |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Environment (or one repo-level token if both projects share an account) | Supabase CLI / Management API (`link` / `db push` / secrets / functions / advisors) |
| `SUPABASE_PROJECT_ID` | Environment | Target project reference ID |
| `SUPABASE_DB_PASSWORD` | Environment | Database password for `supabase link` / `db push` |
| `PHONE_HMAC_SECRET` | Environment | Edge Function secret (≥32 random bytes per environment) |
| `DISPATCH_WORKER_SECRET` | Environment | Edge Function secret for `dispatch-notifications` (≥32 random bytes per environment) |
| `EXPO_TOKEN` | Repository or shared secret used by EAS jobs | Expo personal access token for non-interactive `eas-cli@21.0.2` in CI |

Do **not** put service-role keys, anon keys, or Twilio/CAPTCHA Auth dashboard
secrets into these workflows. The Supabase deploy job upserts only
`PHONE_HMAC_SECRET` and `DISPATCH_WORKER_SECRET` via
`npx supabase secrets set --env-file` (file is never echoed). Migrations never
use `--include-seed`. Functions deploy with `--use-api`.

### Outside GitHub (manual, one-time)

These are not GitHub secrets but must exist before EAS CI is useful:

- `npx eas-cli@21.0.2 init` from `mobile/` and commit `extra.eas.projectId`
  (do not invent a UUID; use the ID returned by Expo);
- EAS environment variables for `preview` and `production` (see
  [Configure EAS environment values](#4-configure-eas-environment-values));
- EAS iOS/Android signing and push credentials (`eas credentials`);
- App Store Connect / Google Play submission keys when using
  `submit_to_stores`.

Details and retrieval paths: [credentials.md](credentials.md).

### GitHub Actions permissions

Workflows that post-preview patch-bump and fast-forward branches, or that
create release tags on preview deploy, need write access beyond the default
`contents: read` used by gate-only jobs:

- permission to push commits to `local` and to fast-forward `preview`;
- permission to create annotated tags `vX.Y.Z` on preview deploy;
- permission to merge or push bookkeeping updates to `master` from
  `deploy-to-production`.

Use a fine-scoped GitHub App or `GITHUB_TOKEN` with the minimum contents write
needed for those branches and tags. Do not grant broader org admin tokens.

### One-time hosted prerequisites (not every CI run)

Before the first useful staging or production deploy, configure in the
Supabase dashboard / Vault for that project:

- Twilio Verify (Account SID, Auth Token, Verify Service SID) for hosted Auth
  SMS OTP;
- CAPTCHA provider secret for Auth bot protection;
- Database Vault secret named `PHONE_HMAC_SECRET` with the **same value** as
  the Edge `PHONE_HMAC_SECRET` (required by `finalize_verified_profile`);
- Private sunset media bucket and Auth redirect/deep-link settings
  (`sunsight-preview://` on staging, `sunsight://` on production) as
  documented elsewhere in this runbook.

Staging and production must each use their own Twilio Verify service, HMAC,
and worker secret. Never share production values with staging.

## Source documentation

- [Supabase managing environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase Edge Function deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Expo EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [Expo managed credentials](https://docs.expo.dev/app-signing/managed-credentials)
- [Expo iOS submission](https://docs.expo.dev/submit/ios)
- [Expo Android submission](https://docs.expo.dev/submit/android)
