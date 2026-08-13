// Web Push (VAPID) notifier — no Firebase needed.
// Stores browser push subscriptions and sends notifications to all of them.
import webpush from 'web-push';
import pool from '../db/pool.js';

const PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@streetlight.local';

let configured = false;
if (PUBLIC && PRIVATE) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
} else {
  console.warn('⚠️  VAPID keys not set — push notifications are DISABLED. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
}

export const vapidPublicKey = PUBLIC || null;
export const pushConfigured = () => configured;

// Create the subscriptions table if it doesn't exist (safe to run on every boot).
// We do this here rather than in schema.sql because schema.sql is destructive.
export async function ensurePushTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER,
      endpoint   TEXT UNIQUE NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✅ push_subscriptions table ready.');
}

export async function saveSubscription(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId ?? null, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removeSubscription(endpoint) {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// Send a notification payload to every stored subscription, pruning dead ones.
export async function sendPushToAll(payload) {
  if (!configured) return;

  let rows;
  try {
    ({ rows } = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions'));
  } catch (e) {
    console.error('push: could not load subscriptions —', e.message);
    return;
  }

  const body = JSON.stringify(payload);
  await Promise.all(rows.map(async (r) => {
    const sub = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(sub, body);
    } catch (err) {
      // 404/410 mean the browser dropped the subscription — remove it.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await removeSubscription(r.endpoint).catch(() => {});
      } else {
        console.error('push send error:', err.statusCode, err.body || err.message);
      }
    }
  }));
}

// ── Motion alerts ─────────────────────────────────────────────────────────────
// Fires a push when motion goes from absent → present, debounced per device so a
// busy evening doesn't spam. Called from postTelemetry on every reading.
const motionState = new Map(); // deviceId -> { last: bool, lastAlertAt: number }
const MOTION_COOLDOWN_MS = 5 * 60 * 1000; // at most one motion push / 5 min / device

export function notifyMotion(deviceId, motion) {
  const s = motionState.get(deviceId) || { last: false, lastAlertAt: 0 };
  const now = Date.now();

  if (motion && !s.last && now - s.lastAlertAt > MOTION_COOLDOWN_MS) {
    s.lastAlertAt = now;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sendPushToAll({
      title: '🚶 Motion detected',
      body: `Movement at your street light at ${time}.`,
      tag: `motion-${deviceId}`,
      url: '/dashboard',
    });
  }

  s.last = motion;
  motionState.set(deviceId, s);
}
