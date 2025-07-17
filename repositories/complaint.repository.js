// repositories/complaint.repository.js
const BaseRepository = require("./base.repository");
const Complaint = require("../models/complaint");

class ComplaintRepository extends BaseRepository {
  constructor() {
    super(Complaint);
  }

  async findByUserId(userId, populate = []) {
    return this.find({ userId }, populate);
  }

  async updateComplaintStatus(id, status) {
    return this.update(id, { status });
  }
}

module.exports = new ComplaintRepository();
