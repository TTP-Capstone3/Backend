// Basic Routes:
// GET    /schedule-items
// GET    /schedule-items/:id
// POST   /schedule-items
// PATCH  /schedule-items/:id
// DELETE /schedule-items/:id

const express = require('express');
const { ScheduleItem, Category} = require('../models');

const { requireAuth } = require('../middleware/auth');
const validateScheduleItem = require('../middleware/validateScheduleItem',);

const router = express.Router();

// Every scheduleItem route requires an authenticated user.
// After this middleware runs, req.user contains the User model instance.
router.use(requireAuth);

// Only fields listed here are allowed to be edited.
const allowedFields = [
  'title',
  'description',
  'itemType',
  'startAt',
  'endAt',
  'dueAt',
  'reminderAt',
  'allDay',
  'timeZone',
  'priority',
  'estimatedMinutes',
  'location',
  'status',
  'completedAt',
  'source',
  'externalUid',
  'recurrenceRule',
  'categoryId',
];

function copyAllowedFields(body) {
  const data = {};
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  // Trim any whitespace off of a title before changing it.
  if (typeof data.title === 'string') {
    data.title = data.title.trim();
  }
  return data;
}

async function categoryBelongsToUser(categoryId, userId) {
  if (categoryId === null || categoryId === undefined) {
    return true;
  }

  const category = await Category.findOne({
    where: {
      id: categoryId,
      userId,
    },
  });

  return Boolean(category);
}

// ---------------------------------------------------------
// GET /schedule-items
// ---------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const scheduleItems = await ScheduleItem.findAll({
      where: {
        userId: req.user.id,
      },

      include: [
        {
          model: Category,
          required: false,
        },
      ],

      order: [
        ['createdAt', 'DESC'],
      ],
    });

    res.json(scheduleItems);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// GET /schedule-items/:id
// ---------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const scheduleItem = await ScheduleItem.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
      include: [{model: Category, required: false}],
    });

    if (!scheduleItem) {
      return res.status(404).json({error: 'Schedule item not found.'});
    }

    res.status(200).json(scheduleItem);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// POST /schedule-items
// ---------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const data = copyAllowedFields(req.body);

    // The client is never allowed to choose the owner.
    data.userId = req.user.id;

    const validationErrors = validateScheduleItem(data);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid schedule item.',
        details: validationErrors,
      });
    }

    const validCategory = await categoryBelongsToUser(data.categoryId, req.user.id);
    if (!validCategory) {
      return res.status(400).json({
        error: 'The selected category does not belong to the current user.',
      });
    }

    const scheduleItem = await ScheduleItem.create(data);
    const createdItem = await ScheduleItem.findOne({
      where: {
        id: scheduleItem.id,
        userId: req.user.id,
      },
      include: [{model: Category, required: false}],
    });

    res.status(201).json(createdItem);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// PATCH /schedule-items/:id
// ---------------------------------------------------------
router.patch('/:id', async (req, res, next) => {
  try {
    const scheduleItem = await ScheduleItem.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!scheduleItem) {
      return res.status(404).json({error: 'Schedule item not found.'});
    }

    const updates = copyAllowedFields(req.body);
    const validCategory = await categoryBelongsToUser(updates.categoryId, req.user.id);

    if (!validCategory) {
      return res.status(400).json({
        error: 'The selected category does not belong to the current user.',
      });
    }

    // Validate the complete future version of the record,
    // not only the fields included in the PATCH request.
    const proposedItem = {...scheduleItem.get({ plain: true }), ...updates};
    const validationErrors = validateScheduleItem(proposedItem);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid schedule item.',
        details: validationErrors,
      });
    }

    // Keep completedAt consistent with status.
    if (updates.status === 'completed' && !updates.completedAt && !scheduleItem.completedAt) {
      updates.completedAt = new Date();
    }

    if (updates.status && updates.status !== 'completed') {
      updates.completedAt = null;
    }

    await scheduleItem.update(updates);

    const updatedItem = await ScheduleItem.findOne({
      where: {
        id: scheduleItem.id,
        userId: req.user.id,
      },
      include: [{model: Category, required: false}],
    });

    res.status(200).json(updatedItem);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// DELETE /schedule-items/:id
// ---------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const scheduleItem = await ScheduleItem.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!scheduleItem) {
      return res.status(404).json({error: 'Schedule item not found.'});
    }

    await scheduleItem.destroy();

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;