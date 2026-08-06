/** Live sensor reading parsed from an "ldr:X,motion:Y,led:Z" line. */
export interface Telemetry {
  lightLevel: number;      // raw LDR 0–1023
  motionDetected: boolean;
  ledBrightness: number;   // PWM 0–255
  at: number;              // Date.now() when parsed
}

/**
 * Automation config pushed to the Arduino as `SYNC:{...}`.
 * Shape matches exactly what usb-bridge.js used to send.
 */
export interface SyncConfig {
  manual_override: boolean;
  target_brightness: number | null; // PWM 0–255
  schedule_active: boolean;
  ldr_threshold: number | null;
  auto_dim_delay: number | null;    // minutes
}

export const defaultSyncConfig = (): SyncConfig => ({
  manual_override: false,
  target_brightness: null,
  schedule_active: true,
  ldr_threshold: null,
  auto_dim_delay: null,
});

/** A device row as returned by GET /api/devices. */
export interface DeviceRow {
  id: string;
  name: string;
  status: 'online' | 'offline';
  current_brightness: number;
  light_level: number;
  motion_detected: boolean;
  manual_override: boolean;
  target_brightness: number | null;
  schedule_start: string | null;
  schedule_end: string | null;
  ldr_threshold: number | null;
  auto_dim_delay: number | null;
  last_seen: string | null;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'viewer';
}

/** Connection lifecycle for the Bluetooth link. */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';
