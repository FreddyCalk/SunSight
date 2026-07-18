# Sunsight operations documentation

- [Credentials and secrets](credentials.md): credential inventory, exact
  provider locations, safe storage, and rotation procedures.
- [Authentication contract](auth.md): passwordless SMS OTP registration and
  sign-in, local smoke verification, hosted Twilio Verify setup, and
  profile-finalization boundaries.
- [Schema and local backend operations](schema-operations.md): tables, RLS,
  private Storage, Vault, local verification, and explicitly deferred work.
- [Deployment runbook](deployment.md): local verification, Supabase deployment,
  EAS builds, store submission, post-release checks, and rollback.

These documents contain names and retrieval procedures only. Never record a
real key, token, password, connection string, private key, or certificate in
the repository.
