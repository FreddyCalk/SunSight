# Authentication contract

## Implemented baseline

Sunsight uses passwordless phone authentication through Supabase Auth and
Twilio Verify. Registration and signed-out sign-in share the same OTP path.
There is no password signup or password sign-in in the current contract.
Mobile Auth screens remain unimplemented; this document describes the backend
and client API contract they must follow.

The installed `@supabase/supabase-js` version is `2.110.7`. Its installed types
verify these calls and fields:

- `signInWithOtp({ phone, options: { captchaToken } })`
- `verifyOtp({ phone, token, type: "sms" })`

Recheck these signatures when the dependency changes. Do not use
`signUp({ phone, password, ... })` or `signInWithPassword({ phone, password })`
as the Sunsight Auth path.

## Registration and sign-in

The same flow handles new and returning users when no valid session exists:

1. Normalize and validate a US or Canadian number to `+1` E.164 using a verified
   phone library on the client.
2. In an environment with CAPTCHA enabled, obtain a fresh challenge token before
   every OTP-send request.
3. Call `signInWithOtp` with the canonical phone and `options.captchaToken`
   where required. Supabase creates the account when the number is new.
4. Submit the SMS code with `verifyOtp({ phone, token, type: "sms" })`.
5. Require a valid session and non-null `auth.users.phone_confirmed_at`.
6. When the caller's profile is still `pending`, call
   `public.finalize_verified_profile(policy_version)` as that authenticated user.
   Pass the privacy-policy version the user accepted in the app.
7. Persist the session using the mobile secure-storage adapter when that client
   flow is implemented. Refresh the session on launch while it remains valid.

The `auth.users` insert trigger creates a `public.profiles` row in `pending`
state. Finalization reads the confirmed phone from `auth.users`, validates the
`+1` E.164 shape, computes a versioned HMAC, records privacy-policy version
and acceptance time, and changes the profile to `active`. It fails without
changing the pending profile when the caller is unauthenticated, the phone is
unconfirmed or unsupported, the profile is missing, the policy version is empty,
or the named Vault secret is absent or shorter than 32 bytes.

Returning users with an already `active` profile skip step 6 after OTP
verification.

`public.finalize_verified_profile(policy_version)` is the Data API-facing,
security-invoker wrapper. It delegates to the security-definer
`private.finalize_verified_profile(policy_version)`. Client code should call
only the public RPC even though the migration currently also grants
authenticated execution on the private function.

## Returning session restore

While a persisted Supabase session remains valid, the mobile client should
restore it through the normal refresh path without sending another SMS OTP.

When the user is signed out or the session is invalid or expired, returning
sign-in repeats the OTP path: fresh CAPTCHA where required,
`signInWithOtp`, then `verifyOtp` with type `sms`. There is no password
recovery path.

## CAPTCHA and abuse controls

Local `config.toml` has CAPTCHA commented out, so local Auth does not currently
enforce it. Staging and production must independently enable a
Supabase-supported CAPTCHA provider before external use.

- Pass a fresh token as `options.captchaToken` on every `signInWithOtp` request,
  including resend behavior.
- Keep the CAPTCHA secret in hosted Auth configuration and the team password
  manager. Only the provider's public site key may enter mobile configuration.
- Never log or persist CAPTCHA tokens, phone numbers, or OTP values.
- Configure and test SMS-send, sign-in/signup, and OTP-verification limits.
- Keep responses non-enumerating and monitor provider failures and spend without
  recording sensitive request data.

The current local limits are `sms_sent = 30` per hour,
`sign_in_sign_ups = 30` per five minutes per IP, and
`token_verifications = 30` per five minutes per IP. Hosted values are separate
configuration and must be reviewed per environment.

## Local Auth

### Environment before start

The local stack reads Twilio Verify names from the environment through
`supabase/config.toml`. The Supabase CLI loads a `.env` file at the repository
root when resolving `env(...)` substitutions, so provide them there before
`npx supabase start` or `npm run supabase:start`:

```sh
cp .env.example .env   # run from the repository root; .env is gitignored
npm run supabase:start
```

Alternatively, export the same three names inline in the shell. Placeholder
values from the root `.env.example` are enough for configuration parsing; they
are not usable credentials for live SMS. The CLI does not read `supabase/.env`
for these values.

Required names:

- `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
- `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
- `SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID`

Restart the local stack after Auth configuration changes.

### Local OTP (no Twilio delivery)

`auth.sms.test_otp` contains one committed NANP-reserved fictional mapping:

| Phone (E.164) | OTP |
|---|---|
| `+12025550100` | `123456` |

Local `signInWithOtp` / `verifyOtp` for that number uses the fixed code and
does not require Twilio delivery. Never copy `test_otp` mappings into staging or
production, and never add a personal number to the committed map.

### Local smoke verification

With the local stack healthy, run:

```sh
npm run auth:smoke
```

This proves that OTP verification creates a Supabase session against the local
Auth service. It is the operator check for local passwordless Auth before
mobile screens exist. Credential retrieval, hosted Twilio setup, and CAPTCHA
configuration are documented in [credentials.md](credentials.md).

## Hosted SMS verification

Use real Twilio credentials for staging and production. Never use local
placeholders or `test_otp` mappings in hosted projects.

### Configure credentials

Provide a real Twilio Account SID (`AC...`), Auth Token, and Verify Service SID
(`VA...`) through either:

1. **Local stack with live SMS:** replace placeholders in the ignored root
   `.env`, then restart with `npm run supabase:start` or
   `npx supabase start`.
2. **Hosted Supabase project:** open **Authentication > Providers > Phone**,
   enable phone signup, choose **Twilio Verify**, enter the three values, and
   save. Step-by-step retrieval is in
   [credentials.md — Twilio Verify for phone ownership](credentials.md#twilio-verify-for-phone-ownership).

Use a separate Verify Service per environment. The Verify Service SID is not a
Messaging Service SID (`MG...`).

### Verify live delivery

After saving Auth settings or restarting the local stack:

1. Enable the environment's CAPTCHA provider before external beta. Hosted OTP
   sends must reject missing or invalid challenge tokens.
2. Test with an approved Twilio test number for that account and Verify
   service. Confirm send, verify, resend cooldown, and rejected OTP behavior.
3. Confirm the hosted project has **no** `test_otp` mapping. Live SMS must
   come only from Twilio Verify.

Hosted verification complements, but does not replace, database and advisor
checks documented in [schema-operations.md](schema-operations.md).

## Security boundary and unresolved work

Identity comes from the verified Supabase session and `auth.uid()`, never a
client-supplied phone or user ID. Phone HMACs support contact matching but are
not authentication.

Before external beta, implement and test the mobile Auth flow, CAPTCHA on
physical devices, phone changes, lost/reassigned-number handling, session
revocation after identity changes, and hosted configuration drift checks.
