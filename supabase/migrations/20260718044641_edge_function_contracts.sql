create or replace function public.replace_contact_matches(
  p_contact_hmac_hex text[],
  p_hmac_version smallint,
  p_consented_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_expiry timestamptz;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_hmac_version <= 0
    or p_consented_at > statement_timestamp() + interval '5 minutes'
    or p_consented_at < statement_timestamp() - interval '1 day'
    or cardinality(p_contact_hmac_hex) > 1000
    or exists (
      select 1 from unnest(p_contact_hmac_hex) digest
      where digest !~ '^[0-9a-f]{64}$'
    )
  then
    raise exception 'invalid contact match request' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = caller_id and status = 'active'
  ) then
    raise exception 'active profile required' using errcode = '28000';
  end if;

  match_expiry := p_consented_at + interval '30 days';
  delete from public.contact_matches where owner_user_id = caller_id;

  insert into public.contact_matches (
    owner_user_id, matched_user_id, hmac_version, consented_at, expires_at
  )
  select distinct
    caller_id, profiles.id, p_hmac_version, p_consented_at, match_expiry
  from public.profiles
  join unnest(p_contact_hmac_hex) digest
    on encode(profiles.phone_hmac, 'hex') = digest
  where profiles.id <> caller_id
    and profiles.status = 'active'
    and profiles.phone_hmac_version = p_hmac_version
  on conflict (owner_user_id, matched_user_id) do update
  set
    hmac_version = excluded.hmac_version,
    consented_at = excluded.consented_at,
    expires_at = excluded.expires_at;
end;
$$;

