const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');

process.env.LOCAL_DATABASE_URL ||=
  'postgres://test:test@127.0.0.1:5432/capstone_test';
process.env.JWT_SECRET ||= 'test-only-jwt-secret';
process.env.AUTH0_DOMAIN ||= 'example.auth0.com';
process.env.AUTH0_AUDIENCE ||= 'https://example.test/api';

const { User, AiConversation, AiMessage, ScheduleItem } = require('../models');
const { signToken } = require('../middleware/auth');
const scheduleProposalService = require('../services/ai/schedule-proposal-service');

const originalCreateScheduleProposal =
  scheduleProposalService.createScheduleProposal;
let createScheduleProposal = originalCreateScheduleProposal;

scheduleProposalService.createScheduleProposal = (...args) =>
  createScheduleProposal(...args);

const aiRouter = require('../routes/ai-routes');

const originalMethods = {
  findUser: User.findByPk,
  findConversation: AiConversation.findOne,
  findOrCreateConversation: AiConversation.findOrCreate,
  findMessage: AiMessage.findOne,
  findMessages: AiMessage.findAll,
  createMessage: AiMessage.create,
  findScheduleItems: ScheduleItem.findAll,
};

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/ai', aiRouter);

  server = await new Promise((resolve) => {
    const testServer = app.listen(0, '127.0.0.1', () => resolve(testServer));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  User.findByPk = originalMethods.findUser;
  AiConversation.findOne = originalMethods.findConversation;
  AiConversation.findOrCreate = originalMethods.findOrCreateConversation;
  AiMessage.findOne = originalMethods.findMessage;
  AiMessage.findAll = originalMethods.findMessages;
  AiMessage.create = originalMethods.createMessage;
  ScheduleItem.findAll = originalMethods.findScheduleItems;
  scheduleProposalService.createScheduleProposal =
    originalCreateScheduleProposal;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

function getAuthHeaders() {
  const token = signToken({ id: 'user-1', username: 'Angel' });

  return {
    'Content-Type': 'application/json',
    Cookie: `token=${token}`,
  };
}

test('conversation message routes require authentication', async () => {
  const getResponse = await fetch(`${baseUrl}/ai/conversation/messages`);
  const postResponse = await fetch(`${baseUrl}/ai/conversation/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: 'user', text: 'Add a meeting' }),
  });
  const patchResponse = await fetch(
    `${baseUrl}/ai/conversation/messages/message-1`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    },
  );

  assert.equal(getResponse.status, 401);
  assert.equal(postResponse.status, 401);
  assert.equal(patchResponse.status, 401);
});

test('loads messages only from the current user conversation', async () => {
  let conversationQuery;
  let messageQuery;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async (options) => {
    conversationQuery = options;
    return { id: 'conversation-1' };
  };
  AiMessage.findAll = async (options) => {
    messageQuery = options;
    return [{ id: 'message-1', sender: 'user', text: 'Add a meeting' }];
  };

  const response = await fetch(`${baseUrl}/ai/conversation/messages`, {
    headers: getAuthHeaders(),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(conversationQuery.where, { userId: 'user-1' });
  assert.deepEqual(messageQuery, {
    where: { conversationId: 'conversation-1' },
    order: [['createdAt', 'ASC']],
  });
  assert.equal(body.messages[0].text, 'Add a meeting');
});

test('returns an empty list when the user has no conversation', async () => {
  let searchedForMessages = false;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async () => null;
  AiMessage.findAll = async () => {
    searchedForMessages = true;
    return [];
  };

  const response = await fetch(`${baseUrl}/ai/conversation/messages`, {
    headers: getAuthHeaders(),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { messages: [] });
  assert.equal(searchedForMessages, false);
});

test('saves a message in the current user conversation', async () => {
  let conversationOptions;
  let savedMessage;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOrCreate = async (options) => {
    conversationOptions = options;
    return [{ id: 'conversation-1' }, true];
  };
  AiMessage.create = async (data) => {
    savedMessage = data;
    return { id: 'message-1', ...data };
  };

  const response = await fetch(`${baseUrl}/ai/conversation/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      sender: 'user',
      text: '  Add soccer practice tomorrow  ',
      conversationId: 'another-conversation',
      userId: 'another-user',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(conversationOptions, {
    where: { userId: 'user-1' },
    defaults: { userId: 'user-1' },
  });
  assert.deepEqual(savedMessage, {
    conversationId: 'conversation-1',
    sender: 'user',
    text: 'Add soccer practice tomorrow',
    items: [],
  });
  assert.equal(body.conversationId, 'conversation-1');
});

test('rejects an invalid message before using the database', async () => {
  let usedDatabase = false;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOrCreate = async () => {
    usedDatabase = true;
  };

  const response = await fetch(`${baseUrl}/ai/conversation/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      sender: 'user',
      text: 'Add a meeting',
      items: [{ kind: 'proposal', proposal: { title: 'Meeting' } }],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Invalid AI message.');
  assert.equal(body.details.includes('User messages cannot include AI items.'), true);
  assert.equal(usedDatabase, false);
});

test('uses the current user recent messages for an AI proposal', async () => {
  let conversationQuery;
  let messageQuery;
  let proposalRequest;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async (options) => {
    conversationQuery = options;
    return { id: 'conversation-1' };
  };
  AiMessage.findAll = async (options) => {
    messageQuery = options;
    return [
      {
        sender: 'ai',
        text: '',
        items: [
          {
            kind: 'clarification',
            question: 'What time is soccer practice?',
          },
        ],
      },
      {
        sender: 'user',
        text: 'Add soccer practice tomorrow',
      },
    ];
  };
  createScheduleProposal = async (message, options) => {
    proposalRequest = { message, options };
    return { reply: 'I created a proposal.', items: [] };
  };
  ScheduleItem.findAll = async () => [];

  const response = await fetch(`${baseUrl}/ai/schedule-proposal`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      message: '4 PM to 9 PM',
      timeZone: 'America/New_York',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(conversationQuery.where, { userId: 'user-1' });
  assert.deepEqual(messageQuery, {
    where: { conversationId: 'conversation-1' },
    order: [['createdAt', 'DESC']],
    limit: 10,
  });
  assert.equal(proposalRequest.message, '4 PM to 9 PM');
  assert.equal(proposalRequest.options.timeZone, 'America/New_York');
  assert.equal(
    proposalRequest.options.conversationContext,
    [
      'User: Add soccer practice tomorrow',
      'Assistant: What time is soccer practice?',
    ].join('\n'),
  );
});

test('summarizes conflicts and never suggests a slot that already passed', async () => {
  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async () => null;
  createScheduleProposal = async () => ({
    reply: 'Here is your proposal.',
    items: [
      {
        kind: 'proposal',
        proposal: {
          itemType: 'event',
          title: 'Team sync',
          startAt: '2026-08-17T18:00:00.000Z',
          endAt: '2026-08-17T18:30:00.000Z',
          timeZone: 'UTC',
        },
      },
    ],
  });
  ScheduleItem.findAll = async () => [
    {
      id: 'existing-1',
      title: 'Dentist',
      description: 'Cleaning',
      status: 'active',
      startAt: '2026-08-17T18:00:00.000Z',
      endAt: '2026-08-17T18:30:00.000Z',
    },
  ];

  const response = await fetch(`${baseUrl}/ai/schedule-proposal`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message: 'Add a team sync at 6pm', timeZone: 'UTC' }),
  });
  const body = await response.json();
  const [item] = body.items;

  assert.equal(response.status, 200);
  assert.deepEqual(item.conflicts, [
    {
      id: 'existing-1',
      title: 'Dentist',
      start: '2026-08-17T18:00:00.000Z',
      end: '2026-08-17T18:30:00.000Z',
    },
  ]);

  for (const slot of item.freeSlots) {
    assert.ok(new Date(slot.start).getTime() >= Date.now() - 1000);
  }
});

test('updates proposal items in the current user AI message', async () => {
  let messageQuery;
  let messageUpdate;
  const updatedItems = [
    {
      kind: 'proposal',
      proposal: { title: 'Soccer practice' },
      isSaved: true,
    },
  ];
  const message = {
    id: 'message-1',
    conversationId: 'conversation-1',
    sender: 'ai',
    text: 'Review this item:',
    items: [
      {
        kind: 'proposal',
        proposal: { title: 'Soccer practice' },
      },
    ],
    async update(data) {
      messageUpdate = data;
      this.items = data.items;
    },
  };

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async () => ({ id: 'conversation-1' });
  AiMessage.findOne = async (options) => {
    messageQuery = options;
    return message;
  };

  const response = await fetch(
    `${baseUrl}/ai/conversation/messages/message-1`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        text: 'Changed by the client',
        conversationId: 'another-conversation',
        items: updatedItems,
      }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(messageQuery.where, {
    id: 'message-1',
    conversationId: 'conversation-1',
  });
  assert.deepEqual(messageUpdate, { items: updatedItems });
  assert.equal(body.text, 'Review this item:');
  assert.equal(body.items[0].isSaved, true);
});

test('does not update a message outside the current user conversation', async () => {
  let messageQuery;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async () => ({ id: 'conversation-1' });
  AiMessage.findOne = async (options) => {
    messageQuery = options;
    return null;
  };

  const response = await fetch(
    `${baseUrl}/ai/conversation/messages/another-users-message`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items: [] }),
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(messageQuery.where, {
    id: 'another-users-message',
    conversationId: 'conversation-1',
  });
});

test('rejects invalid AI message updates', async () => {
  let updateCount = 0;
  const message = {
    sender: 'ai',
    text: 'Review this item:',
    async update() {
      updateCount += 1;
    },
  };

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  AiConversation.findOne = async () => ({ id: 'conversation-1' });
  AiMessage.findOne = async () => message;

  const missingItemsResponse = await fetch(
    `${baseUrl}/ai/conversation/messages/message-1`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text: 'Only text was sent' }),
    },
  );
  const invalidItemsResponse = await fetch(
    `${baseUrl}/ai/conversation/messages/message-1`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items: 'not an array' }),
    },
  );
  message.sender = 'user';
  const userMessageResponse = await fetch(
    `${baseUrl}/ai/conversation/messages/message-1`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items: [] }),
    },
  );

  assert.equal(missingItemsResponse.status, 400);
  assert.deepEqual(await missingItemsResponse.json(), {
    error: 'Message items are required.',
  });
  assert.equal(invalidItemsResponse.status, 400);
  assert.equal(userMessageResponse.status, 400);
  assert.deepEqual(await userMessageResponse.json(), {
    error: 'Only AI message items can be updated.',
  });
  assert.equal(updateCount, 0);
});
