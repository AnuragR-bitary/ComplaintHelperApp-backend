const express = require('express');
const router = express.Router();
const Complaint = require('../models/complaint');
const Service = require('../models/service');
const Payment = require('../models/payment');
const mongoose = require('mongoose');

// Create a new complaint with initial service
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { originalText, serviceType = 'email' } = req.body;
    const userId = req.user.id;

    // Validate service type
    if (!['email', 'manage_full'].includes(serviceType)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid service type' });
    }

    // Set price based on service type (example prices)
    const servicePrices = {
      email: 500,    // 500 INR for email service
      manage_full: 1500  // 1500 INR for full management
    };

    // Create complaint
    const complaint = new Complaint({
      userId: new mongoose.Types.ObjectId(userId),
      originalText,
      status: 'draft'
    });
    await complaint.save({ session });

    // Create initial service for the complaint
    const service = new Service({
      complaintId: complaint._id,
      type: serviceType,
      price: servicePrices[serviceType] || 0,
      paymentStatus: 'unpaid'
    });
    await service.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      complaint,
      service
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating complaint:', err);
    res.status(500).json({ 
      error: 'Failed to create complaint', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// Get all complaints for the authenticated user with service and payment info
router.get('/', async (req, res) => {
  try {
    const complaints = await Complaint.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'services',
          localField: '_id',
          foreignField: 'complaintId',
          as: 'service'
        }
      },
      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'payments',
          localField: 'service.paymentId',
          foreignField: '_id',
          as: 'payment'
        }
      },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          originalText: 1,
          paraphrasedText: 1,
          isParaphraseApproved: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          service: {
            _id: '$service._id',
            type: '$service.type',
            price: '$service.price',
            paymentStatus: '$service.paymentStatus'
          },
          payment: {
            status: '$payment.status',
            amount: '$payment.amount',
            razorpayOrderId: '$payment.razorpayOrderId',
            createdAt: '$payment.createdAt'
          }
        }
      }
    ]);
    
    res.json(complaints);
  } catch (err) {
    console.error('Error fetching complaints:', err);
    res.status(500).json({ 
      error: 'Failed to fetch complaints', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// Get a single complaint with service and payment details
router.get('/:id', async (req, res) => {
  try {
    const complaint = await Complaint.aggregate([
      { 
        $match: { 
          _id: new mongoose.Types.ObjectId(req.params.id),
          userId: new mongoose.Types.ObjectId(req.user.id)
        } 
      },
      {
        $lookup: {
          from: 'services',
          localField: '_id',
          foreignField: 'complaintId',
          as: 'service'
        }
      },
      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'payments',
          localField: 'service.paymentId',
          foreignField: '_id',
          as: 'payment'
        }
      },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          originalText: 1,
          paraphrasedText: 1,
          isParaphraseApproved: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          service: {
            _id: '$service._id',
            type: '$service.type',
            price: '$service.price',
            paymentStatus: '$service.paymentStatus',
            formSubmitted: '$service.formSubmitted'
          },
          payment: {
            _id: '$payment._id',
            status: '$payment.status',
            amount: '$payment.amount',
            razorpayOrderId: '$payment.razorpayOrderId',
            razorpayPaymentId: '$payment.razorpayPaymentId',
            createdAt: '$payment.createdAt',
            updatedAt: '$payment.updatedAt'
          }
        }
      }
    ]);

    if (!complaint || complaint.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    res.json(complaint[0]);
  } catch (err) {
    console.error('Error fetching complaint:', err);
    res.status(500).json({ 
      error: 'Failed to fetch complaint', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// Update complaint text (only allowed in draft status)
router.put('/:id/text', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { originalText } = req.body;
    
    const complaint = await Complaint.findOneAndUpdate(
      { 
        _id: req.params.id, 
        userId: req.user.id, 
        status: 'draft' 
      },
      { 
        $set: { 
          originalText,
          updatedAt: new Date()
        } 
      },
      { 
        new: true, 
        runValidators: true,
        session 
      }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        error: 'Complaint not found, not owned by user, or not in draft status' 
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.json(complaint);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error updating complaint text:', err);
    res.status(500).json({ 
      error: 'Failed to update complaint', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// Update paraphrased text and approval status
router.put('/:id/paraphrase', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { paraphrasedText, isApproved = false } = req.body;
    
    // Validate input
    if (isApproved && !paraphrasedText) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Paraphrased text is required for approval' });
    }

    const update = {
      $set: {
        updatedAt: new Date()
      }
    };

    // Only update paraphrasedText if provided
    if (paraphrasedText !== undefined) {
      update.$set.paraphrasedText = paraphrasedText;
      update.$set.isParaphraseApproved = isApproved;
      
      // Update status based on approval
      if (isApproved) {
        update.$set.status = 'pending_payment';
      }
    }

    const complaint = await Complaint.findOneAndUpdate(
      { 
        _id: req.params.id, 
        userId: req.user.id,
        // Only allow updates to draft or pending_payment complaints
        status: { $in: ['draft', 'pending_payment'] } 
      },
      update,
      { 
        new: true, 
        runValidators: true,
        session 
      }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        error: 'Complaint not found, not owned by user, or not in an editable state' 
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.json(complaint);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error updating paraphrase:', err);
    res.status(500).json({ 
      error: 'Failed to update paraphrase', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

// Submit service form (after payment)
router.post('/:id/submit-form', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { formData } = req.body;
    
    // Verify complaint exists and belongs to user
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: 'submitted' // Only allow form submission after payment
    }).session(session);

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        error: 'Complaint not found, not owned by user, or not in submitted status' 
      });
    }

    // Update service with form submission
    const service = await Service.findOneAndUpdate(
      { 
        complaintId: complaint._id,
        paymentStatus: 'paid' // Only allow form submission if paid
      },
      { 
        $set: { 
          formSubmitted: true,
          formData: formData,
          updatedAt: new Date()
        } 
      },
      { 
        new: true,
        session 
      }
    );

    if (!service) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        error: 'No paid service found for this complaint' 
      });
    }

    // Update complaint status to in_progress
    await Complaint.findByIdAndUpdate(
      complaint._id,
      { 
        $set: { 
          status: 'in_progress',
          updatedAt: new Date()
        } 
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ 
      success: true, 
      message: 'Form submitted successfully' 
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error submitting form:', err);
    res.status(500).json({ 
      error: 'Failed to submit form', 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
});

module.exports = router;
