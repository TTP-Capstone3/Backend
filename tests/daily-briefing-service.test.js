const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_SUMMARY_LENGTH,
  createDailyBriefing,
} = require('../services/ai/daily-briefing-service');
const {
  buildDailyBriefingSchedule,
} = require('../services/ai/daily-briefing-schedule');

const makeSchedule = (sections = {}) => ({
  date: '2026-08-17',
  timeZone: 'America/New_York',
  counts: {
    overdue: 0,
    today: 0,
    upcoming: 0,
  },
  sections: {
    overdue: [],
    today: [],
    upcoming: [],
    ...sections,
  },
});

const makeItem = (changes = {}) => ({
  key: '1',
  id: 1,
  title: 'Study session',
  itemType: 'event',
  startAt: '2026-08-17T22:00:00.000Z',
  endAt: '2026-08-17T23:30:00.000Z',
  dueAt: null,
  reminderAt: null,
  allDay: false,
  timeZone: 'America/New_York',
  priority: 'none',
  estimatedMinutes: null,
  ...changes,
});

const makeResponse = (changes = {}) => ({
  summary: '  You have one event today.  ',
  sections: [{ key: 'today', headline: '  One event  ' }],
  ...changes,
});

test('builds a briefing from the grouped schedule', async () => {
  const item = makeItem();
  const schedule = makeSchedule({ today: [item] });

  const briefing = await createDailyBriefing(schedule, {
    generateStructured: async () => makeResponse(),
  });

  assert.equal(briefing.summary, 'You have one event today.');
  assert.equal(briefing.date, '2026-08-17');
  assert.equal(briefing.timeZone, 'America/New_York');
  assert.deepEqual(briefing.counts, { overdue: 0, today: 1, upcoming: 0 });
  assert.equal(briefing.sections.length, 1);
  assert.equal(briefing.sections[0].key, 'today');
  assert.equal(briefing.sections[0].title, 'Today');
  assert.equal(briefing.sections[0].headline, 'One event');
  assert.deepEqual(briefing.sections[0].items, [item]);
});

test('only sends the whitelisted fields to Gemini', async () => {
  const schedule = makeSchedule({
    today: [
      makeItem({
        description: 'Private note about therapy',
        userId: 42,
        location: 'Home',
      }),
    ],
  });

  let sentPrompt = '';
  await createDailyBriefing(schedule, {
    generateStructured: async (prompt) => {
      sentPrompt = prompt;
      return makeResponse();
    },
  });

  assert.ok(sentPrompt.includes('Study session'));
  assert.ok(!sentPrompt.includes('Private note about therapy'));
  assert.ok(!sentPrompt.includes('userId'));
  assert.ok(!sentPrompt.includes('Home'));
});

test('does not call Gemini when nothing is scheduled', async () => {
  let called = false;

  const briefing = await createDailyBriefing(makeSchedule(), {
    generateStructured: async () => {
      called = true;
      return makeResponse();
    },
  });

  assert.equal(called, false);
  assert.equal(briefing.summary, 'You have nothing scheduled right now.');
  assert.deepEqual(briefing.sections, []);
});

test('leaves out sections that have no items', async () => {
  const schedule = makeSchedule({
    overdue: [makeItem({ id: 2, key: '2', title: 'Late report' })],
    upcoming: [makeItem({ id: 3, key: '3', title: 'Dentist' })],
  });

  const briefing = await createDailyBriefing(schedule, {
    generateStructured: async () => makeResponse(),
  });

  assert.deepEqual(
    briefing.sections.map((section) => section.key),
    ['overdue', 'upcoming'],
  );
  assert.equal(briefing.sections[0].headline, null);
});

test('ignores section keys it did not ask for', async () => {
  const schedule = makeSchedule({ today: [makeItem()] });

  const briefing = await createDailyBriefing(schedule, {
    generateStructured: async () =>
      makeResponse({
        sections: [
          { key: 'made-up', headline: 'Invented section' },
          { key: 'today', headline: 'One event' },
        ],
      }),
  });

  assert.equal(briefing.sections.length, 1);
  assert.equal(briefing.sections[0].headline, 'One event');
});

