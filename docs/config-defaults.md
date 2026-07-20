# Locked MVP configuration defaults

These are the locked MVP behavior defaults. Database-backed values live in
`public.app_config` and are seeded by both the foundation migration and
`supabase/seed.sql`; they are configuration, not mobile UI constants.

| Contract | Locked default | Source key or enforcement |
|---|---:|---|
| Nearby radius | 1,609 m (1 mile) | `proximity_radius_m = 1609` |
| Location freshness | 4 hours | `location_ttl_seconds = 14400` |
| Maximum location accuracy | 500 m | `max_location_accuracy_m = 500` |
| Shared blast cooldown | 30 minutes | `blast_cooldown_seconds = 1800` |
| Maximum blast visibility | 4 hours | `blast_visibility_seconds = 14400` |
| Contact eligibility | One-way | `one_way_contact_nearby_v1` eligibility reason |
| Supported phone region | US/Canada `+1` | Edge and database E.164 validation |

The cooldown is shared by `nudge` and `photo`; changing blast kind does not
create a second send opportunity.

## Visibility rule

The product expiry contract is:

```text
expires_at = min(local midnight in the sender's timezone, creation time + 4 hours)
```

`create-blast` requires an IANA `timezone` and accepts `expiresAt` as a client
hint. The database calculates the next local midnight in that timezone and the
configured visibility boundary. It stores the earliest of those server-side
boundaries and the client hint, so a client may shorten visibility but cannot
extend it. An invalid or missing timezone and an already-expired client hint
are rejected.

## Change control

Changing a database-backed value requires a reviewed migration, matching seed
update, boundary tests, and regenerated database types when the schema contract
changes. Changing contact direction, phone region, or visibility semantics also
requires coordinated Edge Function and mobile contract changes. Do not silently
change these values in a hosted dashboard.
