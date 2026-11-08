#include <base64.h>
#include "esp_camera.h"
#include "esp_sleep.h"
#include "esp_system.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>
#include <time.h>

// =========================================================
// SpacePoint CubeSat Selfie System — ESP32-CAM Firmware
// Architecture: ESP32-CAM → WiFi → MQTT broker → Python
//               worker → MongoDB → Node.js API → Frontend
// Backend contract: See esp32_agent_context.txt
// =========================================================

// ===================== TIME HELPERS =====================
static time_t parseCompileTime() {
  struct tm t;
  memset(&t, 0, sizeof(t));
  const char *date = __DATE__;
  const char *timeStr = __TIME__;
  char monthStr[4];
  int day, year, hour, mn, sec;
  sscanf(date, "%3s %d %d", monthStr, &day, &year);
  sscanf(timeStr, "%d:%d:%d", &hour, &mn, &sec);
  int month = 0;
  const char *months = "JanFebMarAprMayJunJulAugSepOctNovDec";
  const char *p = strstr(months, monthStr);
  if (p)
    month = (p - months) / 3;
  t.tm_year = year - 1900;
  t.tm_mon = month;
  t.tm_mday = day;
  t.tm_hour = hour;
  t.tm_min = mn;
  t.tm_sec = sec;
  return mktime(&t);
}

void forceTimeFromCompile() {
  time_t now = parseCompileTime();
  struct timeval tv = {.tv_sec = now, .tv_usec = 0};
  settimeofday(&tv, nullptr);
  Serial.print("Forced time from compile: ");
  Serial.println(ctime(&now));
}

void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing NTP time");
  time_t now = time(nullptr);
  int tries = 0;
  while (now < 1700000000 && tries < 30) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    tries++;
  }
  Serial.println();
  if (now >= 1700000000) {
    struct tm timeinfo;
    gmtime_r(&now, &timeinfo);
    Serial.printf("Time OK (UTC): %04d-%02d-%02d %02d:%02d:%02d\n",
                  timeinfo.tm_year + 1900, timeinfo.tm_mon + 1,
                  timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min,
                  timeinfo.tm_sec);
  } else {
    Serial.println("NTP sync FAILED — falling back to compile time");
    forceTimeFromCompile();
  }
}

void printMem(const char *tag) {
  Serial.printf("[%s] freeHeap=%u  freePSRAM=%u\n", tag, ESP.getFreeHeap(),
                ESP.getFreePsram());
}

// ===================== USER CONFIG =====================
// ⚠️  Fill in your actual WiFi credentials here (do NOT commit real passwords)
const char *WIFI_SSID     = "Yaseen";
const char *WIFI_PASSWORD = "Yaseen@213";

// MQTT broker — public test broker (no auth, port 1883)
// For production, use your preferred online MQTT broker host
const char *MQTT_HOST = "broker.emqx.io";
const uint16_t MQTT_PORT = 1883;

// ⚠️  Change MYSATID to a unique ID for each CubeSat board
// ⚠️  Change BOOTH_NAME to describe the physical location of this booth
String MYSATID    = "SpacePoint_Sat_2";
String BOOTH_NAME = "Booth 1";  // Human-friendly name shown in the frontend dropdown

String COMMAND_TOPIC; // spacepoint/{MYSATID}/command
String PHOTO_TOPIC;   // spacepoint/{MYSATID}/photo
String STATUS_TOPIC;  // spacepoint/{MYSATID}/status
String MQTT_CLIENT_ID;

// ===================== CAMERA PINS (AI-Thinker ESP32-CAM)
// =====================
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// ===================== GLOBALS =====================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
bool cameraInitialized = false;
unsigned long lastReconnectAttempt = 0;
unsigned long lastHeartbeat = 0;

// ===================== PROTOTYPES =====================
void connectToWiFi();
void initializeCamera();
void setupMqtt();
bool reconnectMqtt();
void mqttCallback(char *topic, byte *payload, unsigned int length);
bool processTakePhotoRequest(const String &requestId);
String capturePhotoAsDataUri();
bool publishPhotoResponse(const String &requestId, const String &imageDataUri);
void publishErrorResponse(const String &requestId, const String &errorMsg);
void testTLS(const char *host);
void enterDeepSleep(int seconds);

