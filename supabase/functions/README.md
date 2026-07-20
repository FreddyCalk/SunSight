# Sunsight Edge Functions

Authenticated functions rely on gateway JWT verification and also call `auth.getUser()` before
invoking caller-scoped database functions. The dispatch worker disables gateway JWT verification and
instead requires the `x-worker-secret` header to match `DISPATCH_WORKER_SECRET`.

`PHONE_HMAC_SECRET` must contain the same versioned key provisioned in Vault for verified profile
identifiers. Raw contact numbers are accepted only by `match-contacts`, are never logged or
persisted, and are cleared after their HMACs are computed.

## Media processor boundary

`_shared/image.ts` is intentionally fail closed. It enforces upload byte limits, JPEG/PNG MIME and
magic agreement, and bounded dimensions, then returns `MEDIA_PROCESSOR_UNAVAILABLE` without changing
blast state. A production photo processor must decode untrusted images in the Edge runtime, apply
orientation, strip all metadata, and produce bounded JPEG display and thumbnail derivatives before
replacing this boundary.

The rejected `imagescript` adapter required native FFI in Deno and therefore was not safe to deploy
to Supabase Edge. Until a verified Edge-compatible decoder/encoder is selected, photo completion is
unavailable; original uploads remain private and are never signed for recipients. Nudge blasts and
all non-media functions remain available.
