const express = require('express');
const Razorpay = require('razorpay');
const router = express.Router();
const Service = require('../models/service');
const Complaint = require('../models/complaint');
const Payment = require('../models/payment');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order for a service
router.post('/order', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { complaintId } = req.body;
    const userId = req.user.id;

    // Verify the complaint exists and belongs to the user
    const complaint = await Complaint.findOne({
      _id: complaintId,
      userId: userId,
      status: 'pending_payment'
    }).session(session);

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Complaint not found or not eligible for payment' });
    }

    // Get the service for this complaint
    const service = await Service.findOne({ 
      complaintId: complaint._id,
      paymentStatus: 'unpaid'
    }).session(session);

    if (!service) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'No unpaid service found for this complaint' });
    }

    // Create order in Razorpay
    const order = await razorpay.orders.create({
      amount: service.price * 100, // Razorpay expects amount in paise
      currency: 'INR',
      receipt: `rcpt_${complaint._id}_${Date.now()}`,
      payment_capture: 1 // Auto-capture payment
    });

    // Create payment record
    const payment = new Payment({
      serviceId: service._id,
      razorpayOrderId: order.id,
      razorpayPaymentId: '', // Will be updated after payment
      razorpaySignature: '', // Will be updated after payment
      amount: service.price,
      status: 'initiated'
    });
    
    await payment.save({ session });

    // Update service with payment reference
    service.paymentId = payment._id;
    await service.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating payment order:', err);
    res.status(500).json({ 
      error: 'Failed to create payment order', 
      details: err.message 
    });
  }
});

// Verify payment and update service status
router.post('/verify', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Verify the payment signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'successful'
      },
      { new: true, session }
    );

    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Payment record not found' });
    }

    // Update service payment status
    const service = await Service.findOneAndUpdate(
      { _id: payment.serviceId },
      { paymentStatus: 'paid' },
      { new: true, session }
    );

    // Update complaint status to submitted
    await Complaint.findByIdAndUpdate(
      service.complaintId,
      { status: 'submitted' },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ 
      success: true, 
      message: 'Payment verified and processed successfully',
      paymentId: payment._id
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
    // Update payment status to failed
    if (razorpay_order_id) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: 'failed' }
      );
    }
    
    console.error('Error verifying payment:', err);
    res.status(500).json({ 
      error: 'Failed to verify payment', 
      details: err.message 
    });
  }
});

// Get payment details for a complaint
router.get('/:complaintId', async (req, res) => {
  try {
    const service = await Service.findOne({
      complaintId: req.params.complaintId
    }).populate('paymentId', 'status amount razorpayOrderId createdAt');

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (!service.paymentId) {
      return res.status(404).json({ error: 'No payment found for this service' });
    }

    res.json({
      paymentStatus: service.paymentStatus,
      payment: service.paymentId
    });
  } catch (err) {
    console.error('Error fetching payment details:', err);
    res.status(500).json({ 
      error: 'Failed to fetch payment details', 
      details: err.message 
    });
  }
});

module.exports = router;
