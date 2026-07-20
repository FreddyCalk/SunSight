# Sunsight operations documentation

- [Credentials and secrets](credentials.md): credential inventory, exact
  provider locations, safe storage, and rotation procedures.
- [Authentication contract](auth.md): passwordless SMS OTP registration and
  sign-in, local smoke verification, hosted Twilio Verify setup, and
  profile-finalization boundaries.
- [Contact matching privacy disclosure](privacy-contacts.md): transient raw
  number processing, server-keyed HMAC matching, retention, and required
  user-facing disclosure.
- [Locked MVP configuration](config-defaults.md): radius, location freshness
  and accuracy, cooldown, visibility, contact direction, and phone region.
- [Local development runbook](local-runbook.md): environment files, backend
  reset and tests, generated types, Edge Function serving, and worker
  invocation.
- [Schema and local backend operations](schema-operations.md): tables, RLS,
  private Storage, Vault, local verification, and explicitly deferred work.
- [Deployment runbook](deployment.md): local verification, Supabase deployment,
  EAS builds, store submission, post-release checks, and rollback.

These documents contain names and retrieval procedures only. Never record a
real key, token, password, connection string, private key, or certificate in
the repository.
