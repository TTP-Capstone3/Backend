const express = require('express');
const { AiConversation, AiMessage } = require('../models');
const { requireAuth } = require('../middleware/auth');
const validateAiMessage = require('../middleware/validateAiMessage');
const { getAiStatus } = require('../services/ai/ai-config');
const {
  MAX_CONTEXT_MESSAGES,
  buildConversationContext,
} = require('../services/ai/conversation-context');
const {
  createScheduleProposal,
} = require('../services/ai/schedule-proposal-service');
const { createSpeech } = require('../services/ai/speech-service');

const router = express.Router();

// Only checks if Gemini is set up. It never returns the API key.
router.get('/status', (req, res) => {
  res.json(getAiStatus());
});

async function loadConversationContext(userId) {
  const conversation = await AiConversation.findOne({
    where: { userId },
  });

  if (!conversation) {
    return '';
  }

  const newestMessages = await AiMessage.findAll({
    where: { conversationId: conversation.id },
    order: [['createdAt', 'DESC']],
    limit: MAX_CONTEXT_MESSAGES,
  });

  return buildConversationContext([...newestMessages].reverse());
}

// Makes previews only. It does not save the items.
router.post('/schedule-proposal', requireAuth, async (req, res, next) => {
  let conversationContext;

  try {
    conversationContext = await loadConversationContext(req.user.id);
  } catch (error) {
    return next(error);
  }

  try {
    const result = await createScheduleProposal(req.body?.message, {
      timeZone: req.body?.timeZone,
      conversationContext,
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

// Turns text into spoken audio. Does not save anything.
router.post('/speak', requireAuth, async (req, res, next) => {
  try {
    const speech = await createSpeech(req.body?.text);
    res.status(200).json(speech);
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
      error: 'The AI service could not generate speech.',
    });
  }
});

// Load the current user's saved chat messages.
router.get('/conversation/messages', requireAuth, async (req, res, next) => {
  try {
    const conversation = await AiConversation.findOne({
      where: { userId: req.user.id },
    });

    if (!conversation) {
      return res.status(200).json({ messages: [] });
    }

    const messages = await AiMessage.findAll({
      where: { conversationId: conversation.id },
      order: [['createdAt', 'ASC']],
    });

    res.status(200).json({ messages });
  } catch (error) {
    next(error);
  }
});

// Save one message to the current user's conversation.
router.post('/conversation/messages', requireAuth, async (req, res, next) => {
  try {
    const validationErrors = validateAiMessage(req.body);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid AI message.',
        details: validationErrors,
      });
    }

    const [conversation] = await AiConversation.findOrCreate({
      where: { userId: req.user.id },
      defaults: { userId: req.user.id },
    });

    const message = await AiMessage.create({
      conversationId: conversation.id,
      sender: req.body.sender,
      text: req.body.text.trim(),
      items: req.body.items === undefined ? [] : req.body.items,
    });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

// Update proposal items in one saved AI message.
router.patch(
  '/conversation/messages/:messageId',
  requireAuth,
  async (req, res, next) => {
    try {
      const conversation = await AiConversation.findOne({
        where: { userId: req.user.id },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'AI message not found.' });
      }

      const message = await AiMessage.findOne({
        where: {
          id: req.params.messageId,
          conversationId: conversation.id,
        },
      });

      if (!message) {
        return res.status(404).json({ error: 'AI message not found.' });
      }

      if (message.sender !== 'ai') {
        return res.status(400).json({
          error: 'Only AI message items can be updated.',
        });
      }

      if (!req.body || !Object.hasOwn(req.body, 'items')) {
        return res.status(400).json({
          error: 'Message items are required.',
        });
      }

      const validationErrors = validateAiMessage({
        sender: message.sender,
        text: message.text,
        items: req.body.items,
      });

      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Invalid AI message.',
          details: validationErrors,
        });
      }

      await message.update({ items: req.body.items });

      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
