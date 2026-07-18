begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

insert into auth.users (id)
values
  ('d0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000003');

update public.profiles
set
  status = 'active',
  phone_hmac = decode(repeat(right(id::text, 1), 64), 'hex'),
  phone_hmac_version = 1,
  privacy_policy_version = 'test',
  privacy_policy_accepted_at = statement_timestamp();

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);

select is(
  public.replace_contact_matches(
    array[repeat('2', 64)],
    1,
    statement_timestamp()
  ),
  1,
  'contact replacement persists only registered keyed matches'
);

select throws_ok(
  $$select public.replace_contact_matches(array['not-a-digest'], 1, statement_timestamp())$$,
  '22023',
  'invalid contact match request',
  'contact replacement rejects malformed keyed digests'
);

select lives_ok(
  $$select public.register_device(
    'ExponentPushToken[test_device_1]',
    'ios',
    '1.0.0'
  )$$,
  'an authenticated caller can register a valid Expo token'
);

select is(
  (
    select count(*)::integer
    from public.devices
    where user_id = 'd0000000-0000-0000-0000-000000000001'
  ),
  0,
  'device rows remain hidden from authenticated callers'
);

reset role;

insert into public.sunset_blasts (
  id, sender_id, kind, status, idempotency_key, original_object_path,
  display_object_path, thumbnail_object_path, expires_at
)
values (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'photo',
  'dispatching',
  'f0000000-0000-0000-0000-000000000001',
  'original.jpg',
  'display.jpg',
  'thumbnail.jpg',
  statement_timestamp() + interval '1 hour'
);

insert into public.blast_recipients (
  id, blast_id, recipient_id, delivery_state, eligibility_version, eligibility_reason
)
values (
  'e1000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002',
  'queued',
  1,
  'test'
);

insert into public.notification_outbox (blast_recipient_id)
values ('e1000000-0000-0000-0000-000000000001');

update public.sunset_blasts
set audience_selected_at = statement_timestamp()
where id = 'e0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::integer from public.get_blast_access(
    'e0000000-0000-0000-0000-000000000001'
  )),
  1,
  'an eligible recipient can access an unexpired blast'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*)::integer from public.get_blast_access(
    'e0000000-0000-0000-0000-000000000001'
  )),
  0,
  'a non-recipient cannot access blast metadata or media paths'
);

select throws_ok(
  $$select * from public.claim_notification_outbox(1)$$,
  '42501',
  'permission denied for function claim_notification_outbox',
  'authenticated users cannot invoke the outbox worker contract'
);

reset role;
set local role service_role;

select is(
  (select count(*)::integer from public.claim_notification_outbox(1)),
  1,
  'the worker claims one ready outbox row'
);

select is(
  (select count(*)::integer from public.claim_notification_outbox(1)),
  0,
  'a locked outbox row cannot be claimed concurrently'
);

reset role;

update public.sunset_blasts
set expires_at = statement_timestamp() - interval '1 second'
where id = 'e0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*)::integer from public.get_blast_access(
    'e0000000-0000-0000-0000-000000000001'
  )),
  0,
  'expired blasts do not expose metadata or media paths'
);

reset role;

select ok(
  not has_function_privilege(
    'authenticated',
    'public.finish_notification_outbox(uuid,jsonb,boolean,text)',
    'execute'
  ),
  'authenticated users cannot finish outbox work'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.finish_notification_outbox(uuid,jsonb,boolean,text)',
    'execute'
  ),
  'service role can finish claimed outbox work'
);

select * from finish();
rollback;
