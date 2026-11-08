const mqtt = require('mqtt');

// Connect to the same broker as the server
const brokerUrl = 'mqtt://broker.emqx.io';
const client = mqtt.connect(brokerUrl);

const MY_SAT_ID = 'cubesat_test_1'; // We are pretending to be this CubeSat

client.on('connect', () => {
  console.log(`🤖 [ESP32 Simulator] Connected to MQTT broker: ${brokerUrl}`);
  
  // Listen for commands targeting this specific CubeSat
  client.subscribe(`spacepoint/${MY_SAT_ID}/command`, (err) => {
    if (!err) {
      console.log(`🤖 [ESP32 Simulator] Listening for commands on spacepoint/${MY_SAT_ID}/command`);
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`\n🤖 [ESP32 Simulator] Received message on topic: ${topic}`);
  
  try {
    const payload = JSON.parse(message.toString());
    
    if (payload.action === 'take_photo' && payload.requestId) {
      console.log(`🤖 [ESP32 Simulator] 📸 Taking photo for request: ${payload.requestId}...`);
      
      // Simulate the time it takes for hardware to capture a photo (2 seconds)
      setTimeout(() => {
        const responseTopic = `spacepoint/${MY_SAT_ID}/photo`;
        
        // In reality, this would be a real base64 jpeg. We send a tiny fake 1x1 pixel image.
        const fakeImageBase64 = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
        
        const responsePayload = JSON.stringify({
          requestId: payload.requestId,
          imageBase64: fakeImageBase64
        });

        console.log(`🤖 [ESP32 Simulator] 📤 Sending photo back on ${responseTopic}...`);
        client.publish(responseTopic, responsePayload, { qos: 1 });
      }, 2000);
    }
  } catch (error) {
    console.error("🤖 [ESP32 Simulator] Error parsing message:", error);
  }
});
