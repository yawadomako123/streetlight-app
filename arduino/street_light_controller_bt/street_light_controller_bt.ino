#include <SoftwareSerial.h>
#include <ArduinoJson.h>   // Required to parse configuration from the React Native app

SoftwareSerial BTSerial(10, 11); // RX, TX

// Pins
const int trigPin = 2;
const int echoPin = 3;
const int ldrPin = A0;
const int ledPin = 9;

// Default thresholds
int ldrThreshold = 500;

long duration;
int distance;
int lightValue;
int brightness;

// Bluetooth/App control states
bool manualOverride = false;
int manualBrightness = 0;

// Timing variables
unsigned long lastTelemetryMs = 0;
unsigned long lastSyncMs = 0;
const unsigned long TELEMETRY_INTERVAL = 1000; // Send telemetry every 1s
const unsigned long SYNC_INTERVAL = 2000;      // Poll app configuration every 2s

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledPin, OUTPUT);

  Serial.begin(9600);
  BTSerial.begin(9600);

  Serial.println("Smart Light Started");
}

// Parse JSON config line sent by the React Native app
void parseSyncResponse(const String& line) {
  // Expected format: SYNC:{"manual_override":true,"target_brightness":255,"ldr_threshold":500,...}
  if (!line.startsWith("SYNC:")) return;

  String json = line.substring(5);
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, json);
  if (err) return;

  manualOverride = doc["manual_override"] | false;
  
  if (!doc["target_brightness"].isNull()) {
    manualBrightness = doc["target_brightness"].as<int>();
  }
  
  if (!doc["ldr_threshold"].isNull()) {
    ldrThreshold = doc["ldr_threshold"].as<int>();
  }
}

void loop() {
  unsigned long now = millis();

  // ------------------
  // Read Bluetooth Input
  // ------------------
  if (BTSerial.available()) {
    String incoming = BTSerial.readStringUntil('\n');
    incoming.trim();

    // 1. Check if it's the JSON sync packet from our mobile app
    if (incoming.startsWith("SYNC:")) {
      parseSyncResponse(incoming);
    }
    // 2. Fallback to single-character manual terminal commands
    else if (incoming.length() == 1) {
      char command = incoming[0];
      if (command == '1') {
        manualOverride = true;
        manualBrightness = 255;
      }
      else if (command == '0') {
        manualOverride = true;
        manualBrightness = 0;
      }
      else if (command == 'A') {
        manualOverride = false;
      }
    }
  }

  // ------------------
  // Read Sensors
  // ------------------
  lightValue = analogRead(ldrPin);

  // HC-SR04 distance
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH, 30000);
  if (duration == 0) {
    distance = 999;
  } else {
    distance = duration * 0.034 / 2;
  }

  bool motionDetected = (distance <= 20 && distance > 0);

  // ------------------
  // Lighting Logic
  // ------------------
  if (manualOverride) {
    brightness = manualBrightness;
  } else {
    // Day
    if (lightValue > ldrThreshold) {
      brightness = 0;
    }
    // Night
    else {
      if (motionDetected) {
        brightness = 255;
      } else {
        brightness = 10;
      }
    }
  }

  analogWrite(ledPin, brightness);

  // ------------------
  // Send Telemetry to App & Serial Monitor
  // ------------------
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL) {
    lastTelemetryMs = now;

    // Send formatted telemetry to the React Native App
    // Format: ldr:<val>,motion:<0|1>,led:<brightness>
    BTSerial.print("ldr:");
    BTSerial.print(lightValue);
    BTSerial.print(",motion:");
    BTSerial.print(motionDetected ? 1 : 0);
    BTSerial.print(",led:");
    BTSerial.println(brightness);

    // Print human-readable logs to the PC USB Serial Monitor
    Serial.print("Light: ");
    Serial.print(lightValue);
    Serial.print(" | Distance: ");
    Serial.print(distance);
    Serial.print(" cm | LED: ");
    Serial.println(brightness);
  }

  // ------------------
  // Poll Configuration from App
  // ------------------
  if (now - lastSyncMs >= SYNC_INTERVAL) {
    lastSyncMs = now;
    BTSerial.println("SYNC_REQUEST");
  }

  delay(50);
}
