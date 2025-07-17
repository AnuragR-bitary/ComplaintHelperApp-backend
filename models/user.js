const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  keycloakId: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: false,
    trim: true,
    default: '',
  },
  lastName: {
    type: String,
    required: false,
    trim: true,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