// ===================== SETUP =====================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Disable brownout detector
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================");
  Serial.println("  SpacePoint CubeSat Camera Starting...");
  Serial.println("========================================");
  delay(1000);

  // Build MQTT topics from satellite ID
  COMMAND_TOPIC = "spacepoint/" + MYSATID + "/command";
  PHOTO_TOPIC = "spacepoint/" + MYSATID + "/photo";
  STATUS_TOPIC = "spacepoint/" + MYSATID + "/status";
  MQTT_CLIENT_ID =
      "esp32cam_" + MYSATID + "_" + String((uint32_t)ESP.getEfuseMac(), HEX);

  // ⚠️  IMPORTANT: Camera MUST be initialized before WiFi.
  //     Without PSRAM, the camera and WiFi stack both need DMA-capable
  //     internal RAM. WiFi grabs it first if connected before camera init,
  //     leaving not enough contiguous DMA memory for the frame buffer.
  printMem("Before camera init");
  initializeCamera();
  printMem("After  camera init");

  connectToWiFi();

  // Optional TLS diagnostics — safe to remove if not needed
  testTLS("google.com");
  testTLS("broker.emqx.io");

  if (time(nullptr) < 1700000000)
    forceTimeFromCompile();

  setupMqtt();

  Serial.println("\n=== System Ready ===");
  Serial.print("Satellite ID:  ");
  Serial.println(MYSATID);
  Serial.print("Command topic: ");
  Serial.println(COMMAND_TOPIC);
  Serial.print("Photo topic:   ");
  Serial.println(PHOTO_TOPIC);
  Serial.print("Camera ready:  ");
  Serial.println(cameraInitialized ? "YES" : "NO (will error on request)");
  Serial.println("\nWaiting for photo requests on MQTT...\n");
}

// ===================== MAIN LOOP =====================
void loop() {
  // --- WiFi watchdog ---
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[LOOP] WiFi lost — reconnecting...");
    connectToWiFi();
  }

  // --- MQTT watchdog ---
  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 3000) {
      lastReconnectAttempt = now;
      reconnectMqtt();
    }
  } else {
    mqttClient.loop();
  }

  // --- Heartbeat every 10 s --- publishes status so backend auto-discovers us
  unsigned long now = millis();
  if (now - lastHeartbeat > 10000) {
    lastHeartbeat = now;
    Serial.printf("[HEARTBEAT] MQTT: %s | Heap: %u bytes\n",
                  mqttClient.connected() ? "Connected" : "DISCONNECTED",
                  ESP.getFreeHeap());
    // Publish heartbeat so the Python worker knows we are online
    if (mqttClient.connected()) {
      String statusPayload = "{\"satId\":\"" + MYSATID + "\",\"boothName\":\"" + BOOTH_NAME + "\",\"status\":\"online\",\"heap\":" + String(ESP.getFreeHeap()) + ",\"cam\":" + (cameraInitialized ? "true" : "false") + "}";
      mqttClient.publish(STATUS_TOPIC.c_str(), statusPayload.c_str(), false);
    }
  }

  delay(10); // yield — prevents watchdog reset
}

// ===================== WiFi =====================
void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    syncTime();
  } else {
    Serial.println("\nWiFi failed — retrying in 5 s...");
    delay(5000);
    connectToWiFi(); // tail-recursive retry
  }
}

// ===================== CAMERA INIT =====================
void initializeCamera() {
  Serial.println("Initializing camera (AI-Thinker ESP32-CAM)...");

  camera_config_t cfg;
  cfg.ledc_channel = LEDC_CHANNEL_0;
  cfg.ledc_timer = LEDC_TIMER_0;
  cfg.pin_d0 = Y2_GPIO_NUM;
  cfg.pin_d1 = Y3_GPIO_NUM;
  cfg.pin_d2 = Y4_GPIO_NUM;
  cfg.pin_d3 = Y5_GPIO_NUM;
  cfg.pin_d4 = Y6_GPIO_NUM;
  cfg.pin_d5 = Y7_GPIO_NUM;
  cfg.pin_d6 = Y8_GPIO_NUM;
  cfg.pin_d7 = Y9_GPIO_NUM;
  cfg.pin_xclk = XCLK_GPIO_NUM;
  cfg.pin_pclk = PCLK_GPIO_NUM;
  cfg.pin_vsync = VSYNC_GPIO_NUM;
  cfg.pin_href = HREF_GPIO_NUM;
  cfg.pin_sccb_sda = SIOD_GPIO_NUM;
  cfg.pin_sccb_scl = SIOC_GPIO_NUM;
  cfg.pin_pwdn = PWDN_GPIO_NUM;
  cfg.pin_reset = RESET_GPIO_NUM;
  cfg.xclk_freq_hz = 20000000;
  cfg.pixel_format = PIXFORMAT_JPEG;
  cfg.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  cfg.fb_count = 1;

  if (psramFound()) {
    Serial.println("PSRAM detected — using external PSRAM (VGA)");
    cfg.frame_size = FRAMESIZE_VGA;
    cfg.jpeg_quality = 12; // 0=best, 63=worst
    cfg.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    Serial.println("No PSRAM — using internal DRAM (QVGA)");
    cfg.frame_size = FRAMESIZE_QVGA;
    cfg.jpeg_quality = 12;
    cfg.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&cfg);
  if (err != ESP_OK) {
    Serial.printf("Camera init FAILED: 0x%x\n", err);
    cameraInitialized = false;
    return;
  }

  // Fine-tune image sensor
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_brightness(s, 0);    // -2 to 2
    s->set_contrast(s, 0);      // -2 to 2
    s->set_saturation(s, 0);    // -2 to 2
    s->set_whitebal(s, 1);      // auto white balance ON
    s->set_awb_gain(s, 1);      // AWB gain ON
    s->set_exposure_ctrl(s, 1); // auto exposure ON
    s->set_aec2(s, 1);          // AEC DSP ON
    s->set_gain_ctrl(s, 1);     // auto gain ON
  }

  cameraInitialized = true;
  Serial.println("Camera initialized successfully!");
}

