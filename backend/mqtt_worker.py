import os
import time
import json
import paho.mqtt.client as mqtt
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables (such as MONGO_URI and MQTT_BROKER_URL)
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/spacepoint")
client = MongoClient(MONGO_URI)
db = client.get_database()
photos_collection = db["photos"]
satellites_collection = db["satellites"]

# The MQTT broker is now hosted on our own server (Mosquitto)
MQTT_BROKER = os.getenv("MQTT_BROKER_URL", "127.0.0.1").replace("mqtt://", "")

# How many seconds before a satellite is considered offline (no heartbeat received)
SATELLITE_TIMEOUT_SECONDS = 30

def on_connect(client, userdata, flags, rc):
    print(f"🔌 Python Worker Connected to MQTT Broker: {MQTT_BROKER}")
    # Subscribe to all CubeSat photo response topics
    client.subscribe("spacepoint/+/photo")
    print("📡 Subscribed to spacepoint/+/photo")
    # Subscribe to all CubeSat heartbeat/status topics for auto-discovery
    client.subscribe("spacepoint/+/status")
    print("📡 Subscribed to spacepoint/+/status (auto-discovery)")

def on_message(client, userdata, msg):
    topic = msg.topic
    parts = topic.split('/')
    
    # --- Handle heartbeat/status messages: spacepoint/{satId}/status ---
    if len(parts) == 3 and parts[2] == 'status':
        satId = parts[1]
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            cam_ready = payload.get("cam", False)
            heap = payload.get("heap", 0)
            booth_name = payload.get("boothName", satId)
            
            # Upsert the satellite record with the latest heartbeat time
            satellites_collection.update_one(
                {"satId": satId},
                {"$set": {
                    "satId": satId,
                    "boothName": booth_name,
                    "status": "online",
                    "cameraReady": cam_ready,
                    "heap": heap,
                    "lastSeen": time.time()
                }},
                upsert=True
            )
        except Exception as e:
            print(f"⚠️ Failed to parse status from {satId}: {e}")
        return

    # --- Handle photo responses: spacepoint/{satId}/photo ---
    if len(parts) == 3 and parts[2] == 'photo':
        satId = parts[1]
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            reqId = payload.get("requestId", "")
            
            # Check if the ESP32 sent back an error
            if "error" in payload and reqId:
                error_msg = payload["error"]
                print(f"❌ ESP32 reported error for request {reqId}: {error_msg}")
                photos_collection.update_one(
                    {"requestId": reqId},
                    {"$set": {"status": "failed", "error": error_msg}}
                )
            elif "imageBase64" in payload and reqId:
                print(f"📸 Received photo via MQTT from {satId} for request {reqId}")
                photos_collection.update_one(
                    {"requestId": reqId},
                    {"$set": {
                        "imageBase64": payload["imageBase64"], 
                        "status": "captured"
                    }}
                )
            else:
                print(f"⚠️ Received invalid payload from {satId}")
        except Exception as e:
            print(f"❌ Failed to parse MQTT message from {satId}: {e}")

# Setup MQTT Client
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

print("Connecting to MQTT...")
mqtt_client.connect(MQTT_BROKER, 1883, 60)
mqtt_client.loop_start()

print("🚀 Python MQTT Worker Started. Polling for pending requests...")

# Dictionary to keep track of requests currently sent to the hardware
# Format: { 'cubesat_A': { 'requestId': 'req_123', 'time': 1612345678 } }
active_requests = {}

while True:
    try:
        # --- Prune stale satellites that stopped heartbeating ---
        cutoff = time.time() - SATELLITE_TIMEOUT_SECONDS
        stale = satellites_collection.find({"lastSeen": {"$lt": cutoff}})
        for sat in stale:
            print(f"🔴 Satellite {sat['satId']} went offline (no heartbeat for {SATELLITE_TIMEOUT_SECONDS}s)")
        satellites_collection.delete_many({"lastSeen": {"$lt": cutoff}})

        # Get a list of all CubeSats that have at least one 'pending' request
        pending_sats = photos_collection.distinct("satId", {"status": "pending"})
        
        for satId in pending_sats:
            # If we are already waiting for a photo from this CubeSat, check for timeout
            if satId in active_requests:
                if time.time() - active_requests[satId]['time'] > 15:
                    print(f"⏱️ Timeout waiting for photo from {satId} for request {active_requests[satId]['requestId']}")
                    photos_collection.update_one(
                        {"requestId": active_requests[satId]['requestId']},
                        {"$set": {"status": "failed"}}
                    )
                    del active_requests[satId]
                continue
                
            # If the CubeSat is free, grab its oldest pending request (FIFO Queue)
            oldest_req = photos_collection.find_one(
                {"satId": satId, "status": "pending"},
                sort=[("createdAt", 1)]
            )
            
            if oldest_req:
                reqId = oldest_req["requestId"]
                print(f"⏳ Processing request {reqId} for {satId}...")
                
                # Send the command to the ESP32 via MQTT
                topic = f"spacepoint/{satId}/command"
                payload = json.dumps({"action": "take_photo", "requestId": reqId})
                mqtt_client.publish(topic, payload, qos=1)
                print(f"🚀 Sent take_photo command to {topic}")
                
                # Mark this CubeSat as busy
                active_requests[satId] = {
                    "requestId": reqId,
                    "time": time.time()
                }
                
    except Exception as e:
        print(f"❌ Worker loop error: {e}")
        
    # Check if any active requests were fulfilled by the on_message callback
    # We do this by checking if the DB status changed from 'pending'
    for satId in list(active_requests.keys()):
        reqId = active_requests[satId]["requestId"]
        check_req = photos_collection.find_one({"requestId": reqId})
        if check_req and check_req.get("status") in ["captured", "failed"]:
            print(f"🎉 Request {reqId} completed (Status: {check_req.get('status')})!")
            del active_requests[satId]

    # Sleep briefly to prevent high CPU usage
    time.sleep(1)
