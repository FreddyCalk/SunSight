begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

select is(
  (
    select count(*)::integer
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'profiles',
        'devices',
        'location_snapshots',
        'sunset_blasts',
        'blast_recipients',
        'blocks',
        'notification_preferences',
        'notification_deliveries',
        'contact_matches',
        'notification_outbox',
        'app_config'
      )
      and pg_class.relrowsecurity
  ),
  11,
  'all public application tables have RLS enabled'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  phone,
  encrypted_password,
  phone_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    '+12025550101',
    'test-only',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    '+12025550102',
    'test-only',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    '+12025550103',
    'test-only',
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

select throws_ok(
  $$
    insert into public.sunset_blasts (
      sender_id, kind, status, idempotency_key, original_object_path, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'nudge',
      'draft',
      '20000000-0000-0000-0000-000000000001',
      'forbidden.jpg',
      now() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'nudge blasts reject all media paths'
);

select lives_ok(
  $$
    insert into public.sunset_blasts (
      id, sender_id, kind, status, idempotency_key, expires_at
    )
    values (
      '30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'photo',
      'draft',
      '20000000-0000-0000-0000-000000000002',
      now() + interval '1 hour'
    )
  $$,
  'photo drafts do not require an original path'
);

select lives_ok(
  $$
    insert into public.sunset_blasts (
      sender_id, kind, status, idempotency_key, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'photo',
      'uploading',
      '20000000-0000-0000-0000-000000000003',
      now() + interval '1 hour'
    )
  $$,
  'uploading photos do not require an original path'
);

select throws_ok(
  $$
    insert into public.sunset_blasts (
      sender_id, kind, status, idempotency_key, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'photo',
      'ready',
      '20000000-0000-0000-0000-000000000004',
      now() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'ready photos require an original path'
);

select lives_ok(
  $$
    insert into public.sunset_blasts (
      sender_id, kind, status, idempotency_key, original_object_path, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'photo',
      'ready',
      '20000000-0000-0000-0000-000000000005',
      'private/original.jpg',
      now() + interval '1 hour'
    )
  $$,
  'ready photos accept a private original path'
);

select throws_ok(
  $$
    insert into public.blocks (blocker_id, blocked_id)
    values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'users cannot block themselves'
);

select throws_ok(
  $$
    insert into public.sunset_blasts (
      sender_id, kind, status, idempotency_key, expires_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      'photo',
      'draft',
      '20000000-0000-0000-0000-000000000002',
      now() + interval '1 hour'
    )
  $$,
  '23505',
  null,
  'idempotency keys are unique per sender'
);

insert into public.location_snapshots (
  user_id, location, accuracy_m, source, captured_at, expires_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    extensions.st_geogfromtext('SRID=4326;POINT(-122.4194 37.7749)'),
    500,
    'foreground',
    now(),
    now() + interval '4 hours'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    extensions.st_geogfromtext('SRID=4326;POINT(-122.4094 37.7849)'),
    500,
    'foreground',
    now(),
    now() + interval '4 hours'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.profiles where id = auth.uid()),
  1,
  'a user can read their own profile'
);

select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  0,
  'a user cannot read another profile'
);

select is(
  (
    select count(*)::integer
    from public.location_snapshots
    where user_id = auth.uid()
  ),
  1,
  'a user can read their own coarse location snapshot'
);

select is(
  (
    select count(*)::integer
    from public.location_snapshots
    where user_id = '10000000-0000-0000-0000-000000000002'
  ),
  0,
  'another user location row is hidden'
);

select is(
  (
    select count(*)::integer
    from public.location_snapshots
    where extensions.st_x(location::extensions.geometry) = -122.4094
  ),
  0,
  'another user exact longitude cannot be queried'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'phone_hmac',
    'select'
  ),
  'authenticated clients cannot select phone HMAC values'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.devices',
    'push_token',
    'select'
  ),
  'authenticated clients cannot select device tokens'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.blast_recipients',
    'select'
  ),
  'authenticated clients cannot inspect recipient membership'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.notification_deliveries',
    'select'
  ),
  'authenticated clients cannot inspect delivery details'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values ('sunset-photos', 'arbitrary.jpg', auth.uid())
  $$,
  '42501',
  null,
  'Storage RLS denies arbitrary authenticated writes'
);

reset role;

select is(
  (
    select public
    from storage.buckets
    where id = 'sunset-photos'
  ),
  false,
  'sunset photo bucket is private'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);

select throws_ok(
  $$select public.finalize_verified_profile('2026-07-17')$$,
  '28000',
  'verified phone required',
  'an unverified user cannot finalize a profile'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select throws_ok(
  $$select public.finalize_verified_profile('')$$,
  '22023',
  'privacy policy acceptance is required',
  'profile finalization requires an explicit policy version'
);

select throws_ok(
  $$select public.finalize_verified_profile('2026-07-17')$$,
  '55000',
  'phone HMAC secret is not provisioned',
  'profile finalization fails closed without the Vault secret'
);

reset role;

select lives_ok(
  $$
    select vault.create_secret(
      'local-test-secret-with-at-least-32-bytes',
      'PHONE_HMAC_SECRET',
      'Rolled back with the pgTAP transaction'
    )
  $$,
  'the documented Vault API provisions the named HMAC secret'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$select public.finalize_verified_profile('2026-07-17')$$,
  'a confirmed caller can finalize after secret provisioning'
);

reset role;

select is(
  (
    select row(
      status::text,
      phone_hmac_version,
      octet_length(phone_hmac),
      privacy_policy_version,
      privacy_policy_accepted_at is not null
    )::text
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  '(active,1,32,2026-07-17,t)',
  'finalization stores a versioned HMAC and privacy acceptance'
);

select * from finish();
rollback;