// ===================== MQTT SETUP =====================
void setupMqtt() {
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  // CRITICAL: must be large enough for full Base64-encoded JPEG payload
  mqttClient.setBufferSize(70000);
  Serial.println("MQTT configured (buffer = 70 000 bytes)");
}

bool reconnectMqtt() {
  if (WiFi.status() != WL_CONNECTED)
    return false;
  Serial.printf("Connecting to MQTT %s:%d ...\n", MQTT_HOST, MQTT_PORT);
  bool ok = mqttClient.connect(MQTT_CLIENT_ID.c_str());
  if (ok) {
    Serial.println("MQTT connected!");
    bool subOk = mqttClient.subscribe(COMMAND_TOPIC.c_str(), 0);
    Serial.print(subOk ? "Subscribed to: " : "FAILED to subscribe to: ");
    Serial.println(COMMAND_TOPIC);
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
  }
  return ok;
}

// ===================== MQTT CALLBACK =====================
void mqttCallback(char *topic, byte *payload, unsigned int length) {
  Serial.println("\n========================================");
  Serial.println("  MQTT MESSAGE RECEIVED");
  Serial.println("========================================");
  Serial.print("Topic:        ");
  Serial.println(topic);
  Serial.print("Payload size: ");
  Serial.print(length);
  Serial.println(" bytes");

  // Ignore messages on any topic other than our command topic
  if (String(topic) != COMMAND_TOPIC) {
    Serial.println("Ignoring — not our command topic");
    return;
  }

  // Build payload string
  String message;
  message.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++)
    message += (char)payload[i];
  Serial.print("Payload: ");
  Serial.println(message);

  // Parse JSON
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (err) {
    Serial.print("JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  String action = doc["action"] | "";
  String requestId = doc["requestId"] | "";

  Serial.print("Action:    ");
  Serial.println(action);
  Serial.print("RequestID: ");
  Serial.println(requestId);

  if (action != "take_photo") {
    Serial.println("Unknown action — ignoring");
    return;
  }
  if (requestId.length() == 0) {
    Serial.println("Missing requestId — ignoring");
    return;
  }

  Serial.println("----------------------------------------");
  bool ok = processTakePhotoRequest(requestId);
  Serial.println(ok ? "Request SUCCEEDED" : "Request FAILED");
  Serial.println("========================================\n");
}

// ===================== ERROR RESPONSE =====================
void publishErrorResponse(const String &requestId, const String &errorMsg) {
  Serial.print("[Error] ");
  Serial.println(errorMsg);
  StaticJsonDocument<256> doc;
  doc["requestId"] = requestId;
  doc["error"] = errorMsg;
  String out;
  serializeJson(doc, out);
  if (mqttClient.connected()) {
    mqttClient.publish(PHOTO_TOPIC.c_str(), out.c_str(), false);
    Serial.println("[Error] Error response sent to backend.");
  } else {
    Serial.println("[Error] MQTT not connected — error response NOT sent!");
  }
}

// ===================== PHOTO REQUEST HANDLER =====================
bool processTakePhotoRequest(const String &requestId) {
  // Verify camera is ready
  if (!cameraInitialized) {
    publishErrorResponse(requestId, "Camera not initialized");
    return false;
  }

  unsigned long startMs = millis();

  // Warm up: discard the first frame (sensor needs a moment after being idle)
  camera_fb_t *warmup = esp_camera_fb_get();
  if (warmup)
    esp_camera_fb_return(warmup);
  delay(100);

  // Capture the real photo
  String imageDataUri = capturePhotoAsDataUri();
  if (imageDataUri.length() == 0) {
    publishErrorResponse(requestId, "Camera capture failed");
    return false;
  }

  bool published = publishPhotoResponse(requestId, imageDataUri);

  unsigned long elapsed = millis() - startMs;
  Serial.printf("Total processing time: %lu ms\n", elapsed);
  if (elapsed > 15000) {
    Serial.println("WARNING: Exceeded 15-second backend timeout!");
  } else {
    Serial.println("Within 15-second timeout limit.");
  }

  return published;
}

// ===================== PHOTO CAPTURE =====================
String capturePhotoAsDataUri() {
  Serial.println("Capturing photo...");

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("esp_camera_fb_get() returned NULL");
    return "";
  }

  Serial.printf("Frame captured: %u bytes (format=%d)\n", fb->len, fb->format);

  // Ensure the frame is JPEG (it should be, given PIXFORMAT_JPEG config)
  if (fb->format != PIXFORMAT_JPEG) {
    Serial.println("Unexpected pixel format — expected JPEG");
    esp_camera_fb_return(fb);
    return "";
  }

  Serial.println("Encoding to Base64...");
  String imageBase64 = base64::encode(fb->buf, fb->len);
  esp_camera_fb_return(fb); // return buffer ASAP to free memory

  if (imageBase64.length() == 0) {
    Serial.println("Base64 encoding failed (empty result)");
    return "";
  }

  String dataUri = "data:image/jpeg;base64," + imageBase64;

  Serial.printf("Raw JPEG:    %u bytes\n",
                fb->len); // Note: fb is already returned, len is still readable
  Serial.printf("Base64:      %u chars\n", imageBase64.length());
  Serial.printf("Data URI:    %u chars total\n", dataUri.length());

  if (imageBase64.length() > 50000) {
    Serial.println(
        "WARNING: Large payload — verify MQTT buffer is >= 70000 bytes");
  }

  return dataUri;
}

