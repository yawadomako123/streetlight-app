/**
 * Runtime configuration. Values come from EXPO_PUBLIC_* env vars (set in a
 * `.env` file at the mobile/ root) with sensible fallbacks for development.
 *
 * See .env.example for what to put where.
 */

// Backend base URL.
//  • Android emulator  → the host machine is reachable at 10.0.2.2
//  • Real phone        → use your PC's LAN IP, e.g. http://192.168.1.20:4000
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

// The device id this app relays telemetry under. Must match what the
// dashboard/database expect (default matches the USB bridge default).
export const DEVICE_ID = process.env.EXPO_PUBLIC_DEVICE_ID ?? 'arduino-uno';

// How the app gets its data:
//   'backend'   → read telemetry from the Express backend over WiFi/internet
//                 (used with the ESP32, which posts straight to the backend).
//   'bluetooth' → connect directly to an HC-05 module over Bluetooth Classic.
// Default is 'backend' now that the ESP32 handles its own WiFi uplink.
export const CONNECTION_MODE: 'backend' | 'bluetooth' =
  (process.env.EXPO_PUBLIC_CONNECTION_MODE as 'backend' | 'bluetooth') ?? 'backend';

// When true, use the in-memory MockTransport instead of real Bluetooth.
// Lets you run the whole UI in Expo Go / an emulator with no hardware.
export const USE_MOCK_BT =
  (process.env.EXPO_PUBLIC_USE_MOCK_BT ?? 'false').toLowerCase() === 'true';

// If false, the app never calls the backend — it answers the Arduino's
// SYNC_REQUEST from local config only (fully-offline direct-BT mode).
export const RELAY_TO_BACKEND =
  (process.env.EXPO_PUBLIC_RELAY_TO_BACKEND ?? 'true').toLowerCase() === 'true';
