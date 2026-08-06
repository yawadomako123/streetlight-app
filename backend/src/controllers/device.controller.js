import pool from '../db/pool.js';

// Get all devices
export const getDevices = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devices ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
};

// Handle incoming telemetry from physical hardware
export const postTelemetry = async (req, res) => {
  const { deviceId, lightLevel, motionDetected, ledBrightness, baselineBrightness } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  try {
    // 1. Log the reading into device_logs for stats
    await pool.query(
      `INSERT INTO device_logs (light_level, motion_detected, led_brightness, baseline_brightness)
       VALUES ($1, $2, $3, $4)`,
      [lightLevel, motionDetected, ledBrightness, baselineBrightness || 255]
    );

    // 2. Update the device's current state in the devices table
    // If it's a new device, we insert it automatically.
    // NOTE: We use COALESCE on the config columns so telemetry never overwrites
    // the automation settings that were set from the dashboard.
    await pool.query(
      `INSERT INTO devices (id, name, status, current_brightness, light_level, motion_detected, last_seen)
       VALUES ($1, $2, 'online', $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET status = 'online',
           current_brightness = EXCLUDED.current_brightness,
           light_level = EXCLUDED.light_level,
           motion_detected = EXCLUDED.motion_detected,
           last_seen = NOW()`,
      [deviceId, `Hardware Node (${deviceId})`, ledBrightness || 0, lightLevel || 0, motionDetected || false]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error posting telemetry:', error);
    res.status(500).json({ error: 'Failed to process telemetry' });
  }
};

// Set a manual brightness override from the dashboard
export const overrideDevice = async (req, res) => {
  const { id } = req.params;
  const { manual_override, target_brightness } = req.body;

  try {
    const result = await pool.query(
      `UPDATE devices 
       SET manual_override = $1, 
           target_brightness = $2
       WHERE id = $3
       RETURNING *`,
      [manual_override, manual_override ? target_brightness : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error overriding device:', error);
    res.status(500).json({ error: 'Failed to override device' });
  }
};

// Save automation config (schedule, per-device LDR threshold, auto-dim delay)
export const updateDeviceConfig = async (req, res) => {
  const { id } = req.params;
  const { schedule_start, schedule_end, ldr_threshold, auto_dim_delay } = req.body;

  try {
    const result = await pool.query(
      `UPDATE devices
       SET schedule_start  = $1,
           schedule_end    = $2,
           ldr_threshold   = $3,
           auto_dim_delay  = $4
       WHERE id = $5
       RETURNING *`,
      [schedule_start || null, schedule_end || null, ldr_threshold ?? null, auto_dim_delay ?? null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving device config:', error);
    res.status(500).json({ error: 'Failed to save device config' });
  }
};

// Hardware Polling Endpoint: Returns global settings and all device-specific automation config.
// The Arduino calls this on every loop to receive commands from the dashboard.
export const syncDevice = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get global settings
    const settingsRes = await pool.query(
      'SELECT ldr_threshold, pir_timeout, global_override FROM system_settings WHERE id = 1'
    );
    const settings = settingsRes.rows[0] || { ldr_threshold: 150, pir_timeout: 30, global_override: false };

    // Get device-specific config
    let deviceState = null;
    if (id) {
      const deviceRes = await pool.query(
        `SELECT manual_override, target_brightness,
                schedule_start, schedule_end,
                ldr_threshold, auto_dim_delay
         FROM devices WHERE id = $1`,
        [id]
      );

      if (deviceRes.rows.length > 0) {
        const d = deviceRes.rows[0];

        // Compute whether the schedule is currently active (server-side, so
        // the Arduino doesn't need to know the real time).
        let schedule_active = true; // default: active if no schedule set
        if (d.schedule_start && d.schedule_end) {
          const now = new Date();
          // Build time-of-day strings for comparison (HH:MM)
          const pad = n => String(n).padStart(2, '0');
          const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
          const start = d.schedule_start.slice(0, 5); // 'HH:MM'
          const end   = d.schedule_end.slice(0, 5);

          if (start <= end) {
            // Normal range: e.g. 08:00–17:00
            schedule_active = nowStr >= start && nowStr < end;
          } else {
            // Overnight range: e.g. 18:00–06:00
            schedule_active = nowStr >= start || nowStr < end;
          }
        }

        deviceState = {
          manual_override:    d.manual_override,
          target_brightness:  d.target_brightness,   // null = auto
          schedule_active,
          ldr_threshold:      d.ldr_threshold,        // null = use global
          auto_dim_delay:     d.auto_dim_delay,        // null = instant off
        };
      }
    }

    res.json({ settings, device: deviceState });
  } catch (error) {
    console.error('Error syncing device:', error);
    res.status(500).json({ error: 'Failed to sync' });
  }
};
