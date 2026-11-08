const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mqtt = require("mqtt");
const { sendPhotoEmail } = require("./emailService");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ===================== IN-MEMORY STATE =====================
// Active satellites: satId -> { satId, boothName, status, cameraReady, heap, lastSeen }
const satellites = new Map();
// Active capture requests: requestId -> { res, timer, satId }
const pendingRequests = new Map();

const SATELLITE_TIMEOUT_SECONDS = 30;
const CAPTURE_TIMEOUT_MS = 20000;

// ===================== DIRECT MQTT CLIENT =====================
const rawBroker = (process.env.MQTT_BROKER_URL || "broker.emqx.io").replace(/^mqtt:\/\//, "");
const mqttUrl = `mqtt://${rawBroker}:1883`;
const mqttClientId = `spacepoint_backend_${Math.random().toString(16).slice(2, 10)}`;

console.log(`🔌 Connecting to MQTT broker: ${mqttUrl} (clientId: ${mqttClientId})...`);
const mqttClient = mqtt.connect(mqttUrl, {
  clientId: mqttClientId,
  clean: true,
  connectTimeout: 10000,
  reconnectPeriod: 2000,
});

mqttClient.on("connect", () => {
  console.log(`✅ Connected to MQTT broker: ${mqttUrl}`);
  mqttClient.subscribe(["spacepoint/+/status", "spacepoint/+/photo"], { qos: 0 }, (err) => {
    if (err) {
      console.error("❌ MQTT subscribe error:", err);
    } else {
      console.log("📡 Subscribed to spacepoint/+/status and spacepoint/+/photo");
    }
  });
});

mqttClient.on("error", (err) => {
  console.error("❌ MQTT Error:", err.message);
});

mqttClient.on("message", (topic, messageBuffer) => {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== "spacepoint") return;

  const satId = parts[1];
  const msgType = parts[2];

  // 1. Heartbeat / Status message: spacepoint/{satId}/status
  if (msgType === "status") {
    try {
      const payload = JSON.parse(messageBuffer.toString("utf8"));
      satellites.set(satId, {
        satId,
        boothName: payload.boothName || satId,
        status: payload.status || "online",
        cameraReady: Boolean(payload.cam),
        heap: payload.heap || 0,
        lastSeen: Date.now() / 1000,
      });
    } catch (err) {
      console.warn(`⚠️ Failed to parse status from ${satId}:`, err.message);
    }
    return;
  }

  // 2. Photo response message: spacepoint/{satId}/photo
  if (msgType === "photo") {
    try {
      const payload = JSON.parse(messageBuffer.toString("utf8"));
      const reqId = payload.requestId;
      if (!reqId) return;

      const pending = pendingRequests.get(reqId);
      if (!pending) {
        console.warn(`⚠️ Received photo for unknown or expired requestId: ${reqId}`);
        return;
      }

      clearTimeout(pending.timer);
      pendingRequests.delete(reqId);

      if (payload.error) {
        console.error(`❌ ESP32 (${satId}) reported error for ${reqId}: ${payload.error}`);
        if (!pending.res.headersSent) {
          return pending.res.status(200).json({
            success: false,
            error: payload.error,
            requestId: reqId,
          });
        }
      } else if (payload.imageBase64) {
        console.log(`📸 Received photo from ${satId} for ${reqId} (${payload.imageBase64.length} chars)`);
        if (!pending.res.headersSent) {
          return pending.res.status(200).json({
            success: true,
            message: "Photo captured successfully!",
            requestId: reqId,
            imageBase64: payload.imageBase64,
          });
        }
      }
    } catch (err) {
      console.error(`❌ Failed to parse photo MQTT message from ${satId}:`, err.message);
    }
  }
});

// Helper to prune offline satellites
function pruneStaleSatellites() {
  const cutoff = Date.now() / 1000 - SATELLITE_TIMEOUT_SECONDS;
  for (const [satId, info] of satellites.entries()) {
    if (info.lastSeen < cutoff) {
      console.log(`🔴 Satellite ${satId} went offline (no heartbeat for ${SATELLITE_TIMEOUT_SECONDS}s)`);
      satellites.delete(satId);
    }
  }
}

setInterval(pruneStaleSatellites, 5000);

// ===================== ROUTES =====================

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mqttConnected: mqttClient.connected,
    onlineSatellites: satellites.size,
    message: "CubeSat Backend (Direct MQTT) is running!",
  });
});

// Auto-discovery: returns all satellites seen in the last 30 seconds
app.get("/api/satellites", (req, res) => {
  pruneStaleSatellites();
  const list = Array.from(satellites.values()).sort((a, b) => a.satId.localeCompare(b.satId));
  res.json({ success: true, satellites: list });
});

// Main endpoint for requesting a photo
app.post("/api/take-photo", (req, res) => {
  try {
    const { email, satId } = req.body;

    if (!satId) {
      return res.status(400).json({ success: false, error: "Missing satId (CubeSat ID)" });
    }

    if (!mqttClient.connected) {
      return res.status(503).json({ success: false, error: "MQTT broker not connected" });
    }

    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const commandTopic = `spacepoint/${satId}/command`;
    const commandPayload = JSON.stringify({ action: "take_photo", requestId });

    console.log(`[REQUEST] Requesting photo from ${satId} (reqId: ${requestId}, email: ${email || "n/a"})`);

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      console.warn(`⏱️ Timeout waiting for photo from ${satId} (reqId: ${requestId})`);
      if (!res.headersSent) {
        res.status(200).json({
          success: false,
          error: "Hardware timeout. The CubeSat did not respond in time.",
          requestId,
        });
      }
    }, CAPTURE_TIMEOUT_MS);

    pendingRequests.set(requestId, { res, timer, satId });

    mqttClient.publish(commandTopic, commandPayload, { qos: 0 }, (err) => {
      if (err) {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        console.error(`❌ Failed to publish take_photo command to ${commandTopic}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: "Failed to publish MQTT command" });
        }
      } else {
        console.log(`🚀 Published take_photo command to ${commandTopic} (${requestId})`);
      }
    });
  } catch (error) {
    console.error("❌ Error in /api/take-photo:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint for sending the email after the user previews it
app.post("/api/send-email", async (req, res) => {
  try {
    const { email, imageBase64, requestId } = req.body;

    if (!email || !imageBase64) {
      return res.status(400).json({ success: false, error: "Missing email or image data" });
    }

    await sendPhotoEmail(email, imageBase64, requestId);
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("❌ Error in /api/send-email:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 CubeSat Direct-MQTT Server listening on http://localhost:${PORT}`);
});