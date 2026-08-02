insert into public.app_config (config_key, value_json, description)
values
  ('proximity_radius_m', '32180'::jsonb, 'Recipient proximity radius in meters'),
  ('location_ttl_seconds', '14400'::jsonb, 'Maximum location snapshot age'),
  ('max_location_accuracy_m', '500'::jsonb, 'Maximum accepted location accuracy'),
  ('blast_cooldown_seconds', '1800'::jsonb, 'Shared sender cooldown across blast kinds'),
  ('blast_visibility_seconds', '14400'::jsonb, 'Maximum blast visibility after capture'),
  ('recipient_cap', '100'::jsonb, 'Maximum recipients persisted per blast')
on conflict (config_key) do update
set
  value_json = excluded.value_json,
  description = excluded.description;
