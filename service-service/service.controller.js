const express = require('express');
const router = express.Router();
const serviceRepository = require('../repositories/service.repository');
const complaintRepository = require('../repositories/complaint.repository');

// Get service by id
router.get('/:id', async (req, res) => {
  try {
    const service = await serviceRepository.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch service', details: err.message });
  }
});

// List all services for current user
router.get('/', async (req, res) => {
  try {
    // Find all complaints for this user
    const complaints = await complaintRepository.findByUserId(req.user.id);
    const complaintIds = complaints.map(c => c._id);
    // Find all services for these complaints
    const services = await serviceRepository.find({ complaintId: { $in: complaintIds } });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services', details: err.message });
  }
});

// Update service (e.g., mark form as submitted)
router.put('/:id', async (req, res) => {
  try {
    const { formSubmitted, paymentStatus } = req.body;
    const updateData = {};
    if (formSubmitted !== undefined) updateData.formSubmitted = formSubmitted;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    const service = await serviceRepository.update(req.params.id, updateData);
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service', details: err.message });
  }
});

module.exports = router;
