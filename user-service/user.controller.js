const express = require('express');
const router = express.Router();
const userRepository = require('../repositories/user.repository');

// Get current user profile by Keycloak ID (JWT sub)
router.get('/me', async (req, res) => {
  try {
    const user = await userRepository.findByKeycloakId(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user', details: err.message });
  }
});

// Update current user profile by Keycloak ID (JWT sub)
router.put('/me', async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const user = await userRepository.updateByKeycloakId(req.user.id, { firstName, lastName });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

module.exports = router;