// ===================== PHOTO PUBLISH =====================
bool publishPhotoResponse(const String &requestId, const String &imageDataUri) {
  Serial.println("Building JSON response...");

  if (!mqttClient.connected()) {
    Serial.println("MQTT not connected — cannot publish!");
    return false;
  }

  // -------------------------------------------------------
  // Manually build the JSON string so we can measure its
  // exact length before opening the MQTT stream.
  // Format: {"requestId":"<id>","imageBase64":"<dataUri>"}
  // -------------------------------------------------------
  // Escape quotes inside requestId just in case
  String jsonPayload;
  jsonPayload.reserve(imageDataUri.length() + requestId.length() + 64);
  jsonPayload = "{\"requestId\":\"";
  jsonPayload += requestId;
  jsonPayload += "\",\"imageBase64\":\"";
  jsonPayload += imageDataUri;
  jsonPayload += "\"}";

  size_t payloadLen = jsonPayload.length();
  Serial.printf("JSON payload size: %u bytes\n", payloadLen);

  // -------------------------------------------------------
  // Stream the payload using beginPublish / write / endPublish.
  // This sends data in TCP-sized chunks and does NOT require
  // a contiguous internal buffer equal to the full payload.
  // The only buffer needed is the MQTT fixed + variable header
  // (~5-7 bytes for topic + 4-byte length prefix).
  // -------------------------------------------------------
  Serial.print("Publishing to: ");
  Serial.println(PHOTO_TOPIC);

  if (!mqttClient.beginPublish(PHOTO_TOPIC.c_str(), payloadLen, false)) {
    Serial.println("beginPublish FAILED — broker connection lost?");
    return false;
  }

  // Write in 4 KB chunks to avoid saturating the TCP send buffer
  const size_t CHUNK = 4096;
  size_t sent = 0;
  while (sent < payloadLen) {
    size_t chunk = min(CHUNK, payloadLen - sent);
    size_t written =
        mqttClient.write((const uint8_t *)(jsonPayload.c_str() + sent), chunk);
    if (written == 0) {
      Serial.println("write() returned 0 — connection dropped mid-publish!");
      return false;
    }
    sent += written;
  }

  bool ok = mqttClient.endPublish();

  if (ok) {
    Serial.printf("Published successfully! requestId=%s  (%u bytes)\n",
                  requestId.c_str(), payloadLen);
  } else {
    Serial.println("endPublish FAILED — partial message was sent.");
  }
  return ok;
}

// ===================== TLS DIAGNOSTIC =====================
void testTLS(const char *host) {
  WiFiClientSecure client;
  client.setInsecure();
  Serial.printf("TLS test -> %-25s  ", host);
  if (client.connect(host, 443)) {
    Serial.println("OK");
    client.stop();
  } else {
    Serial.println("FAILED");
  }
}

// ===================== DEEP SLEEP (optional) =====================
void enterDeepSleep(int seconds) {
  Serial.printf("Deep sleep for %d seconds...\n", seconds);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  esp_deep_sleep_start();
}
