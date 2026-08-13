import express from 'express';
import { getVapidPublicKey, subscribe, unsubscribe } from '../controllers/push.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', requireAuth, subscribe);
router.post('/unsubscribe', requireAuth, unsubscribe);

export default router;
