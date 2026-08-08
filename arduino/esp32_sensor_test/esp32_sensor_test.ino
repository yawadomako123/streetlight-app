/*
 * ESP32 SENSOR TEST — no WiFi, no backend.
 * ------------------------------------------------------------------
 * Just verifies the hardware: LDR, HC-SR04 ultrasonic, and the LED.
 * Prints readings to the Serial Monitor and drives the LED with the
 * same day/night/motion logic the real sketch uses.
 *
 * Open Serial Monitor at 115200 baud.
 *
 * ── WIRING (ESP32 is 3.3V — mind the Echo pin!) ──────────────────────
 *   LDR:   3.3V ── LDR ──┬── GPIO34 ── 10kΩ ── GND
 *   HC-SR04: VCC → 5V(VIN), GND → GND, Trig → GPIO5,
 *            Echo → GPIO18 THROUGH a divider (Echo is 5V):
 *                Echo ──[1kΩ]──┬──[2kΩ]── GND
 *                              └── GPIO18
 *   LED:   GPIO23 ──[220Ω]── LED(+) ,  LED(−) → GND
 */

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int LDR_PIN  = 34;   // ADC1, input-only
const int LED_PIN  = 23;

// Tune these while testing
const int LDR_THRESHOLD    = 150;   // LDR <= this = "night"
const int PRESENCE_CM      = 20;    // closer than this = "motion"
const int BRIGHT_FULL      = 255;
const int BRIGHT_BASELINE  = 50;
const int BRIGHT_OFF       = 0;

int measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  return dur == 0 ? 999 : (int)(dur * 0.034 / 2);
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN,  OUTPUT);

  // Match a 0–1023 LDR range (ESP32 ADC is 12-bit / 0–4095 by default).
  analogReadResolution(10);

  Serial.println("ESP32 sensor test ready.");
  Serial.println("Cover the LDR to simulate night; wave your hand near the sensor to trigger motion.");
}

void loop() {
  int  light    = analogRead(LDR_PIN);          // 0–1023
  int  distance = measureDistance();            // cm
  bool isNight  = light <= LDR_THRESHOLD;
  bool motion   = (distance > 0 && distance <= PRESENCE_CM);

  // LED logic
  int brightness;
  if (!isNight)      brightness = BRIGHT_OFF;       // daytime
  else if (motion)   brightness = BRIGHT_FULL;      // night + someone near
  else               brightness = BRIGHT_BASELINE;  // night, idle

  analogWrite(LED_PIN, brightness);

  // Readout
  Serial.print("Light: ");
  Serial.print(light);
  Serial.print("  (");
  Serial.print(isNight ? "NIGHT" : "day");
  Serial.print(")   Distance: ");
  if (distance == 999) Serial.print("--");
  else { Serial.print(distance); Serial.print(" cm"); }
  Serial.print("   Motion: ");
  Serial.print(motion ? "YES" : "no");
  Serial.print("   LED: ");
  Serial.println(brightness);

  delay(300);
}
