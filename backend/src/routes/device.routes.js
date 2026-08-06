import express from 'express';
import { 
  getDevices, 
  postTelemetry, 
  overrideDevice,
  updateDeviceConfig,
  syncDevice 
} from '../controllers/device.controller.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Dashboard routes
router.get('/', getDevices);
router.post('/:id/override', requireAdmin, overrideDevice);
router.put('/:id/config', requireAdmin, updateDeviceConfig);

// Hardware routes
router.post('/telemetry', postTelemetry);
router.get('/sync/:id?', syncDevice); // id is optional

export default router;
