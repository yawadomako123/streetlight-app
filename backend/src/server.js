import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import statsRoutes from './routes/stats.routes.js';
import deviceRoutes from './routes/device.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import pushRoutes from './routes/push.routes.js';
import { ensurePushTable } from './push/notifier.js';
import { startOfflineWatcher } from './push/offlineWatcher.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  })
);

// General API rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5000, // Increased for dashboard & hardware polling
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/push', pushRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Street lighting backend listening on port ${PORT}`);
  // Ensure the push table exists, then start watching for offline devices.
  try {
    await ensurePushTable();
    startOfflineWatcher();
  } catch (e) {
    console.error('Push init failed:', e.message);
  }
});
