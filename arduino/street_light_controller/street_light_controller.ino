/*
 * Street Light Controller — Intelligent Street Lighting Controller
 * ----------------------------------------------------------------
 * Uses an HC-SR04 ultrasonic sensor for proximity detection
 * and an LDR for ambient light sensing.
 *
 * AUTOMATION FEATURES (pulled from the dashboard via /api/devices/sync):
 *   1. Brightness Override  — dashboard forces LED to a specific PWM level
 *   2. Schedule             — backend tells us if we're inside the active window
 *   3. Per-device LDR       — custom day/night threshold (overrides default)
 *   4. Auto-dim timer       — fade to baseline after N minutes of no motion
 *
 * SERIAL OUTPUT FORMAT (parsed by usb-bridge.js):
 *   ldr:<value>,motion:<0|1>,led:<brightness>
 *
 * PINS:
 *   LDR  → A0   Trig → D3   Echo → D4   LED/PWM → D9
 */

#include <ArduinoJson.h>   // Install via Library Manager: "ArduinoJson" by Benoit Blanchon

// ── Pin definitions ─────────────────────────────────────────────────────────
const int TRIG_PIN = 3;
const int ECHO_PIN = 4;
const int LDR_PIN  = A0;
const int LED_PIN  = 9;

// ── Default thresholds (can be overridden by the dashboard) ─────────────────
const int     DEFAULT_LDR_THRESHOLD  = 150;
const int     PRESENCE_THRESHOLD_CM  = 20;   // ultrasonic proximity trigger
const int     BRIGHT_FULL            = 255;
const int     BRIGHT_BASELINE        = 50;
const int     BRIGHT_OFF             = 0;

// ── Timing ───────────────────────────────────────────────────────────────────
const unsigned long TELEMETRY_MS  = 1000;   // send sensor data every 1 s
const unsigned long SYNC_MS       = 2000;   // poll dashboard config every 2 s

// ── State pulled from the dashboard (updated by syncWithBackend) ─────────────
bool  g_manualOverride   = false;
int   g_targetBrightness = 0;      // PWM 0-255; only used when g_manualOverride=true
bool  g_scheduleActive   = true;   // backend computes this for us (no RTC needed)
int   g_ldrThreshold     = DEFAULT_LDR_THRESHOLD;
int   g_autoDimMinutes   = 0;      // 0 = off; >0 = fade after N minutes of no motion

// ── Motion hold (anti-flicker for continuous presence) ──────────────────────
unsigned long lastMotionMs   = 0;
bool          motionSeen     = false;

// ── Auto-dim state ───────────────────────────────────────────────────────────
int           currentBrightness = BRIGHT_OFF;

// ── Timers ───────────────────────────────────────────────────────────────────
unsigned long lastTelemetryMs = 0;
unsigned long lastSyncMs      = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────
int measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  return dur == 0 ? 999 : (int)(dur * 0.034 / 2);
}

// Smooth the LED toward a target value (1 step per call ≈ gradual fade)
void fadeLedTo(int target) {
  if (currentBrightness < target) {
    currentBrightness = min(currentBrightness + 5, target);
  } else if (currentBrightness > target) {
    currentBrightness = max(currentBrightness - 5, target);
  }
  analogWrite(LED_PIN, currentBrightness);
}

// ── Sync with the backend dashboard ─────────────────────────────────────────
// The bridge (usb-bridge.js) already sends telemetry *to* the backend.
// This function reads automation commands *from* the backend.
// Because the Arduino has no direct HTTP access, we rely on the serial link:
//   - The bridge proxies the sync response back on a special serial command.
//
// For simplicity in this implementation we send a sync-request marker on
// serial, and the bridge (or any connected listener) can respond.
// If no JSON is received, the last known config stays in effect.
//
// ALTERNATIVE (advanced): use an ESP8266/ESP32 shield for direct HTTP.
void requestSync() {
  // Send a sync-request line that the bridge can intercept
  Serial.println("SYNC_REQUEST");
}

