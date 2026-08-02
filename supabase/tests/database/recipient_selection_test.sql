begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(29);

insert into auth.users (id)
values
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000007'),
  ('a0000000-0000-0000-0000-000000000008');

update public.profiles
set
  status = 'active',
  phone_hmac = decode(
    repeat(
      right(id::text, 1),
      64
    ),
    'hex'
  ),
  phone_hmac_version = 1,
  privacy_policy_version = 'test-policy',
  privacy_policy_accepted_at = statement_timestamp();

select is(
  (
    select jsonb_object_agg(config_key, value_json)
    from public.app_config
  ),
  jsonb_build_object(
    'proximity_radius_m', 32180,
    'location_ttl_seconds', 14400,
    'max_location_accuracy_m', 500,
    'blast_cooldown_seconds', 1800,
    'blast_visibility_seconds', 14400,
    'recipient_cap', 100
  ),
  'locked application defaults are seeded'
);

select is(
  (
    select count(*)::integer
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in ('contact_matches', 'notification_outbox')
      and pg_class.relrowsecurity
  ),
  2,
  'contact matches and outbox have RLS enabled'
);

insert into public.location_snapshots (
  user_id,
  location,
  accuracy_m,
  source,
  captured_at,
  expires_at
)
select
  'a0000000-0000-0000-0000-000000000001',
  extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
  20,
  'foreground',
  statement_timestamp(),
  statement_timestamp() + interval '4 hours';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_blast(
      'nudge',
      'b0000000-0000-0000-0000-000000000001',
      'UTC',
      statement_timestamp() + interval '3 hours'
    )
  $$,
  'a nudge blast can be created from a fresh accurate location'
);

select lives_ok(
  $$
    select public.create_blast(
      'nudge',
      'b0000000-0000-0000-0000-000000000001',
      'UTC',
      statement_timestamp() + interval '3 hours'
    )
  $$,
  'reusing an idempotency key returns the original blast'
);

select is(
  (
    select count(*)::integer
    from public.sunset_blasts
    where sender_id = 'a0000000-0000-0000-0000-000000000001'
      and idempotency_key = 'b0000000-0000-0000-0000-000000000001'
  ),
  1,
  'idempotent creation persists one blast'
);

select throws_ok(
  $$
    select public.create_blast(
      'photo',
      'b0000000-0000-0000-0000-000000000002',
      'UTC',
      statement_timestamp() + interval '3 hours'
    )
  $$,
  'P0001',
  null,
  'the shared cooldown applies when switching blast kind'
);

select throws_ok(
  $$
    select public.create_blast(
      'photo',
      'b0000000-0000-0000-0000-000000000003',
      'UTC',
      statement_timestamp() - interval '1 second'
    )
  $$,
  '22023',
  null,
  'blast creation rejects an already-expired visibility window'
);

reset role;

select throws_ok(
  $$
    insert into public.sunset_blasts (
      sender_id,
      kind,
      status,
      idempotency_key,
      original_object_path,
      expires_at
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      'nudge',
      'ready',
      'b0000000-0000-0000-0000-000000000004',
      'not-allowed.jpg',
      statement_timestamp() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'nudge blasts cannot carry media'
);

select throws_ok(
  $$
    insert into public.sunset_blasts (
      sender_id,
      kind,
      status,
      idempotency_key,
      expires_at
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      'photo',
      'ready',
      'b0000000-0000-0000-0000-000000000005',
      statement_timestamp() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'ready photo blasts require an original object path'
);

insert into public.location_snapshots (
  user_id,
  location,
  accuracy_m,
  source,
  captured_at,
  expires_at
)
values
  (
    'a0000000-0000-0000-0000-000000000002',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      32179,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      32181,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      100,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp() - interval '5 hours',
    statement_timestamp() + interval '1 hour'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      100,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000006',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      100,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000007',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      100,
      pg_catalog.radians(90)
    ),
    501,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000008',
    extensions.st_project(
      extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
      100,
      pg_catalog.radians(90)
    ),
    20,
    'foreground',
    statement_timestamp(),
    statement_timestamp() + interval '4 hours'
  );

insert into public.contact_matches (
  owner_user_id,
  matched_user_id,
  hmac_version,
  consented_at,
  expires_at
)
select
  'a0000000-0000-0000-0000-000000000001',
  profiles.id,
  1,
  statement_timestamp(),
  statement_timestamp() + interval '1 day'
from public.profiles
where profiles.id <> 'a0000000-0000-0000-0000-000000000001';

insert into public.blocks (blocker_id, blocked_id)
values
  (
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000008'
  );

insert into public.notification_preferences (user_id, muted_until)
values (
  'a0000000-0000-0000-0000-000000000006',
  statement_timestamp() + interval '1 hour'
);

insert into public.sunset_blasts (
  id,
  sender_id,
  kind,
  status,
  idempotency_key,
  capture_location,
  captured_at,
  expires_at
)
values (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'nudge',
  'ready',
  'b0000000-0000-0000-0000-000000000006',
  extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
  statement_timestamp(),
  statement_timestamp() + interval '3 hours'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);

select is(
  public.select_and_persist_recipients(
    'c0000000-0000-0000-0000-000000000001'
  ),
  1,
  'selection persists only the eligible nearby contact'
);

reset role;

select ok(
  exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000002'
  ),
  'a contact 32179 meters away is inside the boundary'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000003'
  ),
  'a contact 32181 meters away is outside the boundary'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000004'
  ),
  'a stale location snapshot is ineligible'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000005'
  ),
  'a block in the reverse direction excludes the contact'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000006'
  ),
  'a contact with an active mute is ineligible'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000007'
  ),
  'a location above the accuracy threshold is ineligible'
);

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000008'
  ),
  'a sender-side block excludes the contact'
);

