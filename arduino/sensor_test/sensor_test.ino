/*
 * Sensor Diagnostic Sketch — Intelligent Street Lighting Controller
 * -----------------------------------------------------------------
 * Tests whether your LDR (light sensor), PIR (motion sensor) and LED
 * are working or damaged. It does NOT talk to the backend — it just
 * prints easy-to-read results to the Serial Monitor.
 *
 * PINS (match the wiring diagram):
 *   LDR  -> A0   (with a 10k resistor to GND = voltage divider)
 *   PIR  -> D2   (HC-SR501 OUT pin)
 *   LED  -> D9   (PWM pin, through a 220 ohm resistor)
 *
 * HOW TO USE:
 *   1. Wire everything as shown in the diagram.
 *   2. Upload this sketch (Tools -> Board: Arduino Uno, Port: COM4).
 *   3. Open Serial Monitor at 9600 baud.
 *   4. Follow the on-screen prompts:
 *        - Cover the LDR with your finger, then shine a light on it.
 *        - Wave your hand in front of the PIR.
 *        - Watch the LED fade up and down.
 */

const int LDR_PIN = A0;
const int PIR_PIN = 2;
const int LED_PIN = 9;

int ldrMin = 1023;   // track the lowest LDR reading seen
int ldrMax = 0;      // track the highest LDR reading seen
bool pirEverHigh = false;

void setup() {
  Serial.begin(9600);
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  Serial.println(F("========================================"));
  Serial.println(F("   SENSOR DIAGNOSTIC — starting up"));
  Serial.println(F("========================================"));
  Serial.println(F("PIR sensors need ~30-60s to warm up."));
  Serial.println(F("Cover/uncover the LDR and wave at the PIR."));
  Serial.println();
  delay(1500);
}

void loop() {
  // ---------- 1. LDR (light sensor) ----------
  int ldr = analogRead(LDR_PIN);
  if (ldr < ldrMin) ldrMin = ldr;
  if (ldr > ldrMax) ldrMax = ldr;
  int ldrRange = ldrMax - ldrMin;

  Serial.print(F("LDR raw="));
  Serial.print(ldr);
  Serial.print(F("  (seen min="));
  Serial.print(ldrMin);
  Serial.print(F(", max="));
  Serial.print(ldrMax);
  Serial.print(F(")  -> "));
  if (ldr == 0) {
    Serial.print(F("STUCK AT 0 (check wiring: is the 10k resistor / GND connected?)"));
  } else if (ldr == 1023) {
    Serial.print(F("STUCK AT 1023 (check wiring: is the LDR connected to 5V?)"));
  } else if (ldrRange > 50) {
    Serial.print(F("OK — value changes with light. LDR is ALIVE."));
  } else {
    Serial.print(F("reading... now cover it / shine a light to see it change"));
  }
  Serial.println();

  // ---------- 2. PIR (motion sensor) ----------
  int pir = digitalRead(PIR_PIN);
  if (pir == HIGH) pirEverHigh = true;

  Serial.print(F("PIR = "));
  Serial.print(pir == HIGH ? F("HIGH (motion!)") : F("LOW  (still) "));
  Serial.print(F("  -> "));
  if (pirEverHigh) {
    Serial.print(F("OK — it has detected motion at least once. PIR is ALIVE."));
  } else {
    Serial.print(F("no motion seen yet (wave your hand; allow warm-up time)"));
  }
  Serial.println();

  // ---------- 3. LED ----------
  // Fade the LED up and down so you can visually confirm it lights.
  Serial.println(F("LED: fading up/down — watch it. If it never lights, check polarity/resistor."));
  for (int b = 0; b <= 255; b += 15) { analogWrite(LED_PIN, b); delay(20); }
  for (int b = 255; b >= 0; b -= 15) { analogWrite(LED_PIN, b); delay(20); }

  Serial.println(F("----------------------------------------"));
  delay(800);
}
