-- GoTrue persists auth.users.phone without a leading '+'. Finalization must
-- normalize to canonical +1 E.164 before the contract check and HMAC.

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
