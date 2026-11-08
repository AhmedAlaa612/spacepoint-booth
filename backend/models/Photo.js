const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  satId: {
    type: String,
    required: true,
  },
  requestId: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: false,
  },
  imageBase64: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ['pending', 'captured', 'email_sent', 'failed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

const Photo = mongoose.model('Photo', photoSchema);

module.exports = Photo;
