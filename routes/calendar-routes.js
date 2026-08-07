const express = require('express');
const { ScheduleItem } = require('../models');
const { requireAuth } = require('../middleware/auth');
const validateScheduleItem = require('../middleware/validateScheduleItem');
const { parseCalendarEvents } = require('../services/ics-service');
const { createIcsCalendar } = require('../services/ics-export-service');

const router = express.Router();

// A user must be logged in before importing or exporting calendar events.
router.use(requireAuth);

// POST /calendar/import
// This route reads ICS calendar text and saves its events as schedule items.
router.post(
  '/import',
  express.text({ type: 'text/calendar', limit: '1mb' }),
  async (req, res, next) => {
    let calendarEvents;

    try {
      calendarEvents = await parseCalendarEvents(req.body);
    } catch (error) {
      return res.status(400).json({ error: 'Please provide a valid ICS calendar.' });
    }

    try {
      let importedCount = 0;
      let skippedCount = 0;

      for (const calendarEvent of calendarEvents) {
        const scheduleItemData = {
          ...calendarEvent,
          userId: req.user.id,
        };

        const validationErrors = validateScheduleItem(scheduleItemData);

        if (validationErrors.length > 0) {
          skippedCount += 1;
          continue;
        }

        // An ICS UID helps prevent the same user's event from being imported twice.
        if (scheduleItemData.externalUid) {
          const existingItem = await ScheduleItem.findOne({
            where: {
              userId: req.user.id,
              externalUid: scheduleItemData.externalUid,
            },
          });

          if (existingItem) {
            skippedCount += 1;
            continue;
          }
        }

        await ScheduleItem.create(scheduleItemData);
        importedCount += 1;
      }

      res.status(201).json({ importedCount, skippedCount });
    } catch (error) {
      next(error);
    }
  },
);

// GET /calendar/export
// Return the current user's events as a downloadable ICS calendar.
router.get('/export', async (req, res, next) => {
  try {
    const events = await ScheduleItem.findAll({
      where: {
        userId: req.user.id,
        itemType: 'event',
      },
      order: [
        ['startAt', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const calendarText = createIcsCalendar(events);

    res
      .status(200)
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="calendar.ics"',
        'Cache-Control': 'private, no-store',
      })
      .send(calendarText);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
