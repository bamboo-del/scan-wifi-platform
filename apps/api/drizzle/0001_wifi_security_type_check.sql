DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wifi_configs_security_type_check'
      AND conrelid = 'public.wifi_configs'::regclass
  ) THEN
    ALTER TABLE public.wifi_configs
      ADD CONSTRAINT wifi_configs_security_type_check
      CHECK (security_type IN ('WPA', 'WPA2', 'WPA3', 'WPA2_WPA3', 'WEP', 'OPEN'));
  END IF;
END
$$;
