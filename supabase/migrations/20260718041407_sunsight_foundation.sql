create schema if not exists extensions;
create schema if not exists private;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create type public.profile_status as enum (
  'pending',
  'active',
  'suspended',
  'deleted'
);

create type public.blast_kind as enum ('nudge', 'photo');

create type public.blast_status as enum (
  'draft',
  'uploading',
  'ready',
  'dispatching',
  'dispatched',
  'failed_invalid_input',
  'failed_upload',
  'failed_delivery'
);

create type public.recipient_delivery_state as enum (
  'pending',
  'queued',
  'accepted',
  'delivered',
  'failed',
  'invalid_token'
);

create type public.device_platform as enum ('ios', 'android');
create type public.location_source as enum ('foreground', 'background');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  status public.profile_status not null default 'pending',
  phone_hmac bytea,
  phone_hmac_version smallint,
  privacy_policy_version text,
  privacy_policy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length_check
    check (display_name is null or char_length(display_name) between 1 and 80),
  constraint profiles_phone_hmac_pair_check
    check (
      (phone_hmac is null and phone_hmac_version is null)
      or
      (octet_length(phone_hmac) = 32 and phone_hmac_version > 0)
    ),
  constraint profiles_active_onboarding_check
    check (
      status <> 'active'
      or (
        phone_hmac is not null
        and privacy_policy_version is not null
        and privacy_policy_accepted_at is not null
      )
    ),
  constraint profiles_privacy_acceptance_pair_check
    check (
      (privacy_policy_version is null and privacy_policy_accepted_at is null)
      or
      (privacy_policy_version is not null and privacy_policy_accepted_at is not null)
    )
);

create unique index profiles_phone_hmac_version_unique
  on public.profiles (phone_hmac_version, phone_hmac)
  where phone_hmac is not null;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  push_token text not null,
  platform public.device_platform not null,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_push_token_not_blank_check
    check (char_length(btrim(push_token)) > 0),
  constraint devices_app_version_not_blank_check
    check (app_version is null or char_length(btrim(app_version)) > 0)
);

create unique index devices_push_token_unique on public.devices (push_token);
create index devices_user_id_idx on public.devices (user_id);
create index devices_enabled_last_seen_idx
  on public.devices (enabled, last_seen_at desc)
  where enabled;

create table public.location_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  accuracy_m double precision not null,
  source public.location_source not null,
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_snapshots_accuracy_check
    check (accuracy_m > 0 and accuracy_m <= 100000),
  constraint location_snapshots_expiry_check
    check (expires_at > captured_at)
);

create index location_snapshots_location_gist
  on public.location_snapshots using gist (location);
create index location_snapshots_eligibility_idx
  on public.location_snapshots (expires_at, accuracy_m);

create table public.sunset_blasts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.blast_kind not null,
  status public.blast_status not null default 'draft',
  idempotency_key uuid not null,
  original_object_path text,
  display_object_path text,
  thumbnail_object_path text,
  capture_location extensions.geography(Point, 4326),
  captured_at timestamptz,
  expires_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  audience_selected_at timestamptz,
  constraint sunset_blasts_expiry_check
    check (expires_at > created_at),
  constraint sunset_blasts_nudge_media_check
    check (
      kind <> 'nudge'
      or (
        original_object_path is null
        and display_object_path is null
        and thumbnail_object_path is null
        and status not in ('uploading', 'failed_upload')
      )
    ),
  constraint sunset_blasts_photo_original_check
    check (
      kind <> 'photo'
      or status not in ('ready', 'dispatching', 'dispatched', 'failed_delivery')
      or original_object_path is not null
    ),
  constraint sunset_blasts_object_paths_check
    check (
      (original_object_path is null or char_length(btrim(original_object_path)) > 0)
      and (display_object_path is null or char_length(btrim(display_object_path)) > 0)
      and (thumbnail_object_path is null or char_length(btrim(thumbnail_object_path)) > 0)
    ),
  constraint sunset_blasts_dispatch_time_check
    check (
      (status = 'dispatched' and dispatched_at is not null)
      or status <> 'dispatched'
    )
);

