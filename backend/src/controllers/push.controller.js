import { saveSubscription, removeSubscription, vapidPublicKey, sendPushToAll } from '../push/notifier.js';

// Public VAPID key the browser needs to create a subscription. Not secret.
export const getVapidPublicKey = (req, res) => {
  res.json({ key: vapidPublicKey });
};

// Store a browser push subscription for the logged-in user.
export const subscribe = async (req, res) => {
  try {
    await saveSubscription(req.user?.id, req.body?.subscription || req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid subscription' });
  }
};

// Send a test notification to every subscribed device (for demos / verifying setup).
export const sendTest = async (req, res) => {
  try {
    await sendPushToAll({
      title: '✅ Test alert',
      body: 'Your street light notifications are working!',
      tag: 'test',
      url: '/dashboard',
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to send test notification' });
  }
};

// Remove a subscription (called when the user disables notifications).
export const unsubscribe = async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || req.body?.subscription?.endpoint;
    if (endpoint) await removeSubscription(endpoint);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Failed to unsubscribe' });
  }
};
