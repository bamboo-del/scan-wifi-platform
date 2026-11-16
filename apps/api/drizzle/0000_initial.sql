CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE admin_status AS ENUM ('active', 'disabled');
CREATE TYPE store_status AS ENUM ('active', 'disabled');
CREATE TYPE wifi_status AS ENUM ('active', 'disabled');
CREATE TYPE qr_code_status AS ENUM ('active', 'disabled');
CREATE TYPE connection_event_type AS ENUM ('page_view', 'ad_load_success', 'ad_load_failure', 'connect_click', 'connect_success', 'connect_failure');
CREATE TYPE client_platform AS ENUM ('ios', 'android', 'devtools', 'unknown');

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  status admin_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX admins_username_lower_uidx ON admins (lower(username));
CREATE INDEX admins_status_idx ON admins (status);

CREATE TABLE admin_sessions (
  token_hash text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions (expires_at);

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  logo_url text,
  address text,
  contact_name text,
  contact_phone text,
  notes text,
  status store_status NOT NULL DEFAULT 'active',
  ad_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stores_status_created_at_idx ON stores (status, created_at DESC);
CREATE INDEX stores_created_at_idx ON stores (created_at DESC);

CREATE TABLE wifi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ssid text NOT NULL,
  encrypted_password text NOT NULL,
  password_iv text NOT NULL,
  password_auth_tag text NOT NULL,
  bssid text,
  security_type text CONSTRAINT wifi_configs_security_type_check CHECK (security_type IN ('WPA', 'WPA2', 'WPA3', 'WPA2_WPA3', 'WEP', 'OPEN')),
  status wifi_status NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1 CONSTRAINT wifi_configs_version_check CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wifi_configs_store_id_uidx ON wifi_configs (store_id);
CREATE INDEX wifi_configs_status_idx ON wifi_configs (status);

CREATE TABLE qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  scene_token text NOT NULL CONSTRAINT qr_codes_scene_token_check CHECK (scene_token ~ '^[a-f0-9]{32}$'),
  image_url text NOT NULL,
  provider text NOT NULL CONSTRAINT qr_codes_provider_check CHECK (provider IN ('wechat', 'local-placeholder')),
  status qr_code_status NOT NULL DEFAULT 'active',
  generated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE UNIQUE INDEX qr_codes_scene_token_uidx ON qr_codes (scene_token);
CREATE INDEX qr_codes_store_status_generated_idx ON qr_codes (store_id, status, generated_at DESC);
CREATE UNIQUE INDEX qr_codes_one_active_per_store_uidx ON qr_codes (store_id) WHERE status = 'active';

CREATE TABLE connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  qr_code_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL,
  event_type connection_event_type NOT NULL,
  platform client_platform NOT NULL DEFAULT 'unknown',
  error_code text,
  error_message_sanitized text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_events_failure_error_check CHECK (event_type = 'connect_failure' OR (error_code IS NULL AND error_message_sanitized IS NULL))
);
CREATE INDEX connection_events_store_occurred_idx ON connection_events (store_id, occurred_at DESC);
CREATE INDEX connection_events_type_occurred_idx ON connection_events (event_type, occurred_at DESC);
CREATE INDEX connection_events_qr_code_id_idx ON connection_events (qr_code_id);
CREATE INDEX connection_events_occurred_at_idx ON connection_events (occurred_at DESC);
CREATE INDEX connection_events_failure_error_idx ON connection_events (store_id, error_code, occurred_at DESC) WHERE event_type = 'connect_failure';

CREATE TABLE operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  sanitized_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operation_logs_admin_created_idx ON operation_logs (admin_id, created_at DESC);
CREATE INDEX operation_logs_resource_created_idx ON operation_logs (resource_type, resource_id, created_at DESC);
CREATE INDEX operation_logs_action_created_idx ON operation_logs (action, created_at DESC);

CREATE TABLE system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_settings (key, value) VALUES ('global_ad_enabled', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;
