const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  originalText: {
    type: String,
    required: true,
  },
  paraphrasedText: {
    type: String,
  },
  isParaphraseApproved: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['draft', 'pending_payment', 'submitted', 'resolved'],
    default: 'draft',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Complaint', complaintSchema);
