const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Connect to the database
    // Fallback to localhost if no MONGO_URI is specified in .env
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spacepoint';
    await mongoose.connect(mongoURI);
    console.log(`🍃 MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Exit process with failure if we can't connect to the DB
    process.exit(1);
  }
};

module.exports = connectDB;