create or replace function public.register_device(
  p_push_token text,
  p_platform public.device_platform,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result_id uuid;
  existing_owner uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_push_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'
    or char_length(p_push_token) > 200
    or (p_app_version is not null and char_length(p_app_version) > 80)
  then
    raise exception 'invalid device registration' using errcode = '22023';
  end if;

  select devices.user_id
    into existing_owner
  from public.devices
  where devices.push_token = p_push_token;

  if existing_owner is not null and existing_owner <> caller_id then
    raise exception 'push token already registered to another user'
      using errcode = '23505';
  end if;

  insert into public.devices (
    user_id, push_token, platform, app_version, enabled, last_seen_at
  )
  values (
    caller_id, p_push_token, p_platform, nullif(btrim(p_app_version), ''), true,
    statement_timestamp()
  )
  on conflict (push_token) do update
  set
    platform = excluded.platform,
    app_version = excluded.app_version,
    enabled = true,
    last_seen_at = statement_timestamp()
  where devices.user_id = caller_id
  returning id into result_id;

  if result_id is null then
    raise exception 'push token already registered to another user'
      using errcode = '23505';
  end if;

  return result_id;
end;
$$;

create or replace function public.assign_photo_upload_path(
  p_blast_id uuid,
  p_object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_object_path !~ ('^' || caller_id::text || '/' || p_blast_id::text
    || '/original-[0-9a-f]{32}\.(jpg|png)$')
  then
    raise exception 'invalid upload path' using errcode = '22023';
  end if;

  update public.sunset_blasts
  set original_object_path = p_object_path
  where id = p_blast_id
    and sender_id = caller_id
    and kind = 'photo'
    and status = 'uploading'
    and (original_object_path is null or original_object_path = p_object_path);

  if not found then
    raise exception 'photo blast not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.dispatch_blast(p_blast_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  selected_count integer;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  selected_count := public.select_and_persist_recipients(p_blast_id);
  if selected_count = 0 then
    update public.sunset_blasts
    set status = 'dispatched', dispatched_at = statement_timestamp()
    where id = p_blast_id
      and sender_id = caller_id
      and status = 'dispatching';
  end if;

  return selected_count;
end;
$$;

create or replace function public.complete_photo_blast(
  p_blast_id uuid,
  p_original_path text,
  p_display_path text,
  p_thumbnail_path text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
  target_blast public.sunset_blasts;
  sender_id uuid;
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  );
begin
  if jwt_role is distinct from 'service_role'
    and current_user is distinct from 'service_role'
  then
    raise exception 'worker authorization required' using errcode = '42501';
  end if;

  select *
    into target_blast
  from public.sunset_blasts
  where id = p_blast_id
  for update;

  if target_blast.id is null then
    raise exception 'photo blast not completable' using errcode = '55000';
  end if;

  sender_id := target_blast.sender_id;

  if p_display_path !~ ('^' || sender_id::text || '/' || p_blast_id::text
      || '/display-[0-9a-f]{32}\.jpg$')
    or p_thumbnail_path !~ ('^' || sender_id::text || '/' || p_blast_id::text
      || '/thumbnail-[0-9a-f]{32}\.jpg$')
  then
    raise exception 'invalid derivative path' using errcode = '22023';
  end if;

  update public.sunset_blasts
  set
    display_object_path = p_display_path,
    thumbnail_object_path = p_thumbnail_path,
    status = 'ready'
  where id = p_blast_id
    and kind = 'photo'
    and status = 'uploading'
    and original_object_path = p_original_path
    and expires_at > statement_timestamp();

  if not found then
    raise exception 'photo blast not completable' using errcode = '55000';
  end if;

  selected_count := public.select_and_persist_recipients(p_blast_id);
  if selected_count = 0 then
    update public.sunset_blasts
    set status = 'dispatched', dispatched_at = statement_timestamp()
    where id = p_blast_id
      and status = 'dispatching';
  end if;

  return selected_count;
end;
$$;

create or replace function public.get_blast_access(p_blast_id uuid)
returns table (
  blast_id uuid,
  kind public.blast_kind,
  sender_display_name text,
  created_at timestamptz,
  expires_at timestamptz,
  display_object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
  select
    blasts.id,
    blasts.kind,
    profiles.display_name,
    blasts.created_at,
    blasts.expires_at,
    blasts.display_object_path
  from public.sunset_blasts blasts
  join public.blast_recipients recipients
    on recipients.blast_id = blasts.id
    and recipients.recipient_id = caller_id
  join public.profiles on profiles.id = blasts.sender_id
  where blasts.id = p_blast_id
    and blasts.status in ('dispatching', 'dispatched')
    and blasts.expires_at > statement_timestamp();
end;
$$;

create or replace function public.claim_notification_outbox(p_limit integer)
returns table (
  outbox_id uuid,
  blast_id uuid,
  kind public.blast_kind,
  sender_display_name text,
  recipient_id uuid,
  attempt_count smallint,
  devices jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'worker authorization required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid claim limit' using errcode = '22023';
  end if;

  update public.notification_outbox outbox
  set
    locked_at = coalesce(outbox.locked_at, statement_timestamp()),
    processed_at = statement_timestamp(),
    last_error_code = 'BLAST_EXPIRED'
  from public.blast_recipients recipients
  join public.sunset_blasts blasts on blasts.id = recipients.blast_id
  where outbox.blast_recipient_id = recipients.id
    and outbox.processed_at is null
    and blasts.expires_at <= statement_timestamp();

  update public.blast_recipients recipients
  set delivery_state = 'failed'
  from public.notification_outbox outbox
  where outbox.blast_recipient_id = recipients.id
    and outbox.last_error_code = 'BLAST_EXPIRED'
    and outbox.processed_at is not null;

  update public.sunset_blasts blasts
  set status = 'failed_delivery'
  where blasts.status = 'dispatching'
    and blasts.expires_at <= statement_timestamp()
    and not exists (
      select 1
      from public.notification_outbox outbox
      join public.blast_recipients recipients
        on recipients.id = outbox.blast_recipient_id
      where recipients.blast_id = blasts.id
        and outbox.processed_at is null
    );

  return query
  with claimed as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.processed_at is null
      and outbox.available_at <= statement_timestamp()
      and (outbox.locked_at is null
        or outbox.locked_at < statement_timestamp() - interval '5 minutes')
      and outbox.attempt_count < 5
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit p_limit
  ),
  locked as (
    update public.notification_outbox outbox
    set
      locked_at = statement_timestamp(),
      attempt_count = outbox.attempt_count + 1
    from claimed
    where outbox.id = claimed.id
    returning outbox.*
  ),
  expanded as (
    select
      locked.id as outbox_id,
      blasts.id as blast_id,
      blasts.kind,
      coalesce(profiles.display_name, 'A friend') as sender_display_name,
      recipients.id as blast_recipient_id,
      recipients.recipient_id,
      locked.attempt_count,
      devices.id as device_id,
      devices.push_token
    from locked
    join public.blast_recipients recipients
      on recipients.id = locked.blast_recipient_id
    join public.sunset_blasts blasts on blasts.id = recipients.blast_id
    join public.profiles on profiles.id = blasts.sender_id
    left join public.devices
      on devices.user_id = recipients.recipient_id
      and devices.enabled
      and not exists (
        select 1
        from public.notification_deliveries prior_delivery
        where prior_delivery.blast_recipient_id = recipients.id
          and prior_delivery.device_id = devices.id
          and (
            prior_delivery.state in ('accepted', 'invalid_token')
            or (
              prior_delivery.next_attempt_at is not null
              and prior_delivery.next_attempt_at > statement_timestamp()
            )
            or (
              prior_delivery.state = 'failed'
              and prior_delivery.next_attempt_at is null
            )
          )
      )
    where blasts.expires_at > statement_timestamp()
  ),
  delivery_rows as (
    insert into public.notification_deliveries (
      blast_recipient_id, device_id, state, attempt_count, next_attempt_at
    )
    select
      expanded.blast_recipient_id,
      expanded.device_id,
      'queued',
      expanded.attempt_count,
      null
    from expanded
    where expanded.device_id is not null
    on conflict (blast_recipient_id, device_id) do update
    set
      state = 'queued',
      attempt_count = excluded.attempt_count,
      next_attempt_at = null,
      last_attempted_at = statement_timestamp()
    returning blast_recipient_id, device_id, id
  )
  select
    expanded.outbox_id,
    expanded.blast_id,
    expanded.kind,
    expanded.sender_display_name,
    expanded.recipient_id,
    expanded.attempt_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'deviceId', delivery_rows.device_id,
          'deliveryId', delivery_rows.id,
          'pushToken', expanded.push_token
        )
      ) filter (where delivery_rows.id is not null),
      '[]'::jsonb
    )
  from expanded
  left join delivery_rows
    on delivery_rows.blast_recipient_id = expanded.blast_recipient_id
    and delivery_rows.device_id = expanded.device_id
  group by
    expanded.outbox_id, expanded.blast_id, expanded.kind,
    expanded.sender_display_name, expanded.recipient_id, expanded.attempt_count;
