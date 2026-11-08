# SpacePoint CubeSat Selfie System

A full-stack interactive exhibit where visitors scan a QR code, request a photo from a real ESP32-CAM satellite unit, preview the image live, and receive it by email — all in under 30 seconds.

---

## How It Works

```
Visitor (Browser)
    │  POST /api/take-photo  { email, satId }
    ▼
Node.js Backend  (server.js)
    │  Saves request to MongoDB as "pending"
    │  Polls DB every 1 second for up to 20 seconds
    ▼
Python MQTT Worker  (mqtt_worker.py)
    │  Detects "pending" request in DB
    │  Publishes  →  spacepoint/{satId}/command   { action, requestId }
    ▼
ESP32-CAM  (cubesat_selfie.ino)
    │  Receives command, takes JPEG photo
    │  Publishes  →  spacepoint/{satId}/photo     { requestId, imageBase64 }
    ▼
Python MQTT Worker
    │  Receives photo, writes Base64 image to MongoDB as "captured"
    ▼
Node.js Backend
    │  Polling detects "captured" → returns image to browser
    ▼
Visitor previews photo → clicks "Send to Email"
    │  POST /api/send-email  { email, imageBase64, requestId }
    ▼
Node.js Backend  (emailService.js)
    └─  Sends branded HTML email with inline photo via Gmail SMTP
```

---

## Project Structure

```
Selfi-Cubesat/
├── esp32/
│   └── cubesat_selfie.ino      # Arduino firmware for AI-Thinker ESP32-CAM
│
├── backend/
│   ├── server.js               # Node.js Express API  (port 3001)
│   ├── emailService.js         # Nodemailer email sender (Gmail SMTP)
│   ├── mqtt_worker.py          # Python: polls DB, bridges MQTT ↔ MongoDB
│   ├── simulator.js            # Optional: simulates ESP32 responses for testing
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── models/
│   │   └── Photo.js            # Mongoose schema for photo requests
│   ├── assets/
│   │   ├── spacepoint-logo.png # Embedded in outgoing emails
│   │   └── sef-logo.png        # Embedded in outgoing emails
│   ├── .env                    # Real secrets — NOT committed to git
│   └── .env.example            # Template — commit this, not .env
│
├── src/                        # React + Vite frontend
│   ├── App.tsx                 # Main app component
│   ├── index.css               # Global styles
│   └── components/             # UI components
│
├── .env                        # Frontend env (VITE_API_URL) — NOT committed
├── .env.example                # Frontend env template
├── package.json                # Frontend dependencies + Vite scripts
└── vite.config.ts              # Vite build config
```

---

## Prerequisites

Install these before anything else.

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Frontend + Backend |
| Python | 3.9+ | MQTT Worker |
| MongoDB | Community | Local database |
| Arduino IDE | 2.x | Uploading ESP32 firmware |

**Python packages:**
```bash
pip install paho-mqtt pymongo python-dotenv
```

**Arduino libraries** (install via Library Manager):
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon
- `Base64` by Arturo Guadalupi

**Arduino board package** (via Board Manager):
- `esp32` by Espressif Systems — select board: **AI Thinker ESP32-CAM**

---

## Environment Variables

### `backend/.env`
Create this file by copying `backend/.env.example`:
```bash
# MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/spacepoint

# MQTT broker — using an online broker (e.g., broker.emqx.io)
MQTT_BROKER_URL=broker.emqx.io

# Gmail SMTP — use a Gmail App Password (not your account password)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
```

### `.env` (root — frontend)
Create this file by copying `.env.example`:
```bash
# URL of the Node.js backend
VITE_API_URL=http://localhost:3001
```

> **Gmail App Password:** Go to myaccount.google.com → Security → 2-Step Verification → App Passwords → create one for "Mail".

---

## ESP32-CAM Firmware Setup

### 1. Open the firmware
Open `esp32/cubesat_selfie.ino` in Arduino IDE.

### 2. Fill in your credentials (lines 82–92)
```cpp
const char *WIFI_SSID     = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char    *MQTT_HOST = "broker.emqx.io"; // or your server IP
const uint16_t MQTT_PORT = 1883;

String MYSATID = "cubesat_test_1"; // must match the frontend URL ?satId=
```

> ⚠️ The `MYSATID` value must **exactly match** the `satId` the frontend sends. If the frontend URL is `/?satId=cubesat_A`, set `MYSATID = "cubesat_A"`.

### 3. Upload mode
- Connect a USB-to-Serial adapter (FTDI or CH340)
- Bridge **GPIO0 → GND** before powering on (enters flash mode)
- Set baud rate to **115200** in Arduino IDE
- Upload the sketch
- **Remove the GPIO0 bridge** then press the RST button

### 4. Verify in Serial Monitor
Open Serial Monitor at **115200 baud**. You should see:
```
SpacePoint CubeSat Camera Starting...
Camera initialized successfully!
WiFi Connected!  IP: 192.168.x.x
MQTT connected!
=== System Ready ===
Waiting for photo requests on MQTT...
```

If you see `Camera init FAILED` — check the camera ribbon cable connection and power supply.

---

## Running Everything Locally

Open **4 terminal windows** (or use the `Start_SpacePoint.bat` on the Desktop):

### Terminal 1 — MongoDB
```bash
mongod
```

### Terminal 2 — Node.js Backend
```bash
cd backend
npm install        # first time only
node server.js
```
> API available at `http://localhost:3001`

### Terminal 3 — Python MQTT Worker
```bash
cd backend
python mqtt_worker.py
```

### Terminal 4 — Frontend (Vite dev server)
```bash
npm install        # first time only (root folder)
npm run dev
```
> Frontend available at `http://localhost:5173`

---

## API Reference

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `POST` | `/api/take-photo` | `{ email, satId }` | Triggers photo request + polls for result |
| `POST` | `/api/send-email` | `{ email, imageBase64, requestId }` | Sends email with photo |

---

## MQTT Topics

All topics use the pattern `spacepoint/{satId}/...`

| Topic | Direction | Payload |
|---|---|---|
| `spacepoint/{satId}/command` | Worker → ESP32 | `{ "action": "take_photo", "requestId": "req_..." }` |
| `spacepoint/{satId}/photo` | ESP32 → Worker | `{ "requestId": "req_...", "imageBase64": "data:image/jpeg;base64,..." }` |

---

## MongoDB Document Lifecycle

Each photo request is a document in the `photos` collection:

```
pending  →  captured  →  email_sent
         ↘  failed
```

| Status | Meaning |
|---|---|
| `pending` | Request saved, waiting for ESP32 |
| `captured` | ESP32 returned an image |
| `email_sent` | Email delivered to user |
| `failed` | Timeout or hardware error |

---

## Testing Without Real Hardware

Use the simulator to fake ESP32 responses while the backend is running:
```bash
cd backend
node simulator.js
```
The simulator listens on MQTT for commands and publishes a fake image response, letting you test the full frontend → backend → email flow without the physical camera.

---

## Production Deployment

For a live installation (e.g. SEF exhibition):

1. **Host the backend** on a Linux VPS (Ubuntu/Debian).
2. **Configure NGINX** to serve the frontend and proxy API requests to the Node.js backend.
3. **Set your domain** (e.g., cubesat.spacepoint.ae) to point to your VPS public IP.
4. **Update `.env`** in root to your production URL: `VITE_API_URL=https://cubesat.spacepoint.ae`.
5. **Build the frontend** with `npm run build` and serve the `dist/` folder via NGINX.
6. **Point the ESP32** `MQTT_HOST` to the online broker (e.g., `broker.emqx.io`).