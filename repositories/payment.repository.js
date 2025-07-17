// repositories/payment.repository.js
const BaseRepository = require("./base.repository");
const Payment = require("../models/payment");

class PaymentRepository extends BaseRepository {
  constructor() {
    super(Payment);
  }

  async findByServiceId(serviceId, populate = []) {
    return this.findOne({ serviceId }, populate);
  }

  async updatePaymentStatus(id, status, razorpayPaymentId = null, razorpaySignature = null) {
    const updateData = { status };
    if (razorpayPaymentId) updateData.razorpayPaymentId = razorpayPaymentId;
    if (razorpaySignature) updateData.razorpaySignature = razorpaySignature;
    
    return this.update(id, updateData);
  }

  async findByRazorpayOrderId(razorpayOrderId) {
    return this.findOne({ razorpayOrderId });
  }
}

module.exports = new PaymentRepository();
