DROP TABLE IF EXISTS device_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table for real authentication (signup/login/google)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT, -- Nullable for Google Auth users
  google_id     VARCHAR(255) UNIQUE,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer', -- 'admin' or 'viewer'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device/sensor logs. In the current phase the dashboard itself is
-- "Coming Soon", but this table lets the public Stats section be
-- genuinely DB-driven rather than hard-coded.
CREATE TABLE IF NOT EXISTS device_logs (
  id              SERIAL PRIMARY KEY,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  light_level     INTEGER,           -- 0-1023 raw LDR analog reading
  motion_detected BOOLEAN NOT NULL DEFAULT FALSE,
  led_brightness  INTEGER,           -- 0-255 PWM duty cycle
  baseline_brightness INTEGER DEFAULT 255, -- brightness if no smart logic applied (for energy-saved calc)
  is_online       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_device_logs_recorded_at ON device_logs (recorded_at);

-- Devices table to track individual street light zones
CREATE TABLE IF NOT EXISTS devices (
  id                  VARCHAR(50) PRIMARY KEY, -- e.g., 'zone-a'
  name                VARCHAR(100) NOT NULL,
  status              VARCHAR(20) DEFAULT 'offline', -- 'online' or 'offline'
  current_brightness  INTEGER DEFAULT 0,
  light_level         INTEGER DEFAULT 0,       -- raw LDR reading (0-1023)
  motion_detected     BOOLEAN DEFAULT FALSE,
  manual_override     BOOLEAN DEFAULT FALSE,
  last_seen           TIMESTAMPTZ DEFAULT NOW()
);

-- System Settings table (only one row expected, id=1)
CREATE TABLE IF NOT EXISTS system_settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  ldr_threshold       INTEGER NOT NULL DEFAULT 150,
  pir_timeout         INTEGER NOT NULL DEFAULT 30,
  global_override     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings row if it doesn't exist
INSERT INTO system_settings (id, ldr_threshold, pir_timeout, global_override)
VALUES (1, 150, 30, false)
ON CONFLICT (id) DO NOTHING;

-- Insert default mock devices if they don't exist
INSERT INTO devices (id, name, status, current_brightness, motion_detected)
VALUES 
  ('zone-a', 'Zone A - Main Street', 'online', 60, false),
  ('zone-b', 'Zone B - Park Path', 'online', 255, true),
  ('zone-c', 'Zone C - West Avenue', 'offline', 0, false)
ON CONFLICT (id) DO NOTHING;
