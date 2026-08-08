/*
 * Street Light Controller — ESP32 WiFi edition
 * ------------------------------------------------------------------
 * The ESP32 has WiFi built in, so it replaces the whole
 *   Arduino Uno + HC-05 + usb-bridge.js
 * chain. It reads the sensors, drives the LED, and talks DIRECTLY to
 * the existing Express backend over HTTP — exactly the endpoints the
 * USB bridge used:
 *
 *   POST http://<backend>/api/devices/telemetry   (send readings)
 *   GET  http://<backend>/api/devices/sync/<id>    (pull automation config)
 *
 * Nothing on the backend or web dashboard changes. The phone app just
 * reads the same data from the backend.
 *
 * ── LIBRARIES (Arduino IDE → Boards Manager + Library Manager) ───────
 *   • Boards: "esp32 by Espressif Systems" (adds the ESP32 board core)
 *   • Library: "ArduinoJson" by Benoit Blanchon (v6 or v7)
 *
 * ── WIRING (ESP32 is 3.3V logic — mind the HC-SR04!) ─────────────────
 *   LDR:        3.3V ── LDR ──┬── GPIO34 (ADC, input-only)
 *                             └── 10kΩ ── GND
 *   HC-SR04:    VCC → 5V (VIN),  GND → GND
 *               Trig → GPIO5
 *               Echo → GPIO18  THROUGH a divider (Echo is 5V!):
 *                   Echo ──[1kΩ]──┬──[2kΩ]── GND
 *                                 └── GPIO18   (drops 5V → ~3.3V)
 *   LED:        GPIO23 ──[220Ω]── LED(+) ,  LED(−) → GND
 *
 * NOTE: GPIO34 is input-only and on ADC1 (works with WiFi on). Do NOT
 * use ADC2 pins (e.g. GPIO4/GPIO2/GPIO15) for the LDR — ADC2 is unusable
 * while WiFi is active.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ─── CONFIGURE THESE ─────────────────────────────────────────────────────────
const char* WIFI_SSID     = "Evan";
const char* WIFI_PASSWORD = "evan1234567890a";

// Base URL of your backend. Must be reachable from the ESP32:
//   • Backend on your PC → use the PC's LAN IP (same WiFi), e.g. http://172.20.10.3:4000
//   • Backend deployed   → use its public URL, e.g. https://your-app.onrender.com
const char* BACKEND = "http://172.20.10.3:4000";

// Device id — keep "arduino-uno" so it lands on the existing device row /
// dashboard / app config without any other change. Rename if you prefer.
const char* DEVICE_ID = "arduino-uno";
// ─────────────────────────────────────────────────────────────────────────────

// Pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int LDR_PIN  = 34;   // ADC1, input-only
const int LED_PIN  = 23;

// Defaults (overridden by the backend sync)
const int DEFAULT_LDR_THRESHOLD = 150;
const int PRESENCE_THRESHOLD_CM  = 20;
const int BRIGHT_FULL            = 255;
const int BRIGHT_BASELINE        = 50;
const int BRIGHT_OFF             = 0;

// Timing — faster now that the backend responds after a single DB write.
const unsigned long TELEMETRY_MS = 1000;   // send readings every 1s
const unsigned long SYNC_MS      = 2500;   // pull config

// State pulled from the backend
bool g_manualOverride   = false;
int  g_targetBrightness = 0;
bool g_scheduleActive   = true;
int  g_ldrThreshold     = DEFAULT_LDR_THRESHOLD;
int  g_autoDimMinutes   = 0;

// Motion / brightness state
unsigned long lastMotionMs   = 0;
bool          motionSeen     = false;
int           currentBrightness = BRIGHT_OFF;

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

// Set the LED to the target level INSTANTLY (no fading) — snap to full on
// motion, snap back to baseline/off otherwise.
void setLed(int target) {
  currentBrightness = target;
  analogWrite(LED_PIN, currentBrightness);
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("WiFi connecting to ");
  Serial.print(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(50);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FAILED (will retry).");
  }
}

// POST one telemetry reading to the backend.
void sendTelemetry(int ldr, bool motion, int led) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<192> doc;
  doc["deviceId"]       = DEVICE_ID;
  doc["lightLevel"]     = ldr;
  doc["motionDetected"] = motion;
  doc["ledBrightness"]  = led;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(BACKEND) + "/api/devices/telemetry");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code == 200) {
    Serial.printf("TX telemetry -> ldr:%d motion:%d led:%d\n", ldr, motion, led);
  } else {
    Serial.printf("TX telemetry FAILED (HTTP %d) — is the backend reachable at %s?\n", code, BACKEND);
  }
  http.end();
}

// GET the automation config from the backend and apply it.
void pullConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(String(BACKEND) + "/api/devices/sync/" + DEVICE_ID);
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) return;

  JsonObject dev = doc["device"];
  if (dev.isNull()) return;

  g_manualOverride = dev["manual_override"] | false;
  g_scheduleActive = dev["schedule_active"] | true;

  if (!dev["target_brightness"].isNull())
    g_targetBrightness = dev["target_brightness"].as<int>();

  g_ldrThreshold = dev["ldr_threshold"].isNull()
                     ? DEFAULT_LDR_THRESHOLD
                     : dev["ldr_threshold"].as<int>();

  g_autoDimMinutes = dev["auto_dim_delay"].isNull()
                       ? 0
                       : dev["auto_dim_delay"].as<int>();
}

// ── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN,  OUTPUT);

  // Match the Uno's 0–1023 LDR range so all thresholds stay compatible
  // (ESP32 ADC is 12-bit / 0–4095 by default).
  analogReadResolution(10);

  ensureWifi();
  Serial.println("ESP32 Street Light Controller ready.");
}

// ── Main loop ────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  ensureWifi();

  // 1. Pull config from the backend every SYNC_MS.
  if (now - lastSyncMs >= SYNC_MS) {
    lastSyncMs = now;
    pullConfig();
  }

  // 2. Read sensors.
  int  ldr       = analogRead(LDR_PIN);
  int  distance  = measureDistance();
  bool motionNow = (distance <= PRESENCE_THRESHOLD_CM && distance > 0);

  if (motionNow) {
    lastMotionMs = now;
    motionSeen   = true;
  }
  bool motionActive = motionSeen && (now - lastMotionMs < 500UL);

  // 3. Decide brightness (identical logic to the Arduino sketches).
  int targetBrightness = BRIGHT_OFF;
  if (g_manualOverride) {
    targetBrightness = g_targetBrightness;
  } else if (!g_scheduleActive) {
    targetBrightness = BRIGHT_OFF;
  } else {
    bool isNight = ldr <= g_ldrThreshold;
    if (!isNight) {
      targetBrightness = BRIGHT_OFF;
    } else if (motionActive) {
      targetBrightness = BRIGHT_FULL;
    } else if (g_autoDimMinutes > 0) {
      unsigned long sinceMotionMs = now - lastMotionMs;
      unsigned long dimThreshMs   = (unsigned long)g_autoDimMinutes * 60UL * 1000UL;
      targetBrightness = (!motionSeen || sinceMotionMs < dimThreshMs) ? BRIGHT_BASELINE : BRIGHT_OFF;
    } else {
      targetBrightness = BRIGHT_BASELINE;
    }
  }

  // 4. Apply the brightness instantly (snap on/off — no fading).
  setLed(targetBrightness);

  // 5. Send telemetry every TELEMETRY_MS.
  if (now - lastTelemetryMs >= TELEMETRY_MS) {
    lastTelemetryMs = now;
    sendTelemetry(ldr, motionActive, currentBrightness);
  }

  delay(50);
}
