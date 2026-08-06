# ISLC Controller — Mobile App

A React Native (Expo) app that connects to the Intelligent Street Lighting
Controller **over Bluetooth** and acts as the bridge the old `usb-bridge.js`
used to be. Because the Arduino board has no Wi-Fi, an **HC-05 / HC-06**
Bluetooth module replaces the USB cable — the phone talks to the board over
Bluetooth *and* relays telemetry to the existing backend over Wi-Fi/data.

```
Arduino ──(Bluetooth SPP)── 📱 this app ──(HTTP over Wi-Fi)── Express + Postgres
   ldr:X,motion:Y,led:Z          parses + relays              auth, logging, web dashboard
   SYNC_REQUEST                  answers with SYNC:{...}
```

The Arduino protocol is **unchanged** — see
[`arduino/street_light_controller_bt/`](../arduino/street_light_controller_bt/street_light_controller_bt.ino).

---

## 1. What you need

- **Node.js ≥ 18** and the Expo CLI (`npx expo`, no global install needed).
- **Android Studio** (for the Android SDK + a device/emulator). This app is
  **Android-only** because HC-05/06 use *Bluetooth Classic (SPP)*, which iOS
  does not allow. (To support iPhone, switch to an HM-10 **BLE** module and add
  a `BleTransport` — see [Swapping to BLE](#6-swapping-to-ble-hm-10) below.)
- A **physical Android phone** for real Bluetooth testing. Bluetooth does **not**
  work on the emulator — but you can run the whole UI there in **mock mode**.

## 2. Install

```bash
cd mobile
npm install
cp .env.example .env   # then edit .env (see below)
```

### Configure `.env`

| Var | What to set |
|---|---|
| `EXPO_PUBLIC_API_URL` | Emulator: `http://10.0.2.2:4000`. Real phone: your PC's LAN IP, e.g. `http://192.168.1.20:4000` (phone and PC on the same Wi-Fi). |
| `EXPO_PUBLIC_DEVICE_ID` | Keep as `arduino-uno` unless you changed it in the DB. |
| `EXPO_PUBLIC_USE_MOCK_BT` | `true` to simulate the Arduino (no hardware). `false` for real Bluetooth. |
| `EXPO_PUBLIC_RELAY_TO_BACKEND` | `true` keeps the backend/web dashboard working. `false` = fully offline, app is the only controller. |

## 3. Run it — mock mode first (no hardware)

This runs the entire app against a **simulated** Arduino, so you can build and
demo the UI before the module arrives. Works in Expo Go or an emulator.

```bash
# in mobile/.env set EXPO_PUBLIC_USE_MOCK_BT=true
npm run start
```

Press `a` for Android. On the Connect screen tap **Scan → "HC-05 (simulated)"**;
you'll see live fake telemetry and can drive the controls.

## 4. Run it — real Bluetooth (needs a dev build)

`react-native-bluetooth-classic` is a native module, so it can't run in Expo Go.
You build a **development client** once, then reload JS as normal.

```bash
# set EXPO_PUBLIC_USE_MOCK_BT=false in .env
npx expo prebuild                 # generates the android/ project
npx expo run:android              # builds + installs the dev client on your phone
```

Then, on the phone:

1. **Pair the HC-05 first** in Android **Settings → Bluetooth** (PIN `1234` or `0000`).
   The app only lists already-paired devices.
2. Open the app → **Scan for devices** → tap your HC-05 → you're on the dashboard.
3. Grant the Bluetooth permission prompt when asked.

> Keep the backend running (`cd backend && npm run dev`) so telemetry relays and
> admin login work. You do **not** run `usb-bridge.js` anymore — the phone is the bridge.

## 5. How it maps to the old system

| Old (USB) | New (Bluetooth) |
|---|---|
| `usb-bridge.js` reads serial | `BridgeService` reads the BT stream |
| Bridge POSTs `/telemetry` | App POSTs `/telemetry` (same endpoint) |
| Bridge answers `SYNC_REQUEST` from `/sync/:id` | App answers `SYNC_REQUEST` from `/sync/:id` |
| Arduino over USB serial | Arduino over HC-05 `SoftwareSerial` |
| Web dashboard controls config | App **and** web dashboard control config |

Source layout:

```
mobile/src/
  bluetooth/
    transport.ts        # BtTransport interface (the swap seam)
    ClassicTransport.ts # HC-05/06 impl (react-native-bluetooth-classic)
    MockTransport.ts    # simulated Arduino
    protocol.ts         # parse "ldr:.." / build "SYNC:.." (ported from usb-bridge.js)
    BridgeService.ts    # the phone-as-bridge orchestrator
  api/client.ts         # backend relay (reuses your existing endpoints)
  screens/              # Connect, Dashboard, Login
  components/           # TelemetryCard, AutomationPanel, ConnectionBar, ui
```

## 6. Swapping to BLE (HM-10)

If you buy an **HM-10 / BLE** module instead (needed for iPhone support):

1. `npm install react-native-ble-plx`
2. Add `mobile/src/bluetooth/BleTransport.ts` implementing the same
   `BtTransport` interface (connect to the module's service/characteristic,
   emit inbound notifications as lines, write lines as characteristic writes).
3. In `mobile/src/bluetooth/index.ts`, return `new BleTransport()` instead of
   `ClassicTransport`.

Nothing else changes — `BridgeService`, the protocol, and the whole UI are
transport-agnostic by design.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "No paired devices" | Pair the HC-05 in Android Bluetooth settings first (PIN 1234/0000). |
| Telemetry shows but "Backend offline" | `EXPO_PUBLIC_API_URL` is wrong. On a real phone it must be your PC's LAN IP, not `localhost`/`10.0.2.2`. |
| Nothing happens after connect | Confirm the board runs `street_light_controller_bt.ino` and the HC-05 TXD→D10 / RXD→D11 wiring. Open the Arduino Serial Monitor (USB) at 9600 to watch debug output. |
| Controls locked | In backend mode you must sign in as an **admin**. Tap "Admin sign in". |
| Build fails on new arch | This app sets `newArchEnabled: false` on purpose (the BT library isn't new-arch ready). Keep it false. |
| Want to demo with no board | Set `EXPO_PUBLIC_USE_MOCK_BT=true` and run in Expo Go. |
