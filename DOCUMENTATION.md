# Intelligent Street Lighting Controller (ISLC)
### Complete System Documentation

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Hardware](#3-hardware)
4. [Getting Started](#4-getting-started)
5. [Backend API](#5-backend-api)
6. [Database Schema](#6-database-schema)
7. [USB Bridge](#7-usb-bridge)
8. [Arduino Sketch](#8-arduino-sketch)
9. [Frontend Dashboard](#9-frontend-dashboard)
10. [Automation Features](#10-automation-features)
11. [Authentication & Roles](#11-authentication--roles)
12. [Environment Variables](#12-environment-variables)
13. [Scripts Reference](#13-scripts-reference)

---

## 1. System Overview

The **Intelligent Street Lighting Controller (ISLC)** is a full-stack IoT application that connects a physical Arduino-based street light to a web dashboard. The system automatically adjusts LED brightness based on ambient light (LDR sensor) and proximity (ultrasonic sensor), while giving administrators real-time visibility and remote control via a web interface.

**Key capabilities:**
- Automatic day/night detection via LDR sensor
- Proximity-triggered full brightness (ultrasonic sensor)
- Real-time telemetry visible in the web dashboard (1-second updates)
- Admin-controlled automation: brightness override, schedule, per-device LDR threshold, auto-dim timer
- JWT + Google OAuth authentication with role-based access

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         HARDWARE LAYER                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Arduino Uno                                             │   │
│  │   • LDR (A0)      — ambient light reading (0–1023)      │   │
│  │   • HC-SR04 (D3/D4) — ultrasonic distance (cm)          │   │
│  │   • LED/PWM (D9)   — street light output (0–255)        │   │
│  └───────────────────────┬──────────────────────────────────┘   │
│                          │ USB Serial (9600 baud)               │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                   USB BRIDGE LAYER (Node.js)                    │
│                                                                 │
│  usb-bridge.js                                                  │
│   • Reads serial port (COM7 / auto-detected)                    │
│   • Parses  ldr:X,motion:Y,led:Z  telemetry lines              │
│   • POSTs telemetry  →  POST /api/devices/telemetry             │
│   • Handles SYNC_REQUEST  →  GET /api/devices/sync/:id          │
│   • Writes  SYNC:{json}  back to Arduino                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (localhost:4000)
┌──────────────────────────┼──────────────────────────────────────┐
│                     BACKEND LAYER (Express.js)                  │
│                                                                 │
│  server.js  →  routes  →  controllers  →  PostgreSQL (Neon)     │
│                                                                 │
│  /api/auth      — signup, login, Google OAuth, /me              │
│  /api/devices   — telemetry ingest, device list, sync           │
│  /api/settings  — global system settings                        │
│  /api/stats     — live statistics from device_logs              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (Vite proxy / direct)
┌──────────────────────────┼──────────────────────────────────────┐
│                  FRONTEND LAYER (React + TypeScript)            │
│                                                                 │
│  Vite + Tailwind CSS + Lucide icons                             │
│   • Public landing page  (Hero, Stats, HowItWorks, etc.)        │
│   • Auth modal           (email/password + Google Sign-In)      │
│   • Dashboard            (Overview, Devices, Settings tabs)     │
│     └── Devices tab: live telemetry card + Automation panel     │
└─────────────────────────────────────────────────────────────────┘
```

### Data flow — telemetry (Arduino → Dashboard)

```
Arduino serial  →  usb-bridge parses  →  POST /telemetry
 →  DB upsert (devices table)  →  Dashboard polls GET /devices every 1 s
 →  Device card updates live
```

### Data flow — commands (Dashboard → Arduino)

```
Admin changes setting  →  PUT /devices/:id/config or POST /devices/:id/override
 →  DB stores config  →  Arduino sends SYNC_REQUEST every 2 s
 →  Bridge fetches GET /sync/arduino-uno  →  Writes SYNC:{json} to serial
 →  Arduino reads and applies config
```

---

## 3. Hardware

### Components

| Component | Part | Purpose |
|---|---|---|
| Microcontroller | Arduino Uno (CH340 clone) | Main controller, serial comm |
| Light sensor | LDR (photoresistor + 10kΩ) | Ambient light detection |
| Distance sensor | HC-SR04 ultrasonic | Proximity detection |
| Output | LED + 220Ω resistor | Street light simulation |

### Pin Map

| Signal | Arduino Pin | Notes |
|---|---|---|
| LDR input | A0 | Analog 0–1023 |
| Ultrasonic Trig | D3 | Digital output |
| Ultrasonic Echo | D4 | Digital input |
| LED (PWM) | D9 | PWM output, 0–255 |

### Wiring Diagram

```
LDR:
  One leg → 5V
  Other leg → A0  and  → 10kΩ → GND

HC-SR04:
  VCC → 5V
  GND → GND
  Trig → D3
  Echo → D4

LED:
  Anode (+) → 220Ω → D9
  Cathode (−) → GND
```

---

## 4. Getting Started

### Prerequisites

- Node.js ≥ 18
- Arduino IDE (with **ArduinoJson** library installed)
- PostgreSQL (or a Neon.tech hosted database)
- Arduino Uno connected via USB

### 1. Clone & install

```bash
# Root workspace
npm install

# Backend
cd backend && npm install

# Frontend  (already handled by root workspace)
```

### 2. Configure environment

Copy `.env.example` to `backend/.env` and fill in:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-long-random-secret
GOOGLE_CLIENT_ID=your-google-client-id
```

### 3. Run the database migration

```bash
cd backend
npm run migrate
```

This creates all tables (users, devices, device_logs, system_settings) and seeds default data.

### 4. Start the backend

```bash
cd backend
npm run dev        # runs with --watch (auto-restart on changes)
# OR
npm start          # production
```

Backend listens on **http://localhost:4000**

### 5. Start the frontend

```bash
# From project root
npm run dev        # Vite dev server → http://localhost:5173
```

### 6. Flash the Arduino

1. Open `arduino/street_light_controller/street_light_controller.ino` in Arduino IDE
2. Install **ArduinoJson** via Library Manager (by Benoit Blanchon)
3. Select **Arduino Uno** and the correct COM port
4. Click **Upload**

### 7. Start the USB bridge

```bash
cd backend
npm run usb        # auto-detects COM port; Ctrl+C to stop
```

The bridge will print:
```
🔎 Auto-detected Arduino by vendor ID on COM7.
✅ Serial port COM7 opened successfully!
📡 Relaying telemetry to http://localhost:4000/api/devices/telemetry...

🚀 Telemetry sent -> LDR: 160 | Motion: false | LED: 50
📥 Sync sent → {"manual_override":false,"target_brightness":null,...}
```

---

## 5. Backend API

Base URL: `http://localhost:4000`

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | None | Create account (email + password) |
| POST | `/api/auth/login` | None | Login (username or email + password) |
| POST | `/api/auth/google` | None | Google OAuth sign-in |
| GET | `/api/auth/me` | Bearer JWT | Get current user info |

#### POST `/api/auth/signup`
```json
// Request body
{ "username": "alice", "email": "alice@example.com", "password": "min8chars" }

// Response 201
{ "token": "eyJ...", "user": { "id": 1, "username": "alice", "email": "...", "role": "viewer" } }
```

> **Note:** The very first user to register (or sign in via Google) is automatically promoted to `admin`.

#### POST `/api/auth/login`
```json
// Request body — identifier can be username or email
{ "identifier": "alice", "password": "min8chars" }

// Response 200
{ "token": "eyJ...", "user": { "id": 1, "username": "alice", "role": "viewer" } }
```

---

### Devices

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/devices` | None | List all devices |
| POST | `/api/devices/telemetry` | None | Ingest telemetry from hardware |
| POST | `/api/devices/:id/override` | Admin JWT | Set brightness override |
| PUT | `/api/devices/:id/config` | Admin JWT | Save automation config |
| GET | `/api/devices/sync/:id?` | None | Hardware sync endpoint |

#### GET `/api/devices`
Returns all device rows with live telemetry and automation config columns.

```json
[
  {
    "id": "arduino-uno",
    "name": "Hardware Node (arduino-uno)",
    "status": "online",
    "current_brightness": 50,
    "light_level": 160,
    "motion_detected": false,
    "manual_override": false,
    "target_brightness": null,
    "schedule_start": "18:00:00",
    "schedule_end": "06:00:00",
    "ldr_threshold": null,
    "auto_dim_delay": 5,
    "last_seen": "2026-07-28T16:00:00.000Z"
  }
]
```

#### POST `/api/devices/telemetry`
Called by the USB bridge every time a new sensor reading arrives.

```json
// Request body
{
  "deviceId": "arduino-uno",
  "lightLevel": 160,
  "motionDetected": false,
  "ledBrightness": 50
}

// Response 200
{ "success": true }
```

The endpoint does an `INSERT ... ON CONFLICT DO UPDATE` so new hardware nodes register themselves automatically on first contact.

#### POST `/api/devices/:id/override`
Admin only. Forces the LED to a specific brightness level, ignoring sensors.

```json
// Request body
{ "manual_override": true, "target_brightness": 128 }

// To release override:
{ "manual_override": false, "target_brightness": null }
```

#### PUT `/api/devices/:id/config`
Admin only. Saves all automation settings for a specific device.

```json
// Request body (all fields optional)
{
  "schedule_start": "18:00",   // or null to clear
  "schedule_end": "06:00",     // or null to clear
  "ldr_threshold": 200,        // or null to use global
  "auto_dim_delay": 5          // minutes, or null to disable
}
```

#### GET `/api/devices/sync/:id?`
Called by the USB bridge on behalf of the Arduino. Returns the device's full automation config plus a server-computed `schedule_active` boolean (so the Arduino doesn't need an RTC).

```json
{
  "settings": { "ldr_threshold": 150, "pir_timeout": 30, "global_override": false },
  "device": {
    "manual_override": false,
    "target_brightness": null,
    "schedule_active": true,
    "ldr_threshold": null,
    "auto_dim_delay": 5
  }
}
```

---

### Settings (Global)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/settings` | None | Get global system settings |
| PUT | `/api/settings` | Admin JWT | Update global settings |

```json
// PUT /api/settings
{ "ldr_threshold": 150, "pir_timeout": 30, "global_override": false }
```

---

### Stats

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/stats` | None | Live stats computed from device_logs |

```json
{
  "stats": [
    { "label": "YEARS OF RESEARCH", "value": "2+", "source": "static" },
    { "label": "SENSORS INTEGRATED", "value": "2", "source": "static" },
    { "label": "PWM CHANNELS", "value": "6", "source": "static" },
    { "label": "ENERGY SAVED", "value": "71%", "source": "computed" }
  ],
  "details": {
    "totalReadings": 8420,
    "motionEvents": 143,
    "uptimePercent": 98,
    "energySavedPercent": 71
  }
}
```

---

### Health Check

```
GET /api/health  →  { "status": "ok" }
```

---

## 6. Database Schema

Hosted on **Neon PostgreSQL** (serverless). Connection is via `DATABASE_URL` in `.env`.

### `users`

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| username | VARCHAR(100) | Unique, 3–30 chars, alphanumeric + underscore |
| email | VARCHAR(255) UNIQUE | |
| password_hash | TEXT | Nullable for Google OAuth users |
| google_id | VARCHAR(255) UNIQUE | Nullable for email/password users |
| role | VARCHAR(20) | `'admin'` or `'viewer'` (default: `'viewer'`) |
| created_at | TIMESTAMPTZ | |

### `devices`

| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(50) PK | e.g. `'arduino-uno'` |
| name | VARCHAR(100) | e.g. `'Hardware Node (arduino-uno)'` |
| status | VARCHAR(20) | `'online'` or `'offline'` |
| current_brightness | INTEGER | Live PWM value 0–255 |
| light_level | INTEGER | Live LDR reading 0–1023 |
| motion_detected | BOOLEAN | |
| manual_override | BOOLEAN | True when dashboard is forcing brightness |
| target_brightness | INTEGER | PWM target when override is on (nullable) |
| schedule_start | TIME | Nullable; e.g. `'18:00:00'` |
| schedule_end | TIME | Nullable; e.g. `'06:00:00'` |
| ldr_threshold | INTEGER | Per-device override (nullable = use global) |
| auto_dim_delay | INTEGER | Minutes before auto-dim (nullable = off) |
| last_seen | TIMESTAMPTZ | Updated every telemetry POST |

### `device_logs`

Every telemetry POST appends a row here for historical analytics.

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| recorded_at | TIMESTAMPTZ | Default: NOW() |
| light_level | INTEGER | Raw LDR 0–1023 |
| motion_detected | BOOLEAN | |
| led_brightness | INTEGER | Actual PWM 0–255 |
| baseline_brightness | INTEGER | Always-on equivalent (for energy calc) |
| is_online | BOOLEAN | |

### `system_settings`

Single row (`id = 1`), holds global thresholds.

| Column | Type | Default | Notes |
|---|---|---|---|
| id | INTEGER PK | 1 | Only one row |
| ldr_threshold | INTEGER | 150 | LDR values ≤ this = night |
| pir_timeout | INTEGER | 30 | Seconds light stays on after motion |
| global_override | BOOLEAN | false | Force all lights ON ignoring sensors |
| updated_at | TIMESTAMPTZ | | |

---

## 7. USB Bridge

**File:** `backend/usb-bridge.js`

The USB bridge is a standalone Node.js process that sits between the Arduino's serial port and the backend HTTP API.

### Starting

```bash
# Auto-detects Arduino
npm run usb

# Explicit port
node usb-bridge.js COM7

# Explicit port + baud rate
node usb-bridge.js COM7 9600
```

### Auto-detection logic

1. Prefers ports whose USB vendor ID matches known Arduino/clone chips (`2341`, `2a03`, `1a86`, `0403`, `10c4`)
2. Falls back to matching manufacturer strings (`arduino`, `ch340`, `ftdi`, etc.)
3. If exactly one USB serial device exists, uses it as a best guess
4. Retries every 3 seconds if no port is found

### Telemetry ingest

The bridge reads each line from the serial port. Lines matching the CSV format are parsed and POSTed to the backend:

```
ldr:160,motion:0,led:50
```

Maps to:
```json
{ "deviceId": "arduino-uno", "lightLevel": 160, "motionDetected": false, "ledBrightness": 50 }
```

Also accepts JSON format:
```json
{"lightLevel": 160, "motionDetected": false, "ledBrightness": 50}
```

### Sync (bidirectional)

Every 2 seconds the Arduino sends `SYNC_REQUEST` on serial. The bridge intercepts it, calls `GET /api/devices/sync/arduino-uno`, and writes the response back to the Arduino:

```
SYNC:{"manual_override":false,"target_brightness":null,"schedule_active":true,"ldr_threshold":null,"auto_dim_delay":5}
```

### Reconnect behaviour

- If the port closes (cable pulled, etc.) the bridge waits 3 seconds and reconnects
- `Access denied` error = another process (e.g. Arduino IDE Serial Monitor) is holding the port — close it first

---

## 8. Arduino Sketch

**File:** `arduino/street_light_controller/street_light_controller.ino`

### Required library

Install via Arduino IDE → Library Manager:  
**ArduinoJson** by Benoit Blanchon (any v6 or v7)

### Constants (configurable at the top)

| Constant | Default | Description |
|---|---|---|
| `TRIG_PIN` | 3 | HC-SR04 trigger |
| `ECHO_PIN` | 4 | HC-SR04 echo |
| `LDR_PIN` | A0 | LDR analog input |
| `LED_PIN` | 9 | LED PWM output |
| `DEFAULT_LDR_THRESHOLD` | 150 | Day/night boundary |
| `PRESENCE_THRESHOLD_CM` | 20 | Proximity trigger distance |
| `BRIGHT_FULL` | 255 | Full brightness (motion detected) |
| `BRIGHT_BASELINE` | 50 | Dim baseline (night, no motion) |
| `BRIGHT_OFF` | 0 | Off (daytime) |
| `TELEMETRY_MS` | 1000 | Serial output interval |
| `SYNC_MS` | 2000 | Config poll interval |

### Brightness decision logic

```
if manual_override is ON:
    LED = target_brightness  (from dashboard slider)

else if schedule is set AND schedule_active = false:
    LED = 0  (outside active window)

else:  // autonomous mode
    if LDR > ldr_threshold:  // daytime
        LED = 0

    else:  // nighttime
        if distance ≤ 20 cm:
            LED = 255  (full — someone nearby)

        else if auto_dim_delay > 0 AND no motion for > delay minutes:
            LED = 0    (timed out after dim period)

        else:
            LED = 50   (dim baseline — night, no one nearby)
```

### Serial output (every 1 second)

```
ldr:160,motion:0,led:50
```

### Sync request (every 2 seconds)

```
SYNC_REQUEST
```

Bridge responds with:

```
SYNC:{"manual_override":false,"target_brightness":null,"schedule_active":true,"ldr_threshold":null,"auto_dim_delay":null}
```

### LED fading

Brightness transitions are smoothed with a `fadeLedTo()` function that steps ±5 per loop iteration (~50 ms), giving a gentle fade rather than an abrupt switch.

---

## 9. Frontend Dashboard

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Lucide icons

### Pages / Components

| Component | Route | Description |
|---|---|---|
| `Home.tsx` | `/` | Landing page host |
| `Hero.tsx` | — | Landing page hero section |
| `Stats.tsx` | — | Live stats strip (from `/api/stats`) |
| `HowItWorks.tsx` | — | Explainer section |
| `About.tsx` | — | About section |
| `Portfolio.tsx` | — | Portfolio section |
| `Testimonial.tsx` | — | Testimonials |
| `RemoteAccess.tsx` | — | Remote access feature highlight |
| `SystemManual.tsx` | — | Manual download section |
| `Overview.tsx` | — | System overview section |
| `Footer.tsx` | — | Footer |
| `Navbar.tsx` | — | Navigation bar |
| `AuthModal.tsx` | — | Login/signup modal (email + Google) |
| `Dashboard.tsx` | `/dashboard` | Main authenticated dashboard |

### Dashboard tabs

#### Overview tab
- Energy Saved % (computed from device_logs)
- System Uptime % (computed from device_logs)
- Total Motion Events (count)
- Total Sensor Readings (count)
- Activity Feed

#### Devices tab
Each registered hardware node gets a card showing:

| Element | Description |
|---|---|
| LED icon | Glows amber proportional to brightness |
| Status badge | 🟢 Online / 🔴 Offline with pulsing dot |
| Override badge | ⚡ shown when manual override is active |
| Scheduled badge | 🕐 shown when a schedule is configured |
| Day/Night label | ☀️ / 🌙 based on live LDR vs threshold |
| Last seen | "Just now" / "Xs ago" / "Xm ago" |
| LED Brightness bar | Animated gradient bar, 0–100% |
| Ambient Light bar | Raw LDR value with blue fill bar |
| Motion indicator | Pulsing amber dot + DETECTED/CLEAR |
| Automation & Control | Collapsible panel (admin only) |

#### Settings tab
- Global LDR Threshold slider
- PIR Motion Timeout slider
- Global Manual Override toggle
- Save Configuration button (admin only)

### Polling

The dashboard polls `GET /api/devices` and `GET /api/stats` every **1 second**, matching the Arduino's telemetry rate for near-real-time updates.

### Authentication flow

1. User opens site → landing page
2. Clicks "Login" → `AuthModal` opens
3. Email/password or Google Sign-In
4. JWT stored in `localStorage`
5. Dashboard checks token on mount; logs out if invalid/expired
6. Token expiry: 1 day (configurable via `JWT_EXPIRES_IN`)

---

## 10. Automation Features

All automation settings are per-device and configured from the **Devices** tab → **Automation & Control** panel (admin only). They are stored in the `devices` table and delivered to the Arduino via the sync channel.

### 1. Brightness Override

Bypasses all sensor logic and forces the LED to a specific brightness.

- Toggle switch enables/disables override
- Slider: 0–100% → converted to 0–255 PWM
- Takes effect on the Arduino within 2 seconds (next sync cycle)
- Override badge appears on the device card while active

**API:** `POST /api/devices/:id/override`

### 2. Schedule

Defines a time window during which the node is allowed to be active. Outside the window, the LED stays off regardless of sensors.

- "Lights ON from" → `schedule_start` (HH:MM)
- "Lights OFF at" → `schedule_end` (HH:MM)
- **Overnight ranges supported:** e.g. 18:00 → 06:00 crosses midnight
- The backend computes `schedule_active: true/false` on each sync — the Arduino does **not** need a real-time clock
- "Clear schedule" resets both fields to null (24/7 operation)

**API:** `PUT /api/devices/:id/config`

### 3. Per-Device LDR Threshold

Overrides the global LDR sensitivity threshold for a specific node.

- Number input: 0–1023
- Higher value = lights arm earlier (more sensitive to darkness)
- Leave blank to inherit the global setting from the Settings tab
- "Use global" button resets to null

**API:** `PUT /api/devices/:id/config` (`ldr_threshold` field)

### 4. Auto-Dim Timer

Instead of the LED cutting off instantly when there's no motion, it stays at baseline brightness for N minutes before turning off. Useful for pedestrian paths where you don't want the light to go fully dark between detections.

- Range: Off / 1 – 30 minutes
- When set: LED goes Full → Baseline (after motion stops) → Off (after N minutes)
- When off: LED goes Full → Baseline immediately when motion clears

**API:** `PUT /api/devices/:id/config` (`auto_dim_delay` field)

---

## 11. Authentication & Roles

### Roles

| Role | Capabilities |
|---|---|
| `viewer` | View dashboard, see live telemetry, read-only |
| `admin` | All viewer permissions + override devices, save automation config, change global settings |

### Role assignment

- First user to register (email or Google) → automatically `admin`
- All subsequent users → `viewer`
- To promote a user to admin manually, use the `addAdmin.js` script:

```bash
cd backend
node src/db/addAdmin.js <email>
```

### JWT

- Signed with `JWT_SECRET` from `.env`
- Default expiry: 1 day (`JWT_EXPIRES_IN=1d`)
- Sent as `Authorization: Bearer <token>` header
- Admin-only routes use the `requireAdmin` middleware

### Google OAuth

- Configured via `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_KEY` in `.env`
- New Google users automatically get a generated username from their given name
- Existing email/password users who sign in with Google have their `google_id` linked

---

## 12. Environment Variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Backend port (default: `4000`) |
| `NODE_ENV` | No | `development` or `production` |
| `CLIENT_ORIGIN` | No | CORS origin (default: `http://localhost:5173`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon or local) |
| `JWT_SECRET` | Yes | Long random string for JWT signing |
| `JWT_EXPIRES_IN` | No | Token expiry (default: `1d`) |
| `GOOGLE_CLIENT_ID` | Yes (for Google auth) | Google OAuth client ID |
| `GOOGLE_CLIENT_KEY` | Yes (for Google auth) | Google OAuth client secret |
| `API_URL` | No | Backend URL for USB bridge (default: `http://localhost:4000/api/devices`) |
| `DEVICE_ID` | No | Device ID for sync (default: `arduino-uno`) |
| `STAT_YEARS_OF_RESEARCH` | No | Static stat shown on landing page |
| `STAT_SENSORS_INTEGRATED` | No | Static stat shown on landing page |
| `STAT_PWM_CHANNELS` | No | Static stat shown on landing page |

### `frontend/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Backend URL (default: `http://localhost:4000`) |
| `VITE_GOOGLE_CLIENT_ID` | Yes (for Google auth) | Google OAuth client ID |

---

## 13. Scripts Reference

### Root (`/`)

| Script | Command | Description |
|---|---|---|
| dev | `npm run dev` | Start Vite frontend dev server |
| dev:backend | `npm run dev:backend` | Start backend dev server |
| dev:all | `npm run dev:all` | Start both concurrently |
| build | `npm run build` | Build frontend for production |

### Backend (`/backend`)

| Script | Command | Description |
|---|---|---|
| start | `npm start` | Production server |
| dev | `npm run dev` | Dev server with `--watch` |
| migrate | `npm run migrate` | Run DB schema migration |
| seed | `npm run seed` | Seed mock device data |
| usb | `npm run usb` | Start USB serial bridge |

### USB bridge options

```bash
# Auto-detect Arduino
npm run usb

# Specify COM port
node usb-bridge.js COM7

# Specify COM port and baud rate
node usb-bridge.js COM7 9600
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `Access denied` on COM7 | Arduino IDE Serial Monitor is open | Close the Serial Monitor |
| `LDR: 0 \| Motion: false \| LED: 0` in bridge | Arduino sending old format | Flash updated sketch |
| Dashboard card not updating | Old sketch / bridge not running | Restart `npm run usb` |
| `Failed to fetch devices` in console | Backend not running | Start `npm run dev` in `/backend` |
| Device not appearing on Devices tab | Bridge not connecting to backend | Check `API_URL` in bridge env |
| Sync config not reaching Arduino | Bridge not running or sketch not updated | Restart bridge; reflash sketch |
| `ArduinoJson.h: No such file` | Library not installed | Arduino IDE → Library Manager → ArduinoJson |
