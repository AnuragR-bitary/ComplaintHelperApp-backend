const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const complaintRepository = require("../repositories/complaint.repository");
const serviceRepository = require("../repositories/service.repository");
const paymentRepository = require("../repositories/payment.repository");
const Complaint = require('../models/complaint');

// Create a new complaint with initial service
const { paraphraseWithOpenRouter } = require("../utils/openrouter");
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { originalText, serviceType = "email" } = req.body;
    const userId = req.user.id;

    // Validate service type
    if (!["email", "manage_full"].includes(serviceType)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid service type" });
    }

    // Set price based on service type (example prices)
    const servicePrices = {
      email: 500, // 500 INR for email service
      manage_full: 1500, // 1500 INR for full management
    };

    // Paraphrase originalText using OpenRouter before saving
    let paraphrasedText = "";
    try {
      paraphrasedText = await paraphraseWithOpenRouter(originalText);
    } catch (apiErr) {
      // Optionally, you can choose to fail or continue with empty paraphrasedText
      await session.abortTransaction();
      session.endSession();
      return res
        .status(502)
        .json({
          error: "Failed to paraphrase with OpenRouter",
          details: apiErr.message,
        });
    }

    // Create complaint using repository
    const complaint = await complaintRepository.create(
      {
        userId: new mongoose.Types.ObjectId(userId),
        originalText,
        paraphrasedText,
        status: "draft",
      },
      { session }
    );

    // Create initial service for the complaint using repository
    const service = await serviceRepository.create(
      {
        complaintId: complaint._id,
        type: serviceType,
        price: servicePrices[serviceType] || 0,
        paymentStatus: "unpaid",
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      complaint,
      service,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating complaint:", err);
    res.status(500).json({
      error: "Failed to create complaint",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Get all complaints for the authenticated user with service and payment info
router.get("/", async (req, res) => {
  try {
    const complaints = await Complaint.find(
      { userId: new mongoose.Types.ObjectId(req.user.id) },
      {
        userId: 1,
        originalText: 1,
        paraphrasedText: 1,
        isParaphraseApproved: 1,
        status: 1,
        paraphraseHistory: 1,
        createdAt: 1,
        __v: 1
      }
    ).sort({ createdAt: -1 });

    res.json(complaints);
  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({
      error: "Failed to fetch complaints",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Get a single complaint
router.get("/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id)
    });

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    res.json(complaint);
  } catch (err) {
    console.error("Error fetching complaint:", err);
    res.status(500).json({
      error: "Failed to fetch complaint",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Update complaint text (only allowed in draft status)
router.put("/:id/text", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { originalText } = req.body;

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id,
        status: "draft",
      },
      {
        $set: {
          originalText,
          updatedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error: "Complaint not found, not owned by user, or not in draft status",
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.json(complaint);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating complaint text:", err);
    res.status(500).json({
      error: "Failed to update complaint",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Update paraphrased text and approval status
router.put("/:id/paraphrase", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paraphrasedText, isApproved = false } = req.body;

    // Validate input
    if (isApproved && !paraphrasedText) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Paraphrased text is required for approval" });
    }

    const update = {
      $set: {
        updatedAt: new Date(),
      },
    };

    // Only update paraphrasedText if provided
    if (paraphrasedText !== undefined) {
      update.$set.paraphrasedText = paraphrasedText;
      update.$set.isParaphraseApproved = isApproved;

      // Update status based on approval
      if (isApproved) {
        update.$set.status = "pending_payment";
      }
    }

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id,
        // Only allow updates to draft or pending_payment complaints
        status: { $in: ["draft", "pending_payment"] },
      },
      update,
      {
        new: true,
        runValidators: true,
        session,
      }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error:
          "Complaint not found, not owned by user, or not in an editable state",
      });
    }

    await session.commitTransaction();
    session.endSession();

    res.json(complaint);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating paraphrase:", err);
    res.status(500).json({
      error: "Failed to update paraphrase",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Submit service form (after payment)
router.post("/:id/submit-form", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { formData } = req.body;

    // Verify complaint exists and belongs to user
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: "submitted", // Only allow form submission after payment
    }).session(session);

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error:
          "Complaint not found, not owned by user, or not in submitted status",
      });
    }

    // Update service with form submission
    const service = await Service.findOneAndUpdate(
      {
        complaintId: complaint._id,
        paymentStatus: "paid", // Only allow form submission if paid
      },
      {
        $set: {
          formSubmitted: true,
          formData: formData,
          updatedAt: new Date(),
        },
      },
      {
        new: true,
        session,
      }
    );

    if (!service) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "No paid service found for this complaint",
      });
    }

    // Update complaint status to in_progress
    await Complaint.findByIdAndUpdate(
      complaint._id,
      {
        $set: {
          status: "in_progress",
          updatedAt: new Date(),
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Form submitted successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error submitting form:", err);
    res.status(500).json({
      error: "Failed to submit form",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});


/**
 * @route POST /api/complaints/paraphrase
 * @desc Generate a new paraphrase for a complaint
 */
router.post("/paraphrase", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { complaintId } = req.body;
    
    // Get the complaint
    const complaint = await Complaint.findOne({
      _id: complaintId,
      userId: req.user.id
    }).session(session);

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error: "Complaint not found or not accessible",
      });
    }

    // Only allow paraphrasing for drafts or when in review
    if (!['draft', 'in_review'].includes(complaint.status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Cannot paraphrase a complaint that is not in draft or review status",
      });
    }

    // Generate new paraphrase
    const newParaphrasedText = await paraphraseWithOpenRouter(complaint.originalText);
    
    // Create new paraphrase entry
    const newParaphrase = {
      text: newParaphrasedText,
      status: 'pending',
      createdAt: new Date()
    };

    // Add to history
    complaint.paraphraseHistory.push(newParaphrase);
    
    // If it's the first paraphrase, update status to in_review
    if (complaint.status === 'draft') {
      complaint.status = 'in_review';
    }

    // Save the complaint with the new paraphrase
    await complaint.save({ session });

    // Get the ID of the newly added paraphrase
    const paraphraseId = complaint.paraphraseHistory[complaint.paraphraseHistory.length - 1]._id;

    // Update current paraphrase reference if needed
    if (complaint.status === 'in_review') {
      complaint.currentParaphrase = {
        text: newParaphrasedText,
        paraphraseId: paraphraseId
      };
      await complaint.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      paraphraseId,
      paraphrasedText: newParaphrasedText,
      status: complaint.status,  // Include the new status in response
      message: "New paraphrase generated successfully"
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error generating paraphrase:", err);
    res.status(500).json({
      error: "Failed to generate paraphrase",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * @route POST /api/complaints/paraphrase/respond
 * @desc Accept or reject a paraphrase
 */
router.post("/paraphrase/respond", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { complaintId, paraphraseId, action, feedback = '' } = req.body;
    
    if (!['accept', 'reject'].includes(action)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Invalid action. Must be 'accept' or 'reject'"
      });
    }

    // Get the complaint
    const complaint = await complaintRepository.findByIdAndUserId(
      complaintId,
      req.user.id,
      { session }
    );

    if (!complaint) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        error: "Complaint not found or not accessible",
      });
    }

    // Only allow responding to paraphrases when in review
    if (complaint.status !== 'in_review') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "Can only respond to paraphrases when complaint is in review status",
      });
    }

    // Update the paraphrase status
    const status = action === 'accept' ? 'accepted' : 'rejected';
    const updatedComplaint = await complaintRepository.updateParaphraseStatus(
      complaintId,
      paraphraseId,
      status,
      feedback,
      { session }
    );

    // If accepted, update the complaint status to pending_payment
    if (action === 'accept') {
      await complaintRepository.update(
        complaintId,
        { status: 'pending_payment' },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Paraphrase ${status} successfully`,
      currentParaphrase: updatedComplaint.currentParaphrase
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error responding to paraphrase:", err);
    res.status(500).json({
      error: `Failed to ${action} paraphrase`,
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

module.exports = router;
