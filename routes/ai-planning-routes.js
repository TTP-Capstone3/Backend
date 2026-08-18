const express = require('express');
const { ScheduleItem } = require('../models');
const { requireAuth } = require('../middleware/auth');
const {
  buildDailyBriefingSchedule,
} = require('../services/ai/daily-briefing-schedule');
const {
  createDailyBriefing,
} = require('../services/ai/daily-briefing-service');

const router = express.Router();

// POST /ai/daily-briefing
// Summarize the current user's schedule. This route only reads: it never
// creates, edits, moves, or deletes a schedule item.
router.post('/daily-briefing', requireAuth, async (req, res) => {
  try {
    const scheduleItems = await ScheduleItem.findAll({
      where: { userId: req.user.id },
    });

    // The current time comes from the server so a request cannot ask what the
    // schedule looks like at some other moment.
    const schedule = buildDailyBriefingSchedule(scheduleItems, {
      timeZone: req.body?.timeZone,
    });

    const briefing = await createDailyBriefing(schedule);

    res.status(200).json(briefing);
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
      error: 'The AI service could not create a daily briefing.',
    });
  }
});

module.exports = router;
