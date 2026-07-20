begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);

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

select lives_ok(
  $$select public.replace_contact_matches(
    array[repeat('2', 64)],
    1::smallint,
    statement_timestamp()
  )$$,
  'contact replacement persists only registered keyed matches'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.contact_matches
    where owner_user_id = 'd0000000-0000-0000-0000-000000000001'
      and matched_user_id = 'd0000000-0000-0000-0000-000000000002'
  ),
  1,
  'contact replacement does not return a match-count oracle'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.replace_contact_matches(
    array['not-a-digest'],
    1::smallint,
    statement_timestamp()
  )$$,
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

select ok(
  not has_table_privilege('authenticated', 'public.devices', 'select'),
  'device rows remain hidden from authenticated callers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_photo_blast(uuid,text,text,text)',
    'execute'
  ),
  'authenticated callers cannot complete photo blasts'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.complete_photo_blast(uuid,text,text,text)',
    'execute'
  ),
  'service role can complete photo blasts after media validation'
);

reset role;

insert into public.devices (user_id, push_token, platform)
values
  (
    'd0000000-0000-0000-0000-000000000002',
    'ExponentPushToken[test_recipient_accepted]',
    'ios'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'ExponentPushToken[test_recipient_retry]',
    'android'
  );

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

select lives_ok(
  $$
    select public.finish_notification_outbox(
      (select id from public.notification_outbox
       where blast_recipient_id = 'e1000000-0000-0000-0000-000000000001'),
      (
        select jsonb_agg(jsonb_build_object(
          'deliveryId', deliveries.id,
          'state', case when devices.platform = 'ios' then 'accepted' else 'failed' end,
          'retry', devices.platform = 'android',
          'receiptId', case when devices.platform = 'ios' then 'ticket-test' end,
          'errorCode', case when devices.platform = 'android'
            then 'MessageRateExceeded' end
        ))
        from public.notification_deliveries deliveries
        join public.devices on devices.id = deliveries.device_id
        where deliveries.blast_recipient_id =
          'e1000000-0000-0000-0000-000000000001'
      ),
      true,
      'TRANSIENT_PROVIDER_FAILURE'
    )
  $$,
  'mixed provider results schedule only transient failures for retry'
);

update public.notification_outbox
set available_at = statement_timestamp()
where blast_recipient_id = 'e1000000-0000-0000-0000-000000000001';

update public.notification_deliveries deliveries
set next_attempt_at = statement_timestamp()
from public.devices
where devices.id = deliveries.device_id
  and devices.platform = 'android'
  and devices.push_token = 'ExponentPushToken[test_recipient_retry]'
  and deliveries.blast_recipient_id =
    'e1000000-0000-0000-0000-000000000001';

select is(
  (
    select devices->0->>'pushToken'
    from public.claim_notification_outbox(1)
  ),
  'ExponentPushToken[test_recipient_retry]',
  'a retry claim excludes devices with accepted tickets'
);

select lives_ok(
  $$
    select public.finish_notification_outbox(
      (select id from public.notification_outbox
       where blast_recipient_id = 'e1000000-0000-0000-0000-000000000001'),
      jsonb_build_array(jsonb_build_object(
        'deliveryId',
        (
          select deliveries.id
          from public.notification_deliveries deliveries
          join public.devices on devices.id = deliveries.device_id
          where deliveries.blast_recipient_id =
            'e1000000-0000-0000-0000-000000000001'
            and devices.platform = 'android'
            and devices.push_token = 'ExponentPushToken[test_recipient_retry]'
        ),
        'state', 'invalid_token',
        'retry', false,
        'errorCode', 'DeviceNotRegistered'
      )),
      false,
      null
    )
  $$,
  'terminal invalid-token results finish the outbox'
);

select is(
  (
    select count(*)::integer
    from public.devices
    where push_token = 'ExponentPushToken[test_recipient_retry]'
      and not enabled
  ),
  1,
  'a terminal invalid token disables only its device'
);

select is(
  (
    select status::text
    from public.sunset_blasts
    where id = 'e0000000-0000-0000-0000-000000000001'
  ),
  'dispatched',
  'a blast with at least one accepted provider ticket is dispatched'
);

reset role;

insert into public.devices (user_id, push_token, platform)
values (
  'd0000000-0000-0000-0000-000000000002',
  'ExponentPushToken[owned_by_recipient]',
  'ios'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.register_device(
    'ExponentPushToken[owned_by_recipient]',
    'ios',
    '1.0.0'
  )$$,
  '23505',
  'push token already registered to another user',
  'register_device rejects cross-user push token takeover'
);

