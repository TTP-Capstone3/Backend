const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_PROPOSAL_ITEMS,
  SCHEDULE_PROPOSAL_SCHEMA,
  createScheduleProposal,
} = require('../services/ai/schedule-proposal-service');

const completeEventProposal = {
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
};

const makeProposalItem = (changes = {}) => ({
  kind: 'proposal',
  proposal: {
    ...completeEventProposal,
    ...changes,
  },
  missingFields: [],
  question: null,
});

const makeResponse = (items = [makeProposalItem()]) => ({
  reply: `I found ${items.length} schedule item(s).`,
  items,
});

test('creates a validated event proposal without saving anything', async () => {
  const calls = [];
  const generateStructured = async (prompt, schema) => {
    calls.push({ prompt, schema });
    return makeResponse();
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
  assert.match(calls[0].prompt, /one or more schedule items/);
  assert.match(calls[0].prompt, /no more than 10 items/);
  assert.match(calls[0].prompt, /Do not combine separate items/);

  assert.deepEqual(result, {
    reply: 'I found 1 schedule item(s).',
    items: [
      {
        kind: 'proposal',
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
        question: null,
      },
    ],
  });
});

test('creates multiple proposals and keeps their order', async () => {
  const response = makeResponse([
    makeProposalItem({
      title: 'Breakfast',
      startAt: '2026-08-17T08:00:00-04:00',
      endAt: '2026-08-17T09:00:00-04:00',
    }),
    makeProposalItem({
      title: 'Project meeting',
      startAt: '2026-08-17T10:00:00-04:00',
      endAt: '2026-08-17T11:00:00-04:00',
    }),
    makeProposalItem({
      title: 'Study session',
      startAt: '2026-08-17T14:00:00-04:00',
      endAt: '2026-08-17T15:00:00-04:00',
    }),
    makeProposalItem({
      title: 'Gym',
      startAt: '2026-08-17T18:00:00-04:00',
      endAt: '2026-08-17T19:00:00-04:00',
    }),
  ]);

  const result = await createScheduleProposal('Add four events next Monday', {
    timeZone: 'America/New_York',
    currentTime: '2026-08-12T14:00:00.000Z',
    generateStructured: async () => response,
  });

  assert.equal(result.items.length, 4);
  assert.deepEqual(
    result.items.map((item) => item.proposal.title),
    ['Breakfast', 'Project meeting', 'Study session', 'Gym'],
  );
  assert.ok(result.items.every((item) => item.kind === 'proposal'));
});

test('supports events and tasks in the same message', async () => {
  const response = makeResponse([
    makeProposalItem({ title: 'Team meeting' }),
    makeProposalItem({
      title: 'Submit report',
      itemType: 'task',
      startAt: null,
      endAt: null,
      dueAt: '2026-08-18T17:00:00-04:00',
      estimatedMinutes: 60,
    }),
  ]);

  const result = await createScheduleProposal(
    'Add a team meeting and a task to submit my report',
    {
      timeZone: 'America/New_York',
      currentTime: '2026-08-12T14:00:00.000Z',
      generateStructured: async () => response,
    },
  );

  assert.deepEqual(
    result.items.map((item) => item.proposal.itemType),
    ['event', 'task'],
  );
  assert.equal(
    result.items[1].proposal.dueAt,
    '2026-08-18T21:00:00.000Z',
  );
});

test('returns a clarification for only the item with missing details', async () => {
  const result = await createScheduleProposal(
    'Add study group at 6 PM and add a meeting tomorrow',
    {
      timeZone: 'America/New_York',
      currentTime: '2026-08-10T14:00:00.000Z',
      generateStructured: async () =>
        makeResponse([
          makeProposalItem(),
          {
            kind: 'clarification',
            proposal: null,
            missingFields: ['startAt', 'endAt'],
            question: 'What time should the meeting start and end?',
          },
        ]),
    },
  );

  assert.equal(result.items[0].kind, 'proposal');
  assert.deepEqual(result.items[1], {
    kind: 'clarification',
    proposal: null,
    missingFields: ['startAt', 'endAt'],
    question: 'What time should the meeting start and end?',
  });
});

test('ignores extra model fields and forces backend-controlled values', async () => {
  const response = makeResponse();
  response.items[0].proposal.userId = 999;
  response.items[0].proposal.source = 'manual';
  response.items[0].proposal.timeZone = 'Asia/Tokyo';

  const result = await createScheduleProposal(
    'Add study group tomorrow evening',
    {
      timeZone: 'America/New_York',
      currentTime: '2026-08-10T14:00:00.000Z',
      generateStructured: async () => response,
    },
  );

  const proposal = result.items[0].proposal;
  assert.equal(Object.hasOwn(proposal, 'userId'), false);
  assert.equal(proposal.source, 'ai');
  assert.equal(proposal.timeZone, 'America/New_York');
});

test('rejects the batch when one event returned by Gemini is invalid', async () => {
  const response = makeResponse([
    makeProposalItem(),
    makeProposalItem({ title: 'Invalid event', endAt: null }),
  ]);

  await assert.rejects(
    () =>
      createScheduleProposal('Add two events tomorrow evening', {
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
          makeResponse([makeProposalItem({ title: 'a'.repeat(256) })]),
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );

  await assert.rejects(
    () =>
      createScheduleProposal('Add a study group', {
        ...options,
        generateStructured: async () =>
          makeResponse([makeProposalItem({ location: 'a'.repeat(256) })]),
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects an empty or oversized item list from Gemini', async () => {
  const options = {
    timeZone: 'America/New_York',
    currentTime: '2026-08-10T14:00:00.000Z',
  };

  await assert.rejects(
    () =>
      createScheduleProposal('Add an event', {
        ...options,
        generateStructured: async () => makeResponse([]),
      }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );

  await assert.rejects(
    () =>
      createScheduleProposal('Add too many events', {
        ...options,
        generateStructured: async () =>
          makeResponse(
            Array.from({ length: MAX_PROPOSAL_ITEMS + 1 }, () =>
              makeProposalItem(),
            ),
          ),
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
