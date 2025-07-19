const mongoose = require('mongoose');

const paraphraseEntrySchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  feedback: {
    type: String,
    default: ''
  },
  modelUsed: {
    type: String,
    default: 'tngtech/deepseek-r1t2-chimera:free'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const complaintSchema = new mongoose.Schema({
  userId: {
    type: String, // Changed from ObjectId to String to accept UUID
    required: true,
    // Add a custom setter to handle both UUID and ObjectId
    set: function(value) {
      // If it's already a string (like a UUID), use it as is
      if (typeof value === 'string') {
        return value;
      }
      // If it's an ObjectId, convert to string
      if (value && value.toString) {
        return value.toString();
      }
      return value;
    }
  },
  originalText: {
    type: String,
    required: true,
  },
  currentParaphrase: {
    text: String,
    paraphraseId: mongoose.Schema.Types.ObjectId, // Reference to the accepted paraphrase in history
  },
  paraphraseHistory: [paraphraseEntrySchema],
  status: {
    type: String,
    enum: ['draft', 'pending_payment', 'submitted', 'in_review', 'resolved'],
    default: 'draft',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Complaint', complaintSchema);