reset role;

-- Outbox reclaim after abandoned claim with orphaned queued deliveries.
insert into public.sunset_blasts (
  id, sender_id, kind, status, idempotency_key, original_object_path,
  display_object_path, thumbnail_object_path, expires_at
)
values (
  'e0000000-0000-0000-0000-000000000010',
  'd0000000-0000-0000-0000-000000000001',
  'nudge',
  'dispatching',
  'f0000000-0000-0000-0000-000000000010',
  null,
  null,
  null,
  statement_timestamp() + interval '1 hour'
);

insert into public.blast_recipients (
  id, blast_id, recipient_id, delivery_state, eligibility_version, eligibility_reason
)
values (
  'e1000000-0000-0000-0000-000000000010',
  'e0000000-0000-0000-0000-000000000010',
  'd0000000-0000-0000-0000-000000000003',
  'queued',
  1,
  'test'
);

insert into public.devices (user_id, push_token, platform)
values (
  'd0000000-0000-0000-0000-000000000003',
  'ExponentPushToken[reclaim_device]',
  'ios'
);

insert into public.notification_outbox (blast_recipient_id)
values ('e1000000-0000-0000-0000-000000000010');

update public.sunset_blasts
set audience_selected_at = statement_timestamp()
where id = 'e0000000-0000-0000-0000-000000000010';

set local role service_role;

select is(
  (
    select jsonb_array_length(devices)
    from public.claim_notification_outbox(1)
    where blast_id = 'e0000000-0000-0000-0000-000000000010'
  ),
  1,
  'initial claim returns the enabled reclaim device'
);

-- Simulate worker abandon: leave orphaned queued delivery, expire the lock TTL.
update public.notification_outbox
set locked_at = statement_timestamp() - interval '6 minutes'
where blast_recipient_id = 'e1000000-0000-0000-0000-000000000010';

select ok(
  exists (
    select 1
    from public.notification_deliveries deliveries
    join public.devices on devices.id = deliveries.device_id
    where deliveries.blast_recipient_id = 'e1000000-0000-0000-0000-000000000010'
      and devices.push_token = 'ExponentPushToken[reclaim_device]'
      and deliveries.state = 'queued'
      and deliveries.next_attempt_at is null
  ),
  'abandoned claim leaves an orphaned queued delivery'
);

select is(
  (
    select devices->0->>'pushToken'
    from public.claim_notification_outbox(1)
    where blast_id = 'e0000000-0000-0000-0000-000000000010'
  ),
  'ExponentPushToken[reclaim_device]',
  'reclaim after lock TTL still returns orphaned queued devices'
);

select lives_ok(
  $$
    select public.finish_notification_outbox(
      (select id from public.notification_outbox
       where blast_recipient_id = 'e1000000-0000-0000-0000-000000000010'),
      jsonb_build_array(jsonb_build_object(
        'deliveryId',
        (
          select deliveries.id
          from public.notification_deliveries deliveries
          join public.devices on devices.id = deliveries.device_id
          where deliveries.blast_recipient_id =
            'e1000000-0000-0000-0000-000000000010'
            and devices.push_token = 'ExponentPushToken[reclaim_device]'
        ),
        'state', 'accepted',
        'retry', false,
        'receiptId', 'reclaim-ticket'
      )),
      false,
      null
    )
  $$,
  'reclaimed outbox work can still finish as accepted'
);

reset role;

insert into public.sunset_blasts (
  id, sender_id, kind, status, idempotency_key, capture_location, expires_at
)
values (
  'e0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001',
  'nudge',
  'ready',
  'f0000000-0000-0000-0000-000000000002',
  extensions.st_setsrid(extensions.st_makepoint(-77, 38), 4326)::extensions.geography,
  statement_timestamp() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);

select is(
  public.dispatch_blast('e0000000-0000-0000-0000-000000000002'),
  0,
  'dispatch atomically records an empty eligible audience'
);

select is(
  (
    select status::text
    from public.sunset_blasts
    where id = 'e0000000-0000-0000-0000-000000000002'
  ),
  'dispatched',
  'a blast with no eligible recipients reaches a terminal state'
);

reset role;

update public.sunset_blasts
set
  created_at = statement_timestamp() - interval '2 hours',
  expires_at = statement_timestamp() - interval '1 hour'
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