select is(
  (
    select count(*)::integer
    from public.notification_outbox
    where blast_recipient_id in (
      select id
      from public.blast_recipients
      where blast_id = 'c0000000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'recipient persistence creates one transactional outbox event'
);

update public.location_snapshots
set location = extensions.st_project(
  extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
  100,
  pg_catalog.radians(90)
)
where user_id = 'a0000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);

select is(
  public.select_and_persist_recipients(
    'c0000000-0000-0000-0000-000000000001'
  ),
  1,
  'recipient selection retries return the frozen audience'
);

reset role;

select ok(
  not exists (
    select 1
    from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
      and recipient_id = 'a0000000-0000-0000-0000-000000000003'
  ),
  'eligibility changes after selection cannot alter the audience'
);

select throws_ok(
  $$
    insert into public.blast_recipients (
      blast_id,
      recipient_id,
      eligibility_version,
      eligibility_reason
    )
    values (
      'c0000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000003',
      1,
      'late_addition'
    )
  $$,
  '55000',
  null,
  'recipients cannot be inserted after the audience is frozen'
);

select throws_ok(
  $$
    delete from public.blast_recipients
    where blast_id = 'c0000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  null,
  'recipients cannot be deleted after the audience is frozen'
);

insert into public.sunset_blasts (
  id,
  sender_id,
  kind,
  status,
  idempotency_key,
  capture_location,
  captured_at,
  expires_at,
  created_at
)
values (
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'nudge',
  'ready',
  'b0000000-0000-0000-0000-000000000007',
  extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),
  statement_timestamp() - interval '2 hours',
  statement_timestamp() - interval '1 hour',
  statement_timestamp() - interval '3 hours'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$
    select public.select_and_persist_recipients(
      'c0000000-0000-0000-0000-000000000002'
    )
  $$,
  '55000',
  null,
  'expired blasts cannot select recipients'
);

reset role;

-- Clear shared cooldown so midnight-clamp create_blast cases can run.
update public.sunset_blasts
set created_at = statement_timestamp() - interval '2 hours'
where sender_id = 'a0000000-0000-0000-0000-000000000001'
  and status in ('draft', 'uploading', 'ready', 'dispatching', 'dispatched');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$
    select public.create_blast(
      'nudge',
      'b0000000-0000-0000-0000-0000000000aa',
      'Not/A_Real_Zone',
      null
    )
  $$,
  '22023',
  null,
  'blast creation rejects an invalid IANA timezone'
);

select is(
  (
    select expires_at = least(
      statement_timestamp() + interval '4 hours',
      (
        date_trunc('day', statement_timestamp() at time zone 'America/Denver')
          + interval '1 day'
      ) at time zone 'America/Denver'
    )
    from public.create_blast(
      'nudge',
      'b0000000-0000-0000-0000-0000000000ab',
      'America/Denver',
      statement_timestamp() + interval '4 hours'
    )
  ),
  true,
  'create_blast clamps client expiry to visibility and local midnight'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'public.app_config', 'select'),
  'authenticated clients cannot read internal configuration'
);

select ok(
  not has_table_privilege('authenticated', 'public.contact_matches', 'select'),
  'authenticated clients cannot inspect contact matches'
);

select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'select'),
  'authenticated clients cannot inspect outbox internals'
);

select ok(
  not has_table_privilege('authenticated', 'public.blast_recipients', 'select'),
  'authenticated clients cannot inspect recipient membership'
);

select * from finish();
rollback;
