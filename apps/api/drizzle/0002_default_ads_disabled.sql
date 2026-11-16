INSERT INTO system_settings (key, value, updated_at)
VALUES ('global_ad_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO UPDATE
SET value = 'false'::jsonb,
    updated_at = now();
