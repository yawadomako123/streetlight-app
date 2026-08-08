#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "Evan";
const char* WIFI_PASSWORD = "evan1234567890";

const char* BACKEND = "https://streetlight-app.onrender.com";
const char* DEVICE_ID = "arduino-uno";

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int LDR_PIN = 34;
const int LED_PIN = 23;

const int DEFAULT_LDR_THRESHOLD = 150;
const int PRESENCE_THRESHOLD_CM = 20;
const int BRIGHT_FULL = 255;
const int BRIGHT_BASELINE = 50;
const int BRIGHT_OFF = 0;

const unsigned long TELEMETRY_MS = 500;
const unsigned long SYNC_MS = 2500;
const unsigned long MOTION_HOLD_MS = 1000;

volatile int latestLdr = 0;
volatile int latestDistance = 999;
volatile bool latestMotion = false;
volatile int latestBrightness = 0;

volatile bool g_manualOverride = false;
volatile int g_targetBrightness = 0;
volatile bool g_scheduleActive = true;
volatile int g_ldrThreshold = DEFAULT_LDR_THRESHOLD;
volatile int g_autoDimMinutes = 0;

unsigned long lastMotionMs = 0;
bool motionSeen = false;
int currentBrightness = BRIGHT_OFF;

WiFiClientSecure secureClient;

int measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return 999;
  }

  return (int)(duration * 0.034 / 2);
}

void setLed(int target) {
  target = constrain(target, 0, 255);
  currentBrightness = target;
  analogWrite(LED_PIN, currentBrightness);
  latestBrightness = currentBrightness;
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("WiFi connecting to ");
  Serial.print(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 15000) {
    delay(100);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FAILED (will retry).");
  }
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  int ldr = latestLdr;
  bool motion = latestMotion;
  int brightness = latestBrightness;

  StaticJsonDocument<192> doc;

  doc["deviceId"] = DEVICE_ID;
  doc["lightLevel"] = ldr;
  doc["motionDetected"] = motion;
  doc["ledBrightness"] = brightness;

  String body;
  serializeJson(doc, body);

  HTTPClient http;

  String url =
    String(BACKEND) + "/api/devices/telemetry";

  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(body);

  if (code == 200) {
    Serial.printf(
      "TX -> LDR:%d Motion:%d LED:%d\n",
      ldr,
      motion,
      brightness
    );
  } else {
    Serial.printf(
      "TX FAILED HTTP:%d\n",
      code
    );
  }

  http.end();
}

void pullConfig() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;

  String url =
    String(BACKEND) +
    "/api/devices/sync/" +
    DEVICE_ID;

  http.begin(secureClient, url);

  int code = http.GET();

  if (code != 200) {
    http.end();
    return;
  }

  String payload = http.getString();

  http.end();

  StaticJsonDocument<512> doc;

  DeserializationError error =
    deserializeJson(doc, payload);

  if (error) {
    return;
  }

  JsonObject dev = doc["device"];

  if (dev.isNull()) {
    return;
  }

  g_manualOverride =
    dev["manual_override"] | false;

  g_scheduleActive =
    dev["schedule_active"] | true;

  if (!dev["target_brightness"].isNull()) {
    g_targetBrightness =
      dev["target_brightness"].as<int>();
  }

  if (!dev["ldr_threshold"].isNull()) {
    g_ldrThreshold =
      dev["ldr_threshold"].as<int>();
  } else {
    g_ldrThreshold =
      DEFAULT_LDR_THRESHOLD;
  }

  if (!dev["auto_dim_delay"].isNull()) {
    g_autoDimMinutes =
      dev["auto_dim_delay"].as<int>();
  } else {
    g_autoDimMinutes = 0;
  }
}

void networkTask(void* parameter) {
  unsigned long lastTelemetry = 0;
  unsigned long lastSync = 0;

  ensureWifi();

  while (true) {
    unsigned long now = millis();

    if (WiFi.status() != WL_CONNECTED) {
      ensureWifi();
    }

    if (now - lastSync >= SYNC_MS) {
      lastSync = now;
      pullConfig();
    }

    if (now - lastTelemetry >= TELEMETRY_MS) {
      lastTelemetry = now;
      sendTelemetry();
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  analogReadResolution(10);

  secureClient.setInsecure();

  // Networking on core 0. 16 KB stack — the HTTPS/TLS handshake needs the room.
  xTaskCreatePinnedToCore(
    networkTask,
    "NetworkTask",
    16384,
    NULL,
    1,
    NULL,
    0
  );

  Serial.println("ESP32 Street Light Controller ready.");
}

void loop() {
  unsigned long now = millis();

  int ldr = analogRead(LDR_PIN);
  int distance = measureDistance();

  bool motionNow =
    distance <= PRESENCE_THRESHOLD_CM &&
    distance > 0;

  if (motionNow) {
    lastMotionMs = now;
    motionSeen = true;
  }

  bool motionActive =
    motionSeen &&
    (now - lastMotionMs < MOTION_HOLD_MS);

  int targetBrightness = BRIGHT_OFF;

  if (g_manualOverride) {

    targetBrightness =
      g_targetBrightness;

  } else if (!g_scheduleActive) {

    targetBrightness =
      BRIGHT_OFF;

  } else {

    bool isNight =
      ldr <= g_ldrThreshold;

    if (!isNight) {

      targetBrightness =
        BRIGHT_OFF;

    } else if (motionActive) {

      targetBrightness =
        BRIGHT_FULL;

    } else if (g_autoDimMinutes > 0) {

      unsigned long sinceMotion =
        now - lastMotionMs;

      unsigned long dimTime =
        (unsigned long)g_autoDimMinutes *
        60UL *
        1000UL;

      if (!motionSeen ||
          sinceMotion < dimTime) {

        targetBrightness =
          BRIGHT_BASELINE;

      } else {

        targetBrightness =
          BRIGHT_OFF;
      }

    } else {

      targetBrightness =
        BRIGHT_BASELINE;
    }
  }

  setLed(targetBrightness);

  latestLdr = ldr;
  latestDistance = distance;
  latestMotion = motionActive;

  delay(20);
}