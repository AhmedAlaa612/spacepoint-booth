const mongoose = require('mongoose');

// Schema for auto-discovered satellites
// The Python MQTT worker upserts records here whenever it receives
// a heartbeat from an ESP32 on the spacepoint/{satId}/status topic.
const satelliteSchema = new mongoose.Schema({
  satId:        { type: String, required: true, unique: true },
  boothName:    { type: String, default: 'Unknown Booth' },
  status:       { type: String, default: 'online' },       // 'online'
  cameraReady:  { type: Boolean, default: false },
  heap:         { type: Number, default: 0 },
  lastSeen:     { type: Number, required: true },           // Unix timestamp (seconds)
}, { timestamps: true });

module.exports = mongoose.model('Satellite', satelliteSchema);
