// Watches device last_seen and pushes a notification when a light goes offline
// (lost power / WiFi) and when it comes back. Runs on an interval.
//
// Caveat: on Render's free tier the server sleeps when idle, so this only runs
// while the ESP32 is posting (which keeps the server awake). For rock-solid
// offline detection use an always-on tier or an external cron ping.
import pool from '../db/pool.js';
import { sendPushToAll } from './notifier.js';

const OFFLINE_AFTER_MS = 20000; // no reading for 20s = offline (ESP32 posts ~2×/s)
const CHECK_EVERY_MS   = 15000;

const onlineState = new Map(); // deviceId -> boolean

const friendly = (d) =>
  /arduino-uno/i.test(d.name || d.id) ? 'ESP32 Street Light' : (d.name || d.id);

async function check() {
  let rows;
  try {
    ({ rows } = await pool.query('SELECT id, name, last_seen FROM devices'));
  } catch {
    return;
  }

  const now = Date.now();
  for (const d of rows) {
    const seen = d.last_seen ? new Date(d.last_seen).getTime() : 0;
    const isOnline = Boolean(seen) && now - seen < OFFLINE_AFTER_MS;
    const prev = onlineState.get(d.id);

    // First time we see this device: just record state, don't alert.
    if (prev === undefined) {
      onlineState.set(d.id, isOnline);
      continue;
    }

    if (prev && !isOnline) {
      onlineState.set(d.id, false);
      sendPushToAll({
        title: '🔌 Street light offline',
        body: `${friendly(d)} stopped reporting — check its power or WiFi.`,
        tag: `offline-${d.id}`,
        url: '/dashboard',
      });
    } else if (!prev && isOnline) {
      onlineState.set(d.id, true);
      sendPushToAll({
        title: '✅ Street light back online',
        body: `${friendly(d)} is reporting again.`,
        tag: `offline-${d.id}`,
        url: '/dashboard',
      });
    }
  }
}

export function startOfflineWatcher() {
  setInterval(check, CHECK_EVERY_MS);
  console.log('👀 Offline watcher started.');
}