create unique index sunset_blasts_sender_idempotency_unique
  on public.sunset_blasts (sender_id, idempotency_key);
create index sunset_blasts_sender_created_idx
  on public.sunset_blasts (sender_id, created_at desc);
create index sunset_blasts_active_expiry_idx
  on public.sunset_blasts (expires_at)
  where status in ('ready', 'dispatching', 'dispatched');
create index sunset_blasts_capture_location_gist
  on public.sunset_blasts using gist (capture_location);

create table public.blast_recipients (
  id uuid primary key default gen_random_uuid(),
  blast_id uuid not null references public.sunset_blasts (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  delivery_state public.recipient_delivery_state not null default 'pending',
  eligibility_version smallint not null,
  eligibility_reason text not null,
  first_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blast_recipients_eligibility_version_check
    check (eligibility_version > 0),
  constraint blast_recipients_eligibility_reason_check
    check (char_length(btrim(eligibility_reason)) > 0),
  constraint blast_recipients_blast_recipient_unique
    unique (blast_id, recipient_id)
);

create index blast_recipients_recipient_created_idx
  on public.blast_recipients (recipient_id, created_at desc);
create index blast_recipients_delivery_state_idx
  on public.blast_recipients (delivery_state, created_at)
  where delivery_state in ('pending', 'queued');

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_not_self_check check (blocker_id <> blocked_id),
  constraint blocks_pair_unique unique (blocker_id, blocked_id)
);

create index blocks_blocked_id_idx on public.blocks (blocked_id);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  blasts_enabled boolean not null default true,
  muted_until timestamptz,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_quiet_hours_check
    check (
      (quiet_hours_start is null and quiet_hours_end is null)
      or
      (quiet_hours_start is not null and quiet_hours_end is not null and timezone is not null)
    ),
  constraint notification_preferences_timezone_check
    check (timezone is null or char_length(btrim(timezone)) > 0)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  blast_recipient_id uuid not null
    references public.blast_recipients (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  state public.recipient_delivery_state not null default 'pending',
  attempt_count smallint not null default 0,
  next_attempt_at timestamptz,
  provider_receipt_id text,
  terminal_error_code text,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_attempt_count_check
    check (attempt_count >= 0),
  constraint notification_deliveries_recipient_device_unique
    unique (blast_recipient_id, device_id)
);

create index notification_deliveries_retry_idx
  on public.notification_deliveries (next_attempt_at)
  where state in ('pending', 'queued', 'failed');
create index notification_deliveries_device_id_idx
  on public.notification_deliveries (device_id);

