const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEDULE_PROPOSAL_SCHEMA,
  createScheduleProposal,
} = require('../services/ai/schedule-proposal-service');

const completeEventResponse = {
  kind: 'proposal',
  reply: 'Here is what I understood.',
  proposal: {
    title: '  Study group  ',
    description: null,
    itemType: 'event',
    startAt: '2026-08-11T18:00:00-04:00',
    endAt: '2026-08-11T19:30:00-04:00',
    dueAt: null,
    reminderAt: null,
    allDay: false,
    priority: 'none',
    estimatedMinutes: null,
    location: '  Library  ',
  },
  missingFields: [],
};

const makeEventResponse = (changes = {}) => ({
  ...completeEventResponse,
  proposal: {
    ...completeEventResponse.proposal,
    ...changes,
  },
});

test('creates a validated event proposal without saving anything', async () => {
  const calls = [];
  const generateStructured = async (prompt, schema) => {
    calls.push({ prompt, schema });
    return completeEventResponse;
  };

  const result = await createScheduleProposal(
    'Add study group tomorrow from 6 to 7:30 PM',
    {
      timeZone: 'America/New_York',
      currentTime: '2026-08-10T14:00:00.000Z',
      generateStructured,
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].schema, SCHEDULE_PROPOSAL_SCHEMA);
  assert.match(calls[0].prompt, /2026-08-10T14:00:00\.000Z/);
  assert.match(calls[0].prompt, /America\/New_York/);
  assert.match(calls[0].prompt, /Add study group tomorrow/);

  assert.deepEqual(result, {
    kind: 'proposal',
    reply: 'Here is what I understood.',
    proposal: {
      title: 'Study group',
      description: null,
      itemType: 'event',
      startAt: '2026-08-11T22:00:00.000Z',
      endAt: '2026-08-11T23:30:00.000Z',
      dueAt: null,
      reminderAt: null,
      allDay: false,
      timeZone: 'America/New_York',
      priority: 'none',
      estimatedMinutes: null,
      location: 'Library',
      source: 'ai',
    },
    missingFields: [],
  });
});

test('returns a clarification when an event time is missing', async () => {
  const result = await createScheduleProposal('Add a meeting tomorrow', {
    timeZone: 'America/New_York',
    currentTime: '2026-08-10T14:00:00.000Z',
    generateStructured: async () => ({
      kind: 'clarification',
      reply: 'What time should the meeting start and end?',
      proposal: null,
      missingFields: ['startAt', 'endAt'],
    }),
  });

  assert.deepEqual(result, {
    kind: 'clarification',
    reply: 'What time should the meeting start and end?',
    proposal: null,
    missingFields: ['startAt', 'endAt'],
  });
});

test('ignores extra model fields and forces backend-controlled values', async () => {
  const response = makeEventResponse();
  response.proposal.userId = 999;
  response.proposal.source = 'manual';
  response.proposal.timeZone = 'Asia/Tokyo';

  const result = await createScheduleProposal('Add study group tomorrow evening', {
    timeZone: 'America/New_York',
    currentTime: '2026-08-10T14:00:00.000Z',
    generateStructured: async () => response,
  });

  assert.equal(Object.hasOwn(result.proposal, 'userId'), false);
  assert.equal(result.proposal.source, 'ai');
  assert.equal(result.proposal.timeZone, 'America/New_York');
});

test('rejects an invalid event returned by Gemini', async () => {
  const response = makeEventResponse({ endAt: null });

  await assert.rejects(
    () =>
      createScheduleProposal('Add study group tomorrow evening', {
        timeZone: 'America/New_York',
        currentTime: '2026-08-10T14:00:00.000Z',
        generateStructured: async () => response,
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects proposal text that is too long for the database', async () => {
  const options = {
    timeZone: 'America/New_York',
    currentTime: '2026-08-10T14:00:00.000Z',
  };

  await assert.rejects(
    () =>
      createScheduleProposal('Add a study group', {
        ...options,
        generateStructured: async () =>
          makeEventResponse({ title: 'a'.repeat(256) }),
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );

  await assert.rejects(
    () =>
      createScheduleProposal('Add a study group', {
        ...options,
        generateStructured: async () =>
          makeEventResponse({ location: 'a'.repeat(256) }),
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects empty messages and invalid time zones', async () => {
  await assert.rejects(
    () => createScheduleProposal('  ', { timeZone: 'America/New_York' }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );

  await assert.rejects(
    () => createScheduleProposal('Add a task', { timeZone: 'New_York' }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
});
