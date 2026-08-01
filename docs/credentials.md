# Credentials and secrets

This guide is the credential inventory for Sunsight. It records where each
value comes from and where it belongs. Never add a real credential to this
file, an issue, a pull request, chat, logs, screenshots, or source control.

Sunsight must use separate Supabase, Expo/EAS, Twilio, Firebase/Google, and
store resources for staging and production. A staging build must never contain
production values.

## Storage rules

- Public mobile configuration may be stored as EAS environment variables with
  `plaintext` visibility. Anything prefixed `EXPO_PUBLIC_` is compiled into the
  app and must be treated as public.
- Edge Function secrets belong in Supabase Edge Function secrets.
- Supabase Auth SMS credentials belong in the hosted project's Auth provider
  configuration, not in the mobile app.
- App-signing, push, and store-submission credentials should be remotely
  managed by EAS unless the team deliberately adopts local credential
  management.
- CI credentials belong in the CI provider's encrypted secret store.
- Local secrets belong in ignored files such as `mobile/.env.local` or
  `supabase/functions/.env`. The root `.gitignore` ignores `.env` and `.env.*`
  files except examples.
- Downloaded JSON keys, Apple `.p8` keys, certificates, and provisioning
  profiles should be saved outside the repository. A file being ignored is not
  a substitute for secure storage.

Keep the authoritative copy in the team's password manager. Record the owner,
environment, creation date, last rotation date, and dependent services there.

## Supabase project values

