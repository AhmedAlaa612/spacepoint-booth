const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const { sendPhotoEmail } = require("./emailService");
const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Test Route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "CubeSat Backend is running!" });
});

// Auto-discovery: returns all satellites currently online
// The Python MQTT worker populates the 'satellites' collection from ESP32 heartbeats
app.get("/api/satellites", async (req, res) => {
  try {
    const Satellite = require('./models/Satellite');
    // Only return satellites seen in the last 30 seconds
    const cutoff = (Date.now() / 1000) - 30;
    const satellites = await Satellite.find({ lastSeen: { $gte: cutoff } })
      .select('satId boothName status cameraReady lastSeen')
      .sort({ satId: 1 });
    res.json({ success: true, satellites });
  } catch (error) {
    console.error("❌ Error fetching satellites:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Main endpoint for requesting a photo
app.post("/api/take-photo", async (req, res) => {
  try {
    const { email, satId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Missing email address" });
    }
    
    if (!satId) {
      return res.status(400).json({ success: false, error: "Missing satId (CubeSat ID)" });
    }

    console.log(`[REQUEST] User requested photo from ${satId}. Email: ${email}`);
    
    // Generate a unique request ID
    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Save to DB as pending
    const Photo = require('./models/Photo');
    const newPhoto = new Photo({
      satId,
      requestId,
      email,
      status: 'pending'
    });
    await newPhoto.save();
    console.log(`📋 Request ${requestId} saved to DB as pending.`);

    // Poll DB for completion (Timeout after 20 seconds)
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const photo = await Photo.findOne({ requestId });
        
        if (photo && photo.status === 'captured') {
          clearInterval(pollInterval);
          if (!res.headersSent) {
            return res.status(200).json({ success: true, message: "Photo captured successfully!", requestId: photo.requestId, imageBase64: photo.imageBase64 });
          }
        }
        
        if (photo && photo.status === 'failed') {
          clearInterval(pollInterval);
          if (!res.headersSent) {
            return res.status(504).json({ success: false, error: "Hardware timeout. The CubeSat did not respond in time.", requestId });
          }
        }
        
        if (attempts > 20) { // 20 seconds maximum polling
          clearInterval(pollInterval);
          await Photo.findOneAndUpdate({ requestId }, { status: 'failed' });
          if (!res.headersSent) {
            return res.status(504).json({ success: false, error: "Timeout waiting for Python worker.", requestId });
          }
        }
      } catch (pollErr) {
        console.error("Error polling DB:", pollErr);
        clearInterval(pollInterval);
        if (!res.headersSent) {
          return res.status(500).json({ success: false, error: "Database polling error." });
        }
      }
    }, 1000);

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
    
    // Update DB status to 'email_sent'
    try {
      const Photo = require('./models/Photo');
      await Photo.findOneAndUpdate({ requestId }, { status: 'email_sent' });
    } catch (dbErr) {
      console.error("❌ Error updating photo status to email_sent in DB:", dbErr);
    }

    res.status(200).json({ success: true, message: "Email sent successfully!" });

  } catch (error) {
    console.error("❌ Error in /api/send-email:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
