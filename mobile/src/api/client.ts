/**
 * Thin client over the existing Express backend. The phone is now the "bridge"
 * that usb-bridge.js used to be, so it hits the very same endpoints:
 *
 *   POST /api/devices/telemetry     ← relay each reading (no auth)
 *   GET  /api/devices/sync/:id       ← pull automation config (no auth)
 *   POST /api/auth/login             ← admin login (to change config)
 *   GET  /api/auth/me                ← who am I
 *   GET  /api/devices                ← device list (for the dashboard)
 *   POST /api/devices/:id/override   ← admin: brightness override
 *   PUT  /api/devices/:id/config     ← admin: automation config
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import type { AuthUser, DeviceRow, SyncConfig, Telemetry } from '../types';
import { defaultSyncConfig } from '../types';

const TOKEN_KEY = 'islc.token';

let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

export function getToken(): string | null {
  return token;
}

async function setToken(value: string | null) {
  token = value;
  if (value) await AsyncStorage.setItem(TOKEN_KEY, value);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
    }
    // Some endpoints return no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function login(
  identifier: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const data = await req<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  await setToken(data.token);
  return data;
}

export async function me(): Promise<AuthUser | null> {
  if (!token) return null;
  try {
    const data = await req<{ user: AuthUser }>('/api/auth/me');
    return data.user;
  } catch {
    await setToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  await setToken(null);
}

// ── Devices ───────────────────────────────────────────────────────────────────
export async function getDevices(): Promise<DeviceRow[]> {
  return req<DeviceRow[]>('/api/devices');
}

export async function postTelemetry(
  deviceId: string,
  t: Telemetry,
): Promise<void> {
  await req('/api/devices/telemetry', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      lightLevel: t.lightLevel,
      motionDetected: t.motionDetected,
      ledBrightness: t.ledBrightness,
    }),
  });
}

/**
 * Pull the automation config for a device and normalise it into the exact
 * SYNC payload the Arduino expects (same merge usb-bridge.js did: device
 * config wins, falling back to global settings / firmware defaults).
 */
export async function getSync(deviceId: string): Promise<SyncConfig> {
  const body = await req<{
    settings?: { ldr_threshold?: number };
    device?: Partial<SyncConfig>;
  }>(`/api/devices/sync/${deviceId}`);

  const d = body.device ?? {};
  return {
    manual_override: d.manual_override ?? false,
    target_brightness: d.target_brightness ?? null,
    schedule_active: d.schedule_active ?? true,
    ldr_threshold: d.ldr_threshold ?? null,
    auto_dim_delay: d.auto_dim_delay ?? null,
  };
}

export async function setOverride(
  deviceId: string,
  manualOverride: boolean,
  targetBrightnessPwm: number | null,
): Promise<void> {
  await req(`/api/devices/${deviceId}/override`, {
    method: 'POST',
    body: JSON.stringify({
      manual_override: manualOverride,
      target_brightness: manualOverride ? targetBrightnessPwm : null,
    }),
  });
}

export interface ConfigPatch {
  schedule_start: string | null;
  schedule_end: string | null;
  ldr_threshold: number | null;
  auto_dim_delay: number | null;
}

export async function setConfig(
  deviceId: string,
  patch: ConfigPatch,
): Promise<void> {
  await req(`/api/devices/${deviceId}/config`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export { defaultSyncConfig };
