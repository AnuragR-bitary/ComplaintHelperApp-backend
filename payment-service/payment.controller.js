const express = require('express');
const Razorpay = require('razorpay');
const router = express.Router();
const mongoose = require('mongoose');
const complaintRepository = require('../repositories/complaint.repository');
const serviceRepository = require('../repositories/service.repository');
const paymentRepository = require('../repositories/payment.repository');

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

    // Verify the complaint exists and belongs to the user using repository
    const complaint = await complaintRepository.findOne(
      {
        _id: complaintId,
        userId: userId,
        status: 'pending_payment'
      },
      [],
      { session }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Complaint not found or not eligible for payment' });
    }

    // Get the service for this complaint using repository
    const service = await serviceRepository.findOne(
      { 
        complaintId: complaint._id,
        paymentStatus: 'unpaid'
      },
      [],
      { session }
    );

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

    // Create payment record using repository
    const payment = await paymentRepository.create(
      {
        serviceId: service._id,
        razorpayOrderId: order.id,
        amount: order.amount / 100, // Convert back to rupees
        status: 'initiated'
      },
      { session }
    );

    // Update service with payment ID using repository
    await serviceRepository.update(
      service._id,
      { paymentId: payment._id },
      { session }
    );

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

// Verify payment and update records
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Verify payment with Razorpay
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Find payment record using repository
    const payment = await paymentRepository.findOne(
      {
        razorpayOrderId: razorpay_order_id,
        status: 'initiated'
      },
      [],
      { session }
    );

    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid payment request' });
    }

    // Update payment record using repository
    await paymentRepository.update(
      payment._id,
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'successful'
      },
      { session }
    );

    // Get service to update complaint status
    const service = await serviceRepository.findOne(
      { _id: payment.serviceId },
      [],
      { session }
    );

    if (!service) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Service not found' });
    }

    // Update service payment status using repository
    await serviceRepository.updatePaymentStatus(
      service._id,
      'paid',
      payment._id
    );

    // Update complaint status using repository
    await complaintRepository.updateComplaintStatus(
      service.complaintId,
      'payment_received'
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
      await paymentRepository.update(
        razorpay_order_id,
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

// Get payment status for a complaint
router.get('/:complaintId', async (req, res) => {
  try {
    // Find service with populated payment using repository
    const service = await serviceRepository.findOne(
      { complaintId: req.params.complaintId },
      ['paymentId']
    );

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Get payment details using repository if payment exists
    let payment = null;
    if (service.paymentId) {
      payment = await paymentRepository.findById(service.paymentId._id);
    }

    res.json({
      paymentStatus: service.paymentStatus,
      payment: payment
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});    

module.exports = router;