create table public.app_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  value_json jsonb not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_config_key_check
    check (config_key ~ '^[a-z][a-z0-9_]*$'),
  constraint app_config_description_check
    check (char_length(btrim(description)) > 0),
  constraint app_config_supported_key_check
    check (
      config_key in (
        'proximity_radius_m',
        'location_ttl_seconds',
        'max_location_accuracy_m',
        'blast_cooldown_seconds',
        'blast_visibility_seconds',
        'recipient_cap'
      )
    ),
  constraint app_config_integer_value_check
    check (
      jsonb_typeof(value_json) = 'number'
      and (value_json #>> '{}') ~ '^[0-9]+$'
    ),
  constraint app_config_value_range_check
    check (
      case config_key
        when 'proximity_radius_m' then (value_json #>> '{}')::bigint between 100 and 100000
        when 'location_ttl_seconds' then (value_json #>> '{}')::bigint between 60 and 86400
        when 'max_location_accuracy_m' then (value_json #>> '{}')::bigint between 1 and 10000
        when 'blast_cooldown_seconds' then (value_json #>> '{}')::bigint between 1 and 86400
        when 'blast_visibility_seconds' then (value_json #>> '{}')::bigint between 60 and 86400
        when 'recipient_cap' then (value_json #>> '{}')::bigint between 1 and 1000
        else false
      end
    )
);

create table public.contact_matches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  matched_user_id uuid not null references public.profiles (id) on delete cascade,
  hmac_version smallint not null,
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint contact_matches_not_self_check
    check (owner_user_id <> matched_user_id),
  constraint contact_matches_hmac_version_check
    check (hmac_version > 0),
  constraint contact_matches_expiry_check
    check (expires_at > consented_at),
  constraint contact_matches_pair_unique
    unique (owner_user_id, matched_user_id)
);

create index contact_matches_matched_user_id_idx
  on public.contact_matches (matched_user_id);
create index contact_matches_owner_expiry_idx
  on public.contact_matches (owner_user_id, expires_at, matched_user_id);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  blast_recipient_id uuid not null unique
    references public.blast_recipients (id) on delete cascade,
  event_type text not null default 'blast_notification',
  available_at timestamptz not null default now(),
  attempt_count smallint not null default 0,
  locked_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_event_type_check
    check (event_type = 'blast_notification'),
  constraint notification_outbox_attempt_count_check
    check (attempt_count >= 0),
  constraint notification_outbox_processed_lock_check
    check (processed_at is null or locked_at is not null)
);

create index notification_outbox_ready_idx
  on public.notification_outbox (available_at, created_at)
  where processed_at is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger devices_set_updated_at
before update on public.devices
for each row execute function private.set_updated_at();

create trigger location_snapshots_set_updated_at
before update on public.location_snapshots
for each row execute function private.set_updated_at();

create trigger sunset_blasts_set_updated_at
before update on public.sunset_blasts
for each row execute function private.set_updated_at();

create trigger blast_recipients_set_updated_at
before update on public.blast_recipients
for each row execute function private.set_updated_at();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function private.set_updated_at();

create trigger app_config_set_updated_at
before update on public.app_config
for each row execute function private.set_updated_at();

create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function private.set_updated_at();

create or replace function private.get_config_int(p_config_key text)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  config_value bigint;
begin
  select (app_config.value_json #>> '{}')::bigint
    into config_value
  from public.app_config
  where app_config.config_key = p_config_key;

  if config_value is null then
    raise exception 'required app configuration is missing: %', p_config_key
      using errcode = '55000';
  end if;

  return config_value;
end;
$$;

create or replace function private.enforce_recipient_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_at timestamptz;
begin
  select sunset_blasts.audience_selected_at
    into selected_at
  from public.sunset_blasts
  where sunset_blasts.id = coalesce(new.blast_id, old.blast_id);

  if selected_at is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' or tg_op = 'DELETE' then
    raise exception 'recipient audience is immutable after selection'
      using errcode = '55000';
  end if;

  if new.blast_id is distinct from old.blast_id
    or new.recipient_id is distinct from old.recipient_id
    or new.eligibility_version is distinct from old.eligibility_version
    or new.eligibility_reason is distinct from old.eligibility_reason
    or new.created_at is distinct from old.created_at
  then
    raise exception 'recipient eligibility snapshot is immutable after selection'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger blast_recipients_enforce_snapshot
before insert or update or delete on public.blast_recipients
for each row execute function private.enforce_recipient_snapshot();

create or replace function private.bootstrap_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, status)
  values (new.id, 'pending');
  return new;
end;
$$;

create trigger auth_user_bootstrap_profile
after insert on auth.users
for each row execute function private.bootstrap_profile();

create or replace function private.finalize_verified_profile(
  p_privacy_policy_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  verified_phone text;
  hmac_secret text;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_privacy_policy_version is null
    or char_length(btrim(p_privacy_policy_version)) = 0
    or char_length(p_privacy_policy_version) > 80
  then
    raise exception 'privacy policy acceptance is required'
      using errcode = '22023';
  end if;

  select users.phone
    into verified_phone
  from auth.users
  where users.id = caller_id
    and users.phone_confirmed_at is not null;

  if verified_phone is null then
    raise exception 'verified phone required' using errcode = '28000';
  end if;

  -- GoTrue stores E.164 without a leading '+'. Contact matching and HMAC use
  -- the canonical '+1…' form, so normalize before the contract check.
  if left(verified_phone, 1) <> '+' then
    verified_phone := '+' || verified_phone;
  end if;

  if verified_phone !~ '^\+1[0-9]{10}$' then
    raise exception 'verified phone is outside the supported E.164 contract'
      using errcode = '22023';
  end if;

  select decrypted_secrets.decrypted_secret
    into hmac_secret
  from vault.decrypted_secrets
  where decrypted_secrets.name = 'PHONE_HMAC_SECRET'
  order by decrypted_secrets.updated_at desc
  limit 1;

  if hmac_secret is null or octet_length(hmac_secret) < 32 then
    raise exception 'phone HMAC secret is not provisioned'
      using errcode = '55000';
  end if;

  update public.profiles
  set
    phone_hmac = extensions.hmac(verified_phone, hmac_secret, 'sha256'),
    phone_hmac_version = 1,
    privacy_policy_version = btrim(p_privacy_policy_version),
    privacy_policy_accepted_at = statement_timestamp(),
    status = 'active'
  where id = caller_id;

  if not found then
    raise exception 'profile bootstrap is missing' using errcode = '55000';
  end if;

  return;
end;
$$;

create or replace function public.finalize_verified_profile(
  p_privacy_policy_version text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.finalize_verified_profile(p_privacy_policy_version);
$$;

create or replace function public.upsert_location_snapshot(
  p_longitude double precision,
  p_latitude double precision,
  p_accuracy_m double precision,
  p_captured_at timestamptz,
  p_source public.location_source default 'foreground'
)
returns public.location_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  ttl_seconds bigint;
  result public.location_snapshots;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_source <> 'foreground' then
    raise exception 'only foreground location is supported'
      using errcode = '22023';
  end if;

  if p_longitude not between -180 and 180
    or p_latitude not between -90 and 90
    or p_accuracy_m <= 0
    or p_accuracy_m > 100000
  then
    raise exception 'invalid location snapshot' using errcode = '22023';
  end if;

  ttl_seconds := private.get_config_int('location_ttl_seconds');

  if p_captured_at > statement_timestamp() + interval '5 minutes'
    or p_captured_at <= statement_timestamp() - make_interval(secs => ttl_seconds::integer)
  then
    raise exception 'location capture time is outside the accepted window'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = caller_id
      and profiles.status = 'active'
  ) then
    raise exception 'active profile required' using errcode = '28000';
  end if;

  insert into public.location_snapshots (
    user_id,
    location,
    accuracy_m,
    source,
    captured_at,
    expires_at
  )
  values (
    caller_id,
    extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude),
      4326
    )::extensions.geography,
    p_accuracy_m,
    p_source,
    p_captured_at,
    p_captured_at + make_interval(secs => ttl_seconds::integer)
  )
  on conflict (user_id) do update
  set
    location = excluded.location,
    accuracy_m = excluded.accuracy_m,
    source = excluded.source,
    captured_at = excluded.captured_at,
    expires_at = excluded.expires_at
  where excluded.captured_at >= public.location_snapshots.captured_at
  returning * into result;

  if result.id is null then
    select *
      into result
    from public.location_snapshots
    where location_snapshots.user_id = caller_id;
  end if;

  return result;
end;
$$;

create or replace function public.create_blast(
  p_kind public.blast_kind,
  p_idempotency_key uuid,
  p_timezone text,
  p_expires_at timestamptz default null
)
returns public.sunset_blasts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_status public.profile_status;
  cooldown_seconds bigint;
  visibility_seconds bigint;
  max_accuracy_m bigint;
  sender_location public.location_snapshots;
  existing_blast public.sunset_blasts;
  result public.sunset_blasts;
  normalized_timezone text;
  next_local_midnight timestamptz;
  server_expires_at timestamptz;
  final_expires_at timestamptz;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  normalized_timezone := btrim(p_timezone);
  if normalized_timezone is null
    or char_length(normalized_timezone) = 0
    or char_length(normalized_timezone) > 80
  then
    raise exception 'blast timezone is invalid' using errcode = '22023';
  end if;

  begin
    perform statement_timestamp() at time zone normalized_timezone;
  exception
    when others then
      raise exception 'blast timezone is invalid' using errcode = '22023';
  end;

  select profiles.status
    into caller_status
  from public.profiles
  where profiles.id = caller_id
  for update;

  if caller_status is distinct from 'active' then
    raise exception 'active profile required' using errcode = '28000';
  end if;

  select *
    into existing_blast
  from public.sunset_blasts
  where sunset_blasts.sender_id = caller_id
    and sunset_blasts.idempotency_key = p_idempotency_key;

  if existing_blast.id is not null then
    return existing_blast;
  end if;

  cooldown_seconds := private.get_config_int('blast_cooldown_seconds');
  visibility_seconds := private.get_config_int('blast_visibility_seconds');
  max_accuracy_m := private.get_config_int('max_location_accuracy_m');

  next_local_midnight := (
    date_trunc('day', statement_timestamp() at time zone normalized_timezone)
      + interval '1 day'
  ) at time zone normalized_timezone;

  server_expires_at := least(
    statement_timestamp() + make_interval(secs => visibility_seconds::integer),
    next_local_midnight
  );

  if p_expires_at is null then
    final_expires_at := server_expires_at;
  elsif p_expires_at <= statement_timestamp() then
    raise exception 'blast expiry is outside the accepted visibility window'
      using errcode = '22023';
  else
    -- Client hint may shorten visibility; never extend past server authority.
    final_expires_at := least(p_expires_at, server_expires_at);
  end if;

  if final_expires_at <= statement_timestamp() then
    raise exception 'blast expiry is outside the accepted visibility window'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.sunset_blasts
    where sunset_blasts.sender_id = caller_id
      and sunset_blasts.created_at
        > statement_timestamp() - make_interval(secs => cooldown_seconds::integer)
      and sunset_blasts.status in (
        'draft',
        'uploading',
        'ready',
        'dispatching',
        'dispatched'
      )
  ) then
    raise exception 'blast cooldown is active'
      using errcode = 'P0001', hint = 'BLAST_RATE_LIMITED';
  end if;

  select *
    into sender_location
  from public.location_snapshots
  where location_snapshots.user_id = caller_id
    and location_snapshots.expires_at > statement_timestamp()
    and location_snapshots.accuracy_m <= max_accuracy_m
  for share;

  if sender_location.id is null then
    raise exception 'fresh accurate location required'
      using errcode = '22023';
  end if;

  insert into public.sunset_blasts (
    sender_id,
    kind,
    status,
    idempotency_key,
    capture_location,
    captured_at,
    expires_at
  )
  values (
    caller_id,
    p_kind,
    case
      when p_kind = 'nudge' then 'ready'::public.blast_status
      else 'uploading'::public.blast_status
    end,
    p_idempotency_key,
    sender_location.location,
    statement_timestamp(),
    final_expires_at
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.select_and_persist_recipients(p_blast_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_blast public.sunset_blasts;
  radius_m bigint;
  ttl_seconds bigint;
  max_accuracy_m bigint;
  recipient_limit bigint;
  persisted_count integer;
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role'
  );
begin
  select *
    into target_blast
  from public.sunset_blasts
  where sunset_blasts.id = p_blast_id
  for update;

  if target_blast.id is null then
    raise exception 'blast not found' using errcode = 'P0002';
  end if;

  if caller_id is null then
    if jwt_role is distinct from 'service_role'
      and current_user is distinct from 'service_role'
    then
      raise exception 'authentication required' using errcode = '28000';
    end if;
    caller_id := target_blast.sender_id;
  elsif target_blast.sender_id <> caller_id then
    raise exception 'blast not found' using errcode = 'P0002';
  end if;

  if target_blast.audience_selected_at is not null then
    select count(*)::integer
      into persisted_count
    from public.blast_recipients
    where blast_recipients.blast_id = p_blast_id;
    return persisted_count;
  end if;

  if target_blast.status <> 'ready'
    or target_blast.expires_at <= statement_timestamp()
    or target_blast.capture_location is null
  then
    raise exception 'blast is not eligible for recipient selection'
      using errcode = '55000';
  end if;

  radius_m := private.get_config_int('proximity_radius_m');
  ttl_seconds := private.get_config_int('location_ttl_seconds');
  max_accuracy_m := private.get_config_int('max_location_accuracy_m');
  recipient_limit := private.get_config_int('recipient_cap');

  with eligible as (
    select contact_matches.matched_user_id
    from public.contact_matches
    join public.profiles recipient_profile
      on recipient_profile.id = contact_matches.matched_user_id
      and recipient_profile.status = 'active'
    join public.location_snapshots recipient_location
      on recipient_location.user_id = contact_matches.matched_user_id
      and recipient_location.captured_at
        > statement_timestamp() - make_interval(secs => ttl_seconds::integer)
      and recipient_location.expires_at > statement_timestamp()
      and recipient_location.accuracy_m <= max_accuracy_m
    left join public.notification_preferences preferences
      on preferences.user_id = contact_matches.matched_user_id
    where contact_matches.owner_user_id = caller_id
      and contact_matches.expires_at > statement_timestamp()
      and coalesce(preferences.blasts_enabled, true)
      and (
        preferences.muted_until is null
        or preferences.muted_until <= statement_timestamp()
      )
      and extensions.st_dwithin(
        recipient_location.location,
        target_blast.capture_location,
        radius_m
      )
      and not exists (
        select 1
        from public.blocks
        where (
          blocks.blocker_id = caller_id
          and blocks.blocked_id = contact_matches.matched_user_id
        ) or (
          blocks.blocker_id = contact_matches.matched_user_id
          and blocks.blocked_id = caller_id
        )
      )
    order by contact_matches.matched_user_id
    limit recipient_limit
  ),
  inserted as (
    insert into public.blast_recipients (
      blast_id,
      recipient_id,
      delivery_state,
      eligibility_version,
      eligibility_reason
    )
    select
      p_blast_id,
      eligible.matched_user_id,
      'queued',
      1,
      'one_way_contact_nearby_v1'
    from eligible
    on conflict (blast_id, recipient_id) do nothing
    returning id
  )
  insert into public.notification_outbox (blast_recipient_id)
  select inserted.id
  from inserted;

  update public.sunset_blasts
  set
    audience_selected_at = statement_timestamp(),
    status = 'dispatching'
  where sunset_blasts.id = p_blast_id;

  select count(*)::integer
    into persisted_count
  from public.blast_recipients
  where blast_recipients.blast_id = p_blast_id;

  return persisted_count;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.bootstrap_profile() from public, anon, authenticated;
revoke all on function private.finalize_verified_profile(text)
  from public, anon, authenticated;
revoke all on function private.get_config_int(text) from public, anon, authenticated;
revoke all on function private.enforce_recipient_snapshot() from public, anon, authenticated;
revoke all on function public.finalize_verified_profile(text) from public, anon;
revoke all on function public.upsert_location_snapshot(
  double precision,
  double precision,
  double precision,
  timestamptz,
  public.location_source
) from public, anon;
revoke all on function public.create_blast(
  public.blast_kind,
  uuid,
  text,
  timestamptz
) from public, anon;
revoke all on function public.select_and_persist_recipients(uuid)
  from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.finalize_verified_profile(text) to authenticated;
grant execute on function public.finalize_verified_profile(text) to authenticated;
grant execute on function public.upsert_location_snapshot(
  double precision,
  double precision,
  double precision,
  timestamptz,
  public.location_source
) to authenticated;
grant execute on function public.create_blast(
  public.blast_kind,
  uuid,
  text,
  timestamptz
) to authenticated;
grant execute on function public.select_and_persist_recipients(uuid)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sunset-photos',
  'sunset-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.location_snapshots enable row level security;
alter table public.sunset_blasts enable row level security;
alter table public.blast_recipients enable row level security;
alter table public.blocks enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.app_config enable row level security;
alter table public.contact_matches enable row level security;
alter table public.notification_outbox enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy location_snapshots_select_own
on public.location_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy sunset_blasts_select_own
on public.sunset_blasts
for select
to authenticated
using ((select auth.uid()) = sender_id);

create policy blocks_select_own
on public.blocks
for select
to authenticated
using ((select auth.uid()) = blocker_id);

create policy blocks_insert_own
on public.blocks
for insert
to authenticated
with check ((select auth.uid()) = blocker_id);

create policy blocks_delete_own
on public.blocks
for delete
to authenticated
using ((select auth.uid()) = blocker_id);

create policy notification_preferences_select_own
on public.notification_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notification_preferences_insert_own
on public.notification_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy notification_preferences_update_own
on public.notification_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on all tables in schema public from anon, authenticated;
grant select (id, display_name, status, privacy_policy_version,
  privacy_policy_accepted_at, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.location_snapshots to authenticated;
grant select on public.sunset_blasts to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.notification_preferences to authenticated;
grant update (blasts_enabled, muted_until, quiet_hours_start, quiet_hours_end, timezone)
  on public.notification_preferences to authenticated;

create policy sunset_photos_deny_select
on storage.objects
for select
to authenticated
using (bucket_id = 'sunset-photos' and false);

create policy sunset_photos_deny_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'sunset-photos' and false);

create policy sunset_photos_deny_update
on storage.objects
for update
to authenticated
using (bucket_id = 'sunset-photos' and false)
with check (bucket_id = 'sunset-photos' and false);

create policy sunset_photos_deny_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'sunset-photos' and false);

insert into public.app_config (config_key, value_json, description)
values
  ('proximity_radius_m', '1609'::jsonb, 'Recipient proximity radius in meters'),
  ('location_ttl_seconds', '14400'::jsonb, 'Maximum location snapshot age'),
  ('max_location_accuracy_m', '500'::jsonb, 'Maximum accepted location accuracy'),
  ('blast_cooldown_seconds', '1800'::jsonb, 'Shared sender cooldown across blast kinds'),
  ('blast_visibility_seconds', '14400'::jsonb, 'Maximum blast visibility after capture'),
  ('recipient_cap', '100'::jsonb, 'Maximum recipients persisted per blast')
on conflict (config_key) do update
set
  value_json = excluded.value_json,
  description = excluded.description;

comment on function public.finalize_verified_profile(text) is
  'Finalizes only the authenticated caller after phone confirmation and privacy acceptance, using the versioned PHONE_HMAC_SECRET from Vault.';
comment on table public.blast_recipients is
  'Server-owned immutable recipient snapshot; direct client access is intentionally denied.';
comment on table public.location_snapshots is
  'Current coarse location per user; only the owner may read the row directly.';
comment on table public.contact_matches is
  'Server-owned one-way contact graph containing matched user identifiers only; raw numbers and contact HMACs are never persisted.';
comment on table public.notification_outbox is
  'Transactional outbox populated in the same transaction that freezes a blast audience.';
