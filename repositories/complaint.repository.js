// repositories/complaint.repository.js
const mongoose = require('mongoose');
const BaseRepository = require("./base.repository");
const Complaint = require("../models/complaint");

class ComplaintRepository extends BaseRepository {
  constructor() {
    super(Complaint);
  }

  /**
   * Find complaints by user ID with optional population
   */
  async findByUserId(userId, populate = [], options = {}) {
    return this.find({ userId }, populate, options);
  }

  /**
   * Find a complaint by ID and user ID
   */
  async findByIdAndUserId(id, userId, options = {}) {
    const query = this.model.findOne({
      _id: id,
      userId: userId
    });

    if (options.session) {
      query.session(options.session);
    }

    return query.exec();
  }

  /**
   * Add a new paraphrase to the history
   */
  async addParaphrase(complaintId, text, options = {}) {
    const paraphraseId = new mongoose.Types.ObjectId();
    
    const update = {
      $push: {
        paraphraseHistory: {
          _id: paraphraseId,
          text,
          status: 'pending',
          modelUsed: 'tngtech/deepseek-r1t2-chimera:free'
        }
      },
      $set: {
        updatedAt: new Date()
      }
    };

    if (options.setAsCurrent) {
      update.$set['currentParaphrase'] = {
        text,
        paraphraseId
      };
    }

    const result = await this.model.findByIdAndUpdate(
      complaintId,
      update,
      { new: true, ...options }
    );

    return {
      complaint: result,
      paraphraseId
    };
  }

  /**
   * Update paraphrase status
   */
  async updateParaphraseStatus(complaintId, paraphraseId, status, feedback = '', options = {}) {
    const update = {
      $set: {
        'paraphraseHistory.$.status': status,
        'paraphraseHistory.$.feedback': feedback,
        updatedAt: new Date()
      }
    };

    // If accepted, update currentParaphrase
    if (status === 'accepted') {
      const complaint = await this.model.findOne({
        _id: complaintId,
        'paraphraseHistory._id': paraphraseId
      });

      if (complaint) {
        const paraphrase = complaint.paraphraseHistory.id(paraphraseId);
        if (paraphrase) {
          update.$set.currentParaphrase = {
            text: paraphrase.text,
            paraphraseId: paraphrase._id
          };
        }
      }
    }

    return this.model.findOneAndUpdate(
      {
        _id: complaintId,
        'paraphraseHistory._id': paraphraseId
      },
      update,
      { new: true, ...options }
    );
  }

  /**
   * Get the latest paraphrase for a complaint
   */
  async getLatestParaphrase(complaintId, options = {}) {
    const complaint = await this.model.findOne(
      { _id: complaintId },
      { paraphraseHistory: { $slice: -1 } },
      options
    );
    
    return complaint?.paraphraseHistory?.[0] || null;
  }
}

module.exports = new ComplaintRepository();
