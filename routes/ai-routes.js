const express = require('express');
const { getAiStatus } = require('../services/ai/ai-config');

const router = express.Router();

// Only checks if Gemini is set up. It never returns the API key.
router.get('/status', (req, res) => {
  res.json(getAiStatus());
});

module.exports = router;
