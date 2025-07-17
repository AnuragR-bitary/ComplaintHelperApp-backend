// repositories/service.repository.js
const BaseRepository = require("./base.repository");
const Service = require("../models/service");

class ServiceRepository extends BaseRepository {
  constructor() {
    super(Service);
  }

  async findByComplaintId(complaintId, populate = []) {
    return this.findOne({ complaintId }, populate);
  }

  async updateFormSubmitted(serviceId, formData = {}) {
    return this.update(serviceId, { 
      formSubmitted: true,
      formData: formData
    });
  }

  async updatePaymentStatus(serviceId, paymentStatus, paymentId = null) {
    const updateData = { paymentStatus };
    if (paymentId) updateData.paymentId = paymentId;
    
    return this.update(serviceId, updateData);
  }

  async findUnpaidServices() {
    return this.find({ paymentStatus: 'unpaid' });
  }
}

module.exports = new ServiceRepository();
