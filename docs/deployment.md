# Deployment runbook

This runbook covers the Supabase backend and Expo mobile application. Deploy to
staging first, complete the release checks, then repeat with production
credentials. Do not use a production project as a staging target.

## Current repository readiness

As of this runbook's creation:

- the root project pins Supabase CLI `2.109.1`;
- the mobile project uses Expo SDK `57`;
- EAS CLI is not installed in the repository, so this runbook pins
  `eas-cli@21.0.2` through `npx`;
- `mobile/eas.json`, EAS project linkage, iOS bundle identifier, and Android
  package name have not been configured;
- Supabase migrations, database tests, and seven Edge Functions exist;
- generated database types live under `packages/database-types`; and
- photo completion intentionally fails closed with
  `MEDIA_PROCESSOR_UNAVAILABLE` until a production media processor is added.

The commands below describe the intended release path. They do not mean the
current scaffold is deployable. Complete each named prerequisite before the
first release.

## Environment model

Use three isolated environments:

- **Local**: local Supabase containers, development-only fixtures, and local
  Expo development builds.
- **Staging**: a hosted Supabase project, Twilio Verify service, Firebase
  project, EAS preview environment, and non-production app identifiers.
- **Production**: separate hosted resources, EAS production environment, and
  store application identifiers.

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
4. Configure Auth redirect/deep-link URLs once the mobile scheme and bundle
   identifiers are final.
5. Confirm the Postgres major version matches `db.major_version = 17` in
   `supabase/config.toml` before the first migration push.
6. Set Edge Function application secrets.
7. Confirm tables exposed through the Data API will use explicit grants and
   RLS. Do not rely on dashboard-created schema.

Schema, policies, database functions, storage policies, and seed-safe reference
data must originate in versioned local migrations. Do not create production
schema manually in the SQL editor.

### 2. Finalize mobile identifiers

Before creating store apps or signing credentials, replace the scaffold values
in `mobile/app.json`:

- set a stable Expo `name`, `slug`, and URL scheme;
- set a unique `ios.bundleIdentifier`, such as the organization's reverse-DNS
  identifier;
- set the matching `android.package`;
- add environment-specific app variants if staging and production will be
  installed side by side.

Bundle identifiers are durable external contracts. Changing them later creates
a different app in Apple and Google systems.

### 3. Link the Expo project and create EAS configuration

From `mobile/`:

```sh
npx eas-cli@21.0.2 login
npx eas-cli@21.0.2 init
npx eas-cli@21.0.2 build:configure
```

Review every generated change. Commit the EAS project ID in app configuration
and commit `eas.json`, but never commit downloaded credentials.

Configure at least `development`, `preview`, and `production` build profiles.
For Expo SDK 55 and later, each profile should select the matching EAS
environment:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview"
    },
    "production": {
      "environment": "production"
    }
  }
}
```

Treat this as the required shape, not a patch to apply blindly. Add platform
versioning and submit profiles only after the Apple and Google application
records exist.

### 4. Configure EAS environment values

Create the staging values in EAS `preview` and production values in EAS
`production`:

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
```

Repeat for production with the production project. Then verify:

```sh
npx eas-cli@21.0.2 env:list --environment preview
npx eas-cli@21.0.2 env:list --environment production
```

The publishable key and URL are public by design. No server secret may use the
`EXPO_PUBLIC_` prefix.

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
- Firebase Android registration and `google-services.json` integration;
- FCM V1 service-account key uploaded to EAS;
- Google Play app record and submission service-account key uploaded to EAS.

Do not reuse production signing or push configuration for an app identifier
that belongs to staging.

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

## Build and distribute the mobile app

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

When deployment is automated, use protected environments with human approval
for production. Required CI secrets are:

- `SUPABASE_ACCESS_TOKEN`;
- environment-specific `SUPABASE_PROJECT_ID`;
- environment-specific `SUPABASE_DB_PASSWORD`;
- `EXPO_TOKEN` for EAS automation.

Provider keys already uploaded to Supabase Auth or EAS should not be copied
again into CI. CI should run local reset/tests first, dry-run migrations, apply
migrations, set only explicitly managed secrets, deploy functions, run hosted
advisors, then trigger EAS builds. Pin the same CLI versions used by this
repository; do not use floating `latest` versions in a production workflow.

## Source documentation

- [Supabase managing environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase Edge Function deployment](https://supabase.com/docs/guides/functions/deploy)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Expo EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [Expo managed credentials](https://docs.expo.dev/app-signing/managed-credentials)
- [Expo iOS submission](https://docs.expo.dev/submit/ios)
- [Expo Android submission](https://docs.expo.dev/submit/android)