end;
$$;

create or replace function public.finish_notification_outbox(
  p_outbox_id uuid,
  p_results jsonb,
  p_retry boolean,
  p_error_code text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_outbox public.notification_outbox;
  target_blast_id uuid;
  updated_delivery_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'worker authorization required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid delivery results' using errcode = '22023';
  end if;
  if jsonb_array_length(p_results) > 100 or exists (
    select 1
    from jsonb_array_elements(p_results) result
    where jsonb_typeof(result.value) is distinct from 'object'
      or coalesce(
        (result.value->>'deliveryId')
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        true
      )
      or coalesce(result.value->>'state' not in ('accepted', 'failed', 'invalid_token'), true)
      or not (result.value ? 'retry')
      or jsonb_typeof(result.value->'retry') is distinct from 'boolean'
      or char_length(coalesce(result.value->>'receiptId', '')) > 200
      or char_length(coalesce(result.value->>'errorCode', '')) > 80
  ) or (
    select count(*) <> count(distinct result.value->>'deliveryId')
    from jsonb_array_elements(p_results) result
  ) then
    raise exception 'invalid delivery results' using errcode = '22023';
  end if;
  if p_retry is distinct from coalesce(
    (select bool_or((result.value->>'retry')::boolean)
     from jsonb_array_elements(p_results) result),
    false
  ) then
    raise exception 'inconsistent delivery retry state' using errcode = '22023';
  end if;

  select * into target_outbox
  from public.notification_outbox
  where id = p_outbox_id
  for update;

  if target_outbox.id is null or target_outbox.processed_at is not null then
    return;
  end if;

  update public.notification_deliveries deliveries
  set
    state = case result.value->>'state'
      when 'accepted' then 'accepted'::public.recipient_delivery_state
      when 'invalid_token' then 'invalid_token'::public.recipient_delivery_state
      else 'failed'::public.recipient_delivery_state
    end,
    provider_receipt_id = nullif(result.value->>'receiptId', ''),
    terminal_error_code = nullif(result.value->>'errorCode', ''),
    next_attempt_at = case when (result.value->>'retry')::boolean
      then statement_timestamp() + make_interval(
        secs => least(3600, 15 * power(2, target_outbox.attempt_count - 1))::integer
      )
      else null
    end,
    last_attempted_at = statement_timestamp()
  from jsonb_array_elements(p_results) result
  where deliveries.id = (result.value->>'deliveryId')::uuid
    and deliveries.blast_recipient_id = target_outbox.blast_recipient_id;
  get diagnostics updated_delivery_count = row_count;
  if updated_delivery_count <> jsonb_array_length(p_results) then
    raise exception 'delivery results do not match claimed work' using errcode = '22023';
  end if;

  update public.devices devices
  set enabled = false
  from public.notification_deliveries deliveries,
       jsonb_array_elements(p_results) result
  where deliveries.id = (result.value->>'deliveryId')::uuid
    and deliveries.blast_recipient_id = target_outbox.blast_recipient_id
    and devices.id = deliveries.device_id
    and result.value->>'state' = 'invalid_token';

  update public.notification_outbox
  set
    locked_at = case when p_retry then null else locked_at end,
    available_at = case when p_retry
      then statement_timestamp() + make_interval(
        secs => least(3600, 15 * power(2, target_outbox.attempt_count - 1))::integer
      )
      else available_at
    end,
    processed_at = case when p_retry then null else statement_timestamp() end,
    last_error_code = p_error_code
  where id = p_outbox_id;

  select recipients.blast_id into target_blast_id
  from public.blast_recipients recipients
  where recipients.id = target_outbox.blast_recipient_id;

  update public.blast_recipients recipients
  set delivery_state = case
    when exists (
      select 1 from public.notification_deliveries deliveries
      where deliveries.blast_recipient_id = recipients.id
        and deliveries.state = 'accepted'
    ) then 'accepted'::public.recipient_delivery_state
    when p_retry then 'queued'::public.recipient_delivery_state
    else 'failed'::public.recipient_delivery_state
  end
  where recipients.id = target_outbox.blast_recipient_id;

  if not p_retry and not exists (
    select 1
    from public.notification_outbox outbox
    join public.blast_recipients recipients
      on recipients.id = outbox.blast_recipient_id
    where recipients.blast_id = target_blast_id
      and outbox.processed_at is null
  ) then
    update public.sunset_blasts blasts
    set
      status = case when exists (
        select 1
        from public.notification_deliveries deliveries
        join public.blast_recipients recipients
          on recipients.id = deliveries.blast_recipient_id
        where recipients.blast_id = target_blast_id
          and deliveries.state = 'accepted'
      ) then 'dispatched'::public.blast_status
      else 'failed_delivery'::public.blast_status
      end,
      dispatched_at = case when exists (
        select 1
        from public.notification_deliveries deliveries
        join public.blast_recipients recipients
          on recipients.id = deliveries.blast_recipient_id
        where recipients.blast_id = target_blast_id
          and deliveries.state = 'accepted'
      ) then statement_timestamp()
      else null
      end
    where blasts.id = target_blast_id and blasts.status = 'dispatching';
  end if;
end;
$$;

revoke all on function public.replace_contact_matches(text[], smallint, timestamptz)
  from public, anon;
revoke all on function public.register_device(text, public.device_platform, text)
  from public, anon;
revoke all on function public.assign_photo_upload_path(uuid, text)
  from public, anon;
revoke all on function public.dispatch_blast(uuid) from public, anon;
revoke all on function public.complete_photo_blast(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_blast_access(uuid) from public, anon;
revoke all on function public.claim_notification_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.finish_notification_outbox(uuid, jsonb, boolean, text)
  from public, anon, authenticated;

grant execute on function public.replace_contact_matches(text[], smallint, timestamptz)
  to authenticated;
grant execute on function public.register_device(text, public.device_platform, text)
  to authenticated;
grant execute on function public.assign_photo_upload_path(uuid, text)
  to authenticated;
grant execute on function public.dispatch_blast(uuid) to authenticated;
grant execute on function public.get_blast_access(uuid) to authenticated;
grant select on public.profiles, public.sunset_blasts, public.blast_recipients,
  public.devices, public.notification_outbox, public.notification_deliveries
  to service_role;
grant update on public.sunset_blasts, public.blast_recipients, public.devices,
  public.notification_outbox, public.notification_deliveries
  to service_role;
grant insert on public.notification_deliveries to service_role;
grant execute on function public.complete_photo_blast(uuid, text, text, text)
  to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.finish_notification_outbox(uuid, jsonb, boolean, text)
  to service_role;
