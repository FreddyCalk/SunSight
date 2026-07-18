# Sunsight Supabase backend

This directory is the local-first source of truth for Auth configuration,
database migrations, non-sensitive seed data, and database tests.

## Extensions and schemas

The foundation migration enables:

- PostGIS in `extensions` for indexed `geography(Point, 4326)` data.
- pgcrypto in `extensions` for HMAC-SHA-256.
- Supabase Vault in `vault` for encrypted database secrets.
- `private` for privileged functions that must not be exposed by the Data API.

Vault is currently a Supabase public-alpha feature. The migration uses its
documented `vault.decrypted_secrets` interface and fails closed if the required
secret is missing.

## Local startup and reset

Use the repository-pinned CLI. Twilio Verify credentials are read from the
environment via `config.toml`. The CLI loads a `.env` file at the repository
root (alongside `supabase/`) when resolving `env(...)` substitutions, so
provide the names there before `supabase start`:

```sh
# Option A (preferred): copy the root placeholders, then start
cp .env.example .env   # run from the repository root; .env is gitignored
npx supabase start

# Option B: export the same three names inline
export SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID=AC00000000000000000000000000000000
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local-placeholder
export SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID=VA00000000000000000000000000000000
npx supabase start
```

The CLI does not read `supabase/.env` for these values; the file lives at the
repository root.

After the stack is up:

```sh
npx supabase db reset --local
npx supabase test db supabase/tests --local
npx supabase db lint --local --schema public --level error --fail-on error
npx supabase db advisors --local --type all --level warn --fail-on error
```

The placeholder environment values only satisfy local configuration parsing.
They are not usable credentials. The committed `auth.sms.test_otp` entry uses
the NANP-reserved fictional number `+1 202-555-0100` and code `123456`, so local
signup confirmation bypasses provider delivery. Never add personal, staging,
or production numbers or fixed OTPs to this file. Staging and production must
not have test OTP mappings.

## Auth boundaries

The supported signup flow is:

1. Normalize and validate the `+1` phone number.
2. Complete the configured CAPTCHA challenge where the environment requires it.
3. Call `signInWithOtp({ phone, options: { captchaToken } })`.
4. Call `verifyOtp({ phone, token, type: "sms" })`.
5. Call `public.finalize_verified_profile(policy_version)` as the
   authenticated, confirmed user. Finalization records privacy-policy
   acceptance and activates the profile atomically.
6. Persist and refresh the resulting Supabase session securely. An OTP is not
   required again while that session remains valid.

Client and server boundaries must normalize and validate the `+1` US/Canada
E.164 number with a verified phone library. The database function does not
trust a body phone or user ID. It derives `auth.uid()`, loads the Supabase-owned
`auth.users.phone`, requires `phone_confirmed_at`, and enforces the canonical
shape before deriving the identifier.

The `auth.users` trigger creates only a pending profile. A profile becomes
active only after finalization succeeds. Direct client access to phone HMACs,
device tokens, other users' locations, recipient membership, delivery details,
and Storage objects is denied.

## PHONE_HMAC_SECRET provisioning

Generate a distinct secret per environment and store its value only in the
environment password manager:

```sh
openssl rand -hex 32
```

Provision it through the Supabase Dashboard Vault UI with the exact name
`PHONE_HMAC_SECRET`, or from a trusted SQL session:

```sql
select vault.create_secret(
  '<value-from-secret-manager>',
  'PHONE_HMAC_SECRET',
  'Sunsight verified-phone HMAC key, version 1'
);
```

Do not put the value in migrations, seed data, shell history, logs, or chat.
Provisioning is operational because migration history must be reproducible
without credentials. `public.finalize_verified_profile(policy_version)` raises
an error without changing the pending profile when the named Vault secret is
absent or too short.

Rotation is versioned. Provision a new named/versioned secret, add a migration
that writes the next `phone_hmac_version` while retaining old matching support,
backfill and verify, then remove the old key. Never replace version 1 in place.

## Twilio Verify configuration

`config.toml` reads these names:

- `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
- `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
- `SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID`

The last value must be a Twilio Verify Service SID beginning with `VA`.
Supabase calls the TOML field `message_service_sid`; it is not an `MG` Twilio
Messaging Service SID when the `twilio_verify` provider is selected.

Hosted projects require phone signup and confirmation, Twilio Verify, OTP
lifetime/resend settings, Auth rate limits, and a Supabase-supported CAPTCHA
provider to be configured independently and verified before release. Signup
OTP sends and resends require the environment's CAPTCHA and abuse controls.
CAPTCHA and provider secrets must never be included in the mobile app.

## Migration workflow

Create every logical change with:

```sh
npx supabase migration new <descriptive_name>
```

Edit the generated file, reset from empty, run pgTAP, lint, and advisors, then
review the migration before sharing it. Migration history becomes append-only
after it is shared. `seed.sql` contains only repeatable, non-sensitive
configuration defaults.

The initial defaults are a 1,609-meter radius, four-hour location TTL,
500-meter maximum accuracy, thirty-minute shared cooldown, four-hour maximum
visibility (still truncated at local midnight by later blast logic), and a
100-recipient safety cap. These are validation starting points, not permanent
product constants.