// Parse a JSON sync response line from the bridge
void parseSyncResponse(const String& line) {
  // Expected format from bridge:
  // SYNC:{"manual_override":false,"target_brightness":null,"schedule_active":true,"ldr_threshold":null,"auto_dim_delay":null}
  if (!line.startsWith("SYNC:")) return;

  String json = line.substring(5);
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) return;

  g_manualOverride   = doc["manual_override"]   | false;
  g_scheduleActive   = doc["schedule_active"]   | true;

  // target_brightness: null in JSON → keep 0 (ignored when override=false)
  if (!doc["target_brightness"].isNull()) {
    g_targetBrightness = doc["target_brightness"].as<int>();
  }

  // ldr_threshold: null → use default
  if (!doc["ldr_threshold"].isNull()) {
    g_ldrThreshold = doc["ldr_threshold"].as<int>();
  } else {
    g_ldrThreshold = DEFAULT_LDR_THRESHOLD;
  }

  // auto_dim_delay: null/0 → off
  if (!doc["auto_dim_delay"].isNull()) {
    g_autoDimMinutes = doc["auto_dim_delay"].as<int>();
  } else {
    g_autoDimMinutes = 0;
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN,  OUTPUT);
  Serial.begin(9600);
}

// ── Main loop ────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // 1. Read any incoming serial data (sync responses from bridge)
  if (Serial.available()) {
    String incoming = Serial.readStringUntil('\n');
    incoming.trim();
    parseSyncResponse(incoming);
  }

  // 2. Request a sync every SYNC_MS
  if (now - lastSyncMs >= SYNC_MS) {
    lastSyncMs = now;
    requestSync();
  }

  // 3. Read sensors
  int  ldr          = analogRead(LDR_PIN);
  int  distance     = measureDistance();
  bool motionNow    = (distance <= PRESENCE_THRESHOLD_CM && distance > 0);

  if (motionNow) {
    lastMotionMs = now;
    motionSeen   = true;
  }

  // motionActive stays true for a brief hold after last detection
  unsigned long holdMs = 500UL;  // 0.5 s hold — quick response
  bool motionActive = motionSeen && (now - lastMotionMs < holdMs);

  // 4. Decide target brightness ─────────────────────────────────────────────
  int targetBrightness = BRIGHT_OFF;

  if (g_manualOverride) {
    // Dashboard override: use exact level regardless of sensors
    targetBrightness = g_targetBrightness;

  } else if (!g_scheduleActive) {
    // Outside scheduled window: stay off
    targetBrightness = BRIGHT_OFF;

  } else {
    // Autonomous sensor logic
    bool isNight = ldr <= g_ldrThreshold;

    if (!isNight) {
      targetBrightness = BRIGHT_OFF;  // daytime: off

    } else if (motionActive) {
      targetBrightness = BRIGHT_FULL; // night + presence: full

    } else if (g_autoDimMinutes > 0) {
      // Auto-dim: check how long since last motion
      unsigned long sinceMotionMs = now - lastMotionMs;
      unsigned long dimThreshMs   = (unsigned long)g_autoDimMinutes * 60UL * 1000UL;

      if (!motionSeen || sinceMotionMs < dimThreshMs) {
        // Still within the dim window — keep baseline on
        targetBrightness = BRIGHT_BASELINE;
      } else {
        // Beyond the dim timer — turn off
        targetBrightness = BRIGHT_OFF;
      }

    } else {
      // No auto-dim, no motion: baseline
      targetBrightness = BRIGHT_BASELINE;
    }
  }

  // 5. Apply brightness (with smooth fade)
  fadeLedTo(targetBrightness);

  // 6. Send telemetry once per second
  if (now - lastTelemetryMs >= TELEMETRY_MS) {
    lastTelemetryMs = now;
    Serial.print("ldr:");
    Serial.print(ldr);
    Serial.print(",motion:");
    Serial.print(motionActive ? 1 : 0);
    Serial.print(",led:");
    Serial.println(currentBrightness);
  }

  delay(50);  // short delay for stable ultrasonic readings
}