test('keeps the items from the schedule when Gemini repeats a section', async () => {
  const item = makeItem();
  const schedule = makeSchedule({ today: [item] });

  const briefing = await createDailyBriefing(schedule, {
    generateStructured: async () =>
      makeResponse({
        sections: [
          { key: 'today', headline: 'First headline' },
          { key: 'today', headline: 'Second headline' },
        ],
      }),
  });

  assert.equal(briefing.sections.length, 1);
  assert.equal(briefing.sections[0].headline, 'First headline');
  assert.deepEqual(briefing.sections[0].items, [item]);
});

test('rejects a briefing without a summary', async () => {
  const schedule = makeSchedule({ today: [makeItem()] });

  await assert.rejects(
    createDailyBriefing(schedule, {
      generateStructured: async () => makeResponse({ summary: '   ' }),
    }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects a summary that is too long', async () => {
  const schedule = makeSchedule({ today: [makeItem()] });

  await assert.rejects(
    createDailyBriefing(schedule, {
      generateStructured: async () =>
        makeResponse({ summary: 'a'.repeat(MAX_SUMMARY_LENGTH + 1) }),
    }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects an invalid section headline', async () => {
  const schedule = makeSchedule({ today: [makeItem()] });

  await assert.rejects(
    createDailyBriefing(schedule, {
      generateStructured: async () =>
        makeResponse({ sections: [{ key: 'today', headline: 42 }] }),
    }),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('rejects a schedule that is not grouped', async () => {
  await assert.rejects(
    createDailyBriefing({ sections: { overdue: [], today: [] } }, {
      generateStructured: async () => makeResponse(),
    }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
});

test('briefs a real grouped schedule without leaking descriptions', async () => {
  const scheduleItems = [
    {
      id: 1,
      title: 'Turn in lab report',
      itemType: 'task',
      status: 'active',
      dueAt: '2026-08-16T15:00:00.000Z',
      description: 'Private note about my grade',
    },
    {
      id: 2,
      title: 'Study session',
      itemType: 'event',
      status: 'active',
      startAt: '2026-08-17T22:00:00.000Z',
      endAt: '2026-08-17T23:30:00.000Z',
    },
    {
      id: 3,
      title: 'Dentist',
      itemType: 'event',
      status: 'active',
      startAt: '2026-08-20T14:00:00.000Z',
      endAt: '2026-08-20T15:00:00.000Z',
    },
    {
      id: 4,
      title: 'Already finished',
      itemType: 'task',
      status: 'completed',
      dueAt: '2026-08-17T18:00:00.000Z',
    },
  ];

  const schedule = buildDailyBriefingSchedule(scheduleItems, {
    timeZone: 'America/New_York',
    currentTime: new Date('2026-08-17T13:00:00.000Z'),
  });

  let sentPrompt = '';
  const briefing = await createDailyBriefing(schedule, {
    generateStructured: async (prompt) => {
      sentPrompt = prompt;
      return {
        summary: 'You have one overdue task and one event today.',
        sections: [
          { key: 'overdue', headline: 'Lab report is late' },
          { key: 'today', headline: 'Study session tonight' },
          { key: 'upcoming', headline: 'Dentist on Thursday' },
        ],
      };
    },
  });

  assert.deepEqual(briefing.counts, { overdue: 1, today: 1, upcoming: 1 });
  assert.deepEqual(
    briefing.sections.map((section) => section.title),
    ['Needs attention', 'Today', 'Coming up'],
  );
  assert.equal(briefing.sections[0].items[0].title, 'Turn in lab report');
  assert.ok(!sentPrompt.includes('Private note about my grade'));
  assert.ok(!sentPrompt.includes('Already finished'));
});
