const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getAiStatus } = require('../services/ai/ai-config');
const {
  createScheduleProposal,
} = require('../services/ai/schedule-proposal-service');

const router = express.Router();

// Only checks if Gemini is set up. It never returns the API key.
router.get('/status', (req, res) => {
  res.json(getAiStatus());
});

// Makes previews only. It does not save the items.
router.post('/schedule-proposal', requireAuth, async (req, res) => {
  try {
    const result = await createScheduleProposal(req.body?.message, {
      timeZone: req.body?.timeZone,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'AI_INVALID_INPUT') {
      return res.status(400).json({ error: error.message });
    }

    if (error.code === 'GEMINI_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'The AI service is not configured yet.',
      });
    }

    return res.status(502).json({
      error: 'The AI service could not create a schedule proposal.',
    });
  }
});

module.exports = router;
