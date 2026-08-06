/**
 * The wire protocol spoken over the serial/Bluetooth link.
 *
 * This is a direct port of the parsing logic in backend/usb-bridge.js, so the
 * Arduino sketch does not have to change at all — the phone simply speaks what
 * the USB bridge used to speak.
 *
 *   Arduino → "ldr:160,motion:0,led:50"   (telemetry)
 *   Arduino → "SYNC_REQUEST"              (config poll)
 *   Phone   → "SYNC:{...json...}"         (config push)
 */
import type { SyncConfig, Telemetry } from '../types';

export const SYNC_REQUEST = 'SYNC_REQUEST';

/** True if the Arduino is asking us for its automation config. */
export function isSyncRequest(line: string): boolean {
  return line.trim() === SYNC_REQUEST;
}

/** Build the "SYNC:{json}" line the Arduino expects. */
export function buildSyncLine(config: SyncConfig): string {
  return `SYNC:${JSON.stringify(config)}`;
}

/**
 * Parse a raw telemetry line into a Telemetry object, or null if it isn't one.
 * Accepts both the CSV form ("ldr:160,motion:0,led:50") and a JSON object,
 * mirroring usb-bridge.js's dual-format tolerance.
 */
export function parseTelemetry(raw: string): Telemetry | null {
  const line = raw.trim();
  if (!line || isSyncRequest(line)) return null;

  let obj: Record<string, unknown> | null = null;

  // 1. Try JSON.
  if (line.startsWith('{')) {
    try {
      obj = JSON.parse(line);
    } catch {
      obj = null;
    }
  }

  // 2. Fall back to comma-separated key:value pairs.
  if (!obj) {
    const parsed: Record<string, unknown> = {};
    for (const pair of line.split(',')) {
      const idx = pair.indexOf(':');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (!key || val === '') continue;
      const low = val.toLowerCase();
      if (low === 'true' || val === '1') parsed[key] = true;
      else if (low === 'false' || val === '0') parsed[key] = false;
      else if (!Number.isNaN(Number(val))) parsed[key] = Number(val);
      else parsed[key] = val;
    }
    if (Object.keys(parsed).length > 0) obj = parsed;
  }

  if (!obj) return null;

  // Accept both the long keys (lightLevel/…) and the short Arduino keys (ldr/…).
  const pick = (a: string, b: string) => (obj![a] !== undefined ? obj![a] : obj![b]);

  const lightLevel = Number(pick('lightLevel', 'ldr') ?? 0);
  const ledBrightness = Number(pick('ledBrightness', 'led') ?? 0);
  const motionRaw = pick('motionDetected', 'motion');

  // A line with none of the expected fields isn't telemetry.
  if (
    obj['lightLevel'] === undefined && obj['ldr'] === undefined &&
    obj['ledBrightness'] === undefined && obj['led'] === undefined
  ) {
    return null;
  }

  return {
    lightLevel: Number.isNaN(lightLevel) ? 0 : lightLevel,
    ledBrightness: Number.isNaN(ledBrightness) ? 0 : ledBrightness,
    motionDetected: motionRaw === true || motionRaw === 1 || motionRaw === '1',
    at: Date.now(),
  };
}