Create one hosted project for staging and another for production in the
[Supabase Dashboard](https://supabase.com/dashboard). Select the correct project
before copying any value.

### Project URL

Use as `EXPO_PUBLIC_SUPABASE_URL`.

1. Open the project in the Supabase Dashboard.
2. Open **Project Settings > Data API**, or click **Connect** and select an API
   client connection.
3. Copy the project URL, which has the form
   `https://<project-ref>.supabase.co`.

The URL is public. Its embedded project reference identifies the environment,
so verify it before every mobile build.

### Mobile anon API key

The current mobile client reads the exact name
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. Use the environment's client-safe anon key.

1. Open **Project Settings > API Keys**.
2. Copy the legacy `anon` key used by the current mobile integration.
3. Put it in the matching EAS environment and local mobile environment.

The anon key is intended for public clients. It does not make database access
safe by itself; every exposed table still requires least-privilege grants and
Row Level Security. A later migration to Supabase publishable keys must update
the mobile source and environment name together; do not set an unused
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and assume the app will read it.

### Secret API key and legacy service-role key

These values are elevated server credentials that bypass Row Level Security.
They must never appear in:

- `EXPO_PUBLIC_*` variables;
- `mobile/`, `app.config.ts`, or a built app;
- client-visible errors, analytics, or logs.

If a backend process outside Supabase needs an administrative credential:

1. Open **Project Settings > API Keys**.
2. Create a narrowly named `sb_secret_...` key under **Secret keys**.
3. Store it only in that backend's secret manager.

The legacy `service_role` JWT is visible in the same area for compatibility.
Prefer a new secret key where the integration supports it. Edge Functions
already receive project credentials as platform-provided environment values;
do not create another copy unless the implementation specifically requires it.

### Project reference

Use as `SUPABASE_PROJECT_ID` or as the `--project-ref` value during deployment.
It is an identifier, not a secret.

Retrieve it from any of these places:

- **Project Settings > General**, under the project reference/ID;
- the project URL between `https://` and `.supabase.co`;
- the dashboard URL after `/project/`.

Always label saved references with `staging` or `production`; the strings are
otherwise easy to confuse.

### Personal access token

Use as `SUPABASE_ACCESS_TOKEN` for non-interactive Supabase CLI or Management
API access.

1. Open [Supabase account access tokens](https://supabase.com/dashboard/account/tokens).
2. Select **Generate new token**.
3. Give it a purpose-specific name such as `sunsight-deploy-production`.
4. Copy it immediately into the password manager and CI secret store.

The token acts with the permissions of its owner. Do not use one developer's
general-purpose token as a permanent production credential. Revoke tokens from
the same account page when a person leaves, a workflow is retired, or exposure
is suspected.

### Database password

Use only for operations that connect to hosted Postgres, including linking or
pushing migrations when the CLI requests it. Store separate
`STAGING_DB_PASSWORD` and `PRODUCTION_DB_PASSWORD` values in CI.

The initial password is chosen when the project is created. Supabase does not
allow an existing password to be retrieved later:

1. Open **Project Settings > Database**.
2. If the password is unknown, select **Reset database password**.
3. Save the replacement in the password manager and update every deployment or
   direct-database integration that uses it.
4. Allow a few minutes for a reset to propagate before diagnosing connection
   failures.

Copy a connection string from the project's **Connect** dialog, but do not
commit a connection string containing the password. Prefer the session pooler
for general hosted clients unless a documented operation requires a direct
connection.

### Verified-phone and contact HMAC key

The implemented database profile finalizer reads a Vault secret by the exact
name `PHONE_HMAC_SECRET`. The implemented `match-contacts` Edge Function reads
an Edge Function environment value with the same exact name. These two stores
must contain the same version 1 key within one environment. Generate a distinct
high-entropy value for local, staging, and production, keep the authoritative
value only in the password manager, provision it in Vault through the Dashboard
or a trusted SQL session using `vault.create_secret`, and set it as an Edge
Function secret for contact matching.

Do not put the value in migrations, seed data, CLI arguments, shell history,
logs, chat, or mobile configuration. The migration intentionally does not
provision it. Profile finalization fails closed if the named secret is absent or
shorter than 32 bytes.

Rotation is a versioned data migration: provision a new named/versioned secret,
deploy matching support for both HMAC versions, backfill and verify the new
identifiers, then retire the old secret. Never overwrite
`PHONE_HMAC_SECRET` in place while version 1 identifiers remain.

### Dispatch worker authentication

`dispatch-notifications` reads `DISPATCH_WORKER_SECRET` and requires the same
value in the `x-worker-secret` request header. Generate at least 32 random bytes
per environment. Store it in `supabase/functions/.env.local` only for local
development and as a Supabase Edge Function secret for staging/production.
Keep the invoker's copy in its server-side scheduler or worker secret store.
It is never client-safe.

The Edge runtime also supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. Function source uses the anon key for
caller-scoped RLS requests and the service-role key only for server-authorized
operations. Never manually expose the service-role value or copy it into mobile
configuration.

## Twilio Verify for phone ownership

Sunsight uses passwordless OTP through Supabase Auth with Twilio Verify as the
SMS provider. Both registration and signed-out sign-in call
`signInWithOtp`, then `verifyOtp` with type `sms`. A valid persisted session
restores through refresh without another OTP. Configure each hosted project
separately.

### Twilio Account SID and Auth Token

1. Sign in to the [Twilio Console](https://console.twilio.com/).
2. Open **Admin > Account management > API keys & tokens**, or
   **Settings > Account settings > API keys & auth tokens**.
3. Copy the Account SID, which starts with `AC`.
4. Reveal and copy the primary Auth Token only into the password manager and
   the Supabase Auth provider form.

Twilio recommends API keys for production code that calls Twilio directly.
Create those from the same page and copy the API key secret when it is first
shown. However, do not substitute an API key secret for the Auth Token in
Supabase's Twilio provider form unless the current Supabase form explicitly
supports that credential type.

### Verify Service SID

1. Open [Twilio Console > Verify > Services](https://console.twilio.com/us1/develop/verify/services).
2. Create a service named for the environment, for example
   `Sunsight Staging`, or open the existing service.
3. Copy the Service SID from the service overview. A Verify Service SID starts
   with `VA`.

Do not share one Verify Service between staging and production. Separate
services isolate templates, rate limits, test traffic, logs, and incident
response.

### Configure the hosted Supabase project

1. Open the target Supabase project.
2. Go to **Authentication > Providers > Phone**.
3. Enable phone signup and choose **Twilio Verify** as the SMS provider.
4. Enter the Twilio Account SID, Auth Token, and Verify Service SID in the
   fields shown by the dashboard. Supabase documentation/configuration may
   label the last field `Message Service SID`; for the `twilio_verify`
   provider, use the Verify Service SID requested by that provider, not an
   unrelated Messaging Service.
5. Set OTP expiry, resend frequency, and rate limits appropriate to the
   environment.
6. Enable the environment's CAPTCHA provider as described below.
7. Save and test registration, returning login, resend, and rejected challenge
   behavior with an approved test number before external use.

For local Supabase, use the `auth.sms.twilio_verify` provider in
`supabase/config.toml` and reference the Auth Token through environment
substitution. The CLI resolves those `env(...)` names from a `.env` file at the
repository root (`cp .env.example .env`), not from `supabase/.env`. Never write
the token directly into tracked TOML. The current
local configuration enables phone signup and Twilio Verify and includes a
fictional fixed OTP for local testing. Hosted environments must not copy that
test mapping.

Local setup, smoke verification (`npm run auth:smoke`), and hosted live-SMS
checks are documented in [auth.md — Local Auth and Hosted SMS verification](auth.md#local-auth).

The tracked local configuration reads these exact environment names:

- `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
- `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
- `SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID`

The first is an `AC` account identifier. The last must be a `VA` Verify Service
identifier, not an `MG` Messaging Service identifier. Keep all values out of
this document and source control.

## CAPTCHA for OTP send

Supabase Auth supports hCaptcha and Cloudflare Turnstile. Select one provider
for Sunsight before implementing the mobile challenge, and create separate
resources for staging and production.

The integration has two credential classes:

- **Site/public key:** identifies the CAPTCHA widget or challenge surface. It
  may be included in the matching mobile environment, but it is not shared
  across staging and production.
- **Secret key:** lets Supabase verify challenge tokens. Store it only in the
  hosted project's Auth CAPTCHA configuration and the password manager. Never
  prefix it with `EXPO_PUBLIC_` or put it in the app.

For each hosted Supabase project:

1. Create or select the matching site in the CAPTCHA provider dashboard.
2. Record the site/public key and secret key in the password manager with an
   environment label.
3. Open the Supabase Dashboard Auth CAPTCHA settings.
4. Enable the selected provider and enter its secret key.
5. Configure the mobile environment with only the site/public key as
   `EXPO_PUBLIC_CAPTCHA_SITE_KEY` (EAS `preview` / `production`, or
   `mobile/.env.local` for local).
6. Verify that a missing, expired, invalid, or replayed token prevents the OTP
   SMS from being sent.
7. Verify that a resend requires both the cooldown and a fresh challenge token.

The installed Supabase client accepts the completed challenge token as
`signInWithOtp`'s `options.captchaToken`. Protect every OTP-send request,
including resends. Tokens are short-lived request data: never persist or log
them. CAPTCHA does not replace Supabase Auth rate limits, Twilio spend controls,
or verification-attempt limits.

## Expo and EAS

The repository uses Expo SDK 57. `mobile/eas.json` is configured in-repo with
**preview** and **production** profiles only (no EAS `development` profile).
Local development uses `mobile/.env.local` against local Supabase and does not
require an EAS profile. EAS project linkage (`extra.eas.projectId`) still
requires a one-time manual `eas init`; see the First EAS push checklist in
[deployment.md](deployment.md).

### Locked app identifiers

| Profile | iOS / Android ID | Scheme | Display name |
|---|---|---|---|
| preview | `com.sunsight.app.preview` | `sunsight-preview` | Sunsight Preview |
| production | `com.sunsight.app` | `sunsight` | Sunsight |

Environment mapping:

- **preview** ↔ staging Supabase (Auth redirects allow `sunsight-preview://`)
- **production** ↔ production Supabase (Auth redirects allow `sunsight://`)

### EAS project ID

The EAS project ID is a UUID used to associate builds and Expo push tokens with
the project. It is not a secret.

1. Sign in at [expo.dev](https://expo.dev/).
2. From `mobile/`, initialize/link the project with the pinned CLI command
   documented in [deployment.md](deployment.md):
   `npx eas-cli@21.0.2 init`.
3. Retrieve the ID from **Project settings**, or from
   `expo.extra.eas.projectId` after initialization updates the app config.
4. Commit the project ID; never commit downloaded credentials.

### Expo personal access token

Use as `EXPO_TOKEN` only in CI or other non-interactive automation.

1. Open [Expo access tokens](https://expo.dev/settings/access-tokens).
2. Under **Personal access tokens**, select **Create token**.
3. Name it for the workflow and environment.
4. Copy it into the CI secret store.

The token can act on resources available to its owner. Revoke it from the same
page if compromised. Interactive developer machines should normally use
`eas login` rather than persist an access token.

### EAS mobile environment variables

Create these for each EAS environment (`preview` and `production`) after the
EAS project exists:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CAPTCHA_SITE_KEY` when the mobile CAPTCHA challenge is used

```sh
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

Repeat with production values and `--environment production`. Inspect names
and visibility with:

```sh
npx eas-cli@21.0.2 env:list --environment preview
npx eas-cli@21.0.2 env:list --environment production
```

These values are intentionally public, but they must still point to the correct
environment. Never create an `EXPO_PUBLIC_` variable for a secret key, service
role, database password, Twilio token, contact HMAC key, or store credential.

## Environment inventory

Local development uses three ignored files with separate responsibilities:

- root `.env`: the three `SUPABASE_AUTH_SMS_TWILIO_*` substitutions used by
  `supabase/config.toml`;
- `supabase/functions/.env.local`: `PHONE_HMAC_SECRET` and
  `DISPATCH_WORKER_SECRET`;
- `mobile/.env.local`: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_CAPTCHA_SITE_KEY` when
  used locally against a CAPTCHA-enabled Auth setup.

For staging and production, configure each environment independently:

- mobile/EAS plaintext (`preview` ↔ staging, `production` ↔ production):
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
  `EXPO_PUBLIC_CAPTCHA_SITE_KEY` when used;
- Supabase Edge Function secrets: `PHONE_HMAC_SECRET`,
  `DISPATCH_WORKER_SECRET`;
- Supabase Vault: `PHONE_HMAC_SECRET`, with the same versioned value as the
  Edge secret in that environment;
- Supabase Auth provider settings: Twilio Account SID, Twilio Auth Token,
  Twilio Verify Service SID, and the CAPTCHA secret; Auth redirects allow
  `sunsight-preview://` on staging and `sunsight://` on production;
- EAS-managed push credentials: Apple APNs key for iOS and Firebase FCM V1
  service-account key for Android;
- CI/server-only stores as needed: `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, and `EXPO_TOKEN`.

Only the `EXPO_PUBLIC_*` mobile values and project identifiers are
client-safe. An anon key is public configuration constrained by RLS, not an
administrative secret. Every other credential listed above is server-only.

## Apple credentials

An active Apple Developer Program membership is required for iOS device and
App Store builds. Prefer EAS-managed credentials:

```sh
npx eas-cli@21.0.2 credentials --platform ios
```

EAS can generate and retain the distribution certificate, provisioning
profile, and Apple Push Notification service key after an authorized Apple
team member signs in. Inspect them in the Expo project under
**Project settings > Configuration > Credentials**.

If credentials must be created manually:

- App identifier: [Apple Developer > Certificates, Identifiers & Profiles > Identifiers](https://developer.apple.com/account/resources/identifiers/list).
- Distribution certificate: **Certificates, Identifiers & Profiles >
  Certificates**.
- APNs key: **Certificates, Identifiers & Profiles > Keys**; enable Apple Push
  Notifications service and download the `.p8` file when Apple first presents
  it. Record its Key ID and the Apple Team ID.
- App Store Connect API key: [App Store Connect > Users and Access > Integrations > Team Keys](https://appstoreconnect.apple.com/access/integrations/api).
  Record the Issuer ID and Key ID and download the `.p8` file when created.
- App Store Connect numeric app ID (`ascAppId`): open the app in
  **App Store Connect > Apps > App Information** and copy the Apple ID.

Apple limits APNs keys per developer account. Revoking a shared APNs key stops
push delivery for every app using it. Removing a key from EAS does not
necessarily revoke it at Apple; verify both systems during rotation.

## Firebase, FCM, and Google Play

Use separate Firebase projects for staging and production. Register **both**
Android package names in the matching Firebase project for that environment
(or register each package on the project that will deliver its pushes):

- `com.sunsight.app.preview` (EAS `preview` / staging)
- `com.sunsight.app` (EAS `production`)

### Firebase Android configuration

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Create/select the environment's project.
3. Open **Project settings > General > Your apps**.
4. Register each Android application using the exact package name above.
5. Download `google-services.json` for each registered app as needed by the
   build profile.

The config file contains identifiers used by the client and is not equivalent
to a service-account private key, but keep the downloaded file out of the
repository until the app's environment/file strategy is implemented.

### FCM V1 service-account key for push

1. In Firebase, open **Project settings > Service accounts**.
2. Select **Generate new private key** and confirm.
3. Save the downloaded JSON outside the repository and in the password
   manager's secure file storage.
4. Upload it with:

```sh
npx eas-cli@21.0.2 credentials --platform android
```

Choose the production profile, **Google Service Account**, and **Manage your
Google Service Account Key for Push Notifications (FCM V1)**. It can also be
uploaded at **Expo project > Credentials > Android application identifier >
Service Credentials > FCM V1 service account key**.

### Google Play submission service account

EAS Submit also requires a Google service-account JSON key authorized in
Google Play Console. Follow Expo's current
[Google Play submission guide](https://docs.expo.dev/submit/android/) because
Google's account-linking and permission screens change.

After creating and granting the service account access to the Sunsight app,
upload its JSON at **Expo project > Credentials > Android application
identifier > Service Credentials > Google Service Account Key**, or run:

```sh
npx eas-cli@21.0.2 credentials --platform android
```

Select **Google Service Account > Upload a Google Service Account Key**.
Use least-privilege Play Console permissions. A first Google Play application
submission may still require a manual upload/setup before API-driven
submissions are accepted.

## Rotation and incident response

When a credential may be exposed:

1. Identify whether it is public configuration or a true credential.
2. Create a replacement in the provider without deleting the old value first,
   when the provider supports overlap.
3. Update the password manager and the correct destination: Supabase Auth,
   Supabase Edge secrets, EAS credentials/environment, or CI.
4. Deploy and verify all consumers.
5. Revoke the old credential at the provider.
6. Review Supabase, Twilio, Expo, Apple, Firebase/Google, and CI audit logs for
   unexpected activity.
7. Record the incident and new rotation date without recording the secret.

For a leaked Supabase elevated key, assume database access bypassing RLS was
possible. For a leaked Twilio token, review message and Verify activity. For a
leaked APNs/FCM key, verify push delivery after replacement. For a leaked
contact HMAC key, treat registered phone identifiers as potentially exposed
and follow the versioned migration procedure rather than overwriting the key.

## Source documentation

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase phone login](https://supabase.com/docs/guides/auth/phone-login)
- [Twilio Verify API](https://www.twilio.com/docs/verify/api)
- [Expo programmatic access](https://docs.expo.dev/accounts/programmatic-access)
- [Expo environment variables](https://docs.expo.dev/eas/environment-variables/)
- [Expo app credentials](https://docs.expo.dev/app-signing/app-credentials/)
- [Expo FCM V1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)
