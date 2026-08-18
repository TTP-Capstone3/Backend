const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_BRIEFING_OCCURRENCES,
  buildDailyBriefingSchedule,
} = require('../services/ai/daily-briefing-schedule');

const options = {
  timeZone: 'America/New_York',
  currentTime: '2026-08-16T16:00:00.000Z',
};

function makeItem(title, changes = {}) {
  return {
    id: title,
    title,
    itemType: 'task',
    status: 'active',
    allDay: false,
    timeZone: 'America/New_York',
    priority: 'none',
    estimatedMinutes: null,
    ...changes,
  };
}

test('groups active schedule items and removes private fields', () => {
  const items = [
    makeItem('Overdue report', {
      dueAt: '2026-08-15T21:00:00.000Z',
      priority: 'high',
      description: 'Private report details',
      userId: 'user-1',
    }),
    makeItem('Today task', { dueAt: '2026-08-16T18:00:00.000Z' }),
    makeItem('Team meeting', {
      itemType: 'event',
      startAt: '2026-08-16T17:00:00.000Z',
      endAt: '2026-08-16T18:00:00.000Z',
    }),
    makeItem('Today reminder', {
      itemType: 'reminder',
      reminderAt: '2026-08-16T20:00:00.000Z',
    }),
    makeItem('Upcoming task', { dueAt: '2026-08-18T14:00:00.000Z' }),
    makeItem('Too far away', { dueAt: '2026-08-25T14:00:00.000Z' }),
    makeItem('Completed task', {
      status: 'completed',
      dueAt: '2026-08-16T19:00:00.000Z',
    }),
    makeItem('Undated task'),
    makeItem('Private note', { itemType: 'note' }),
  ];

  const result = buildDailyBriefingSchedule(items, options);

  assert.equal(result.date, '2026-08-16');
  assert.deepEqual(result.counts, { overdue: 1, today: 3, upcoming: 1 });
  assert.deepEqual(
    result.sections.overdue.map((item) => item.title),
    ['Overdue report'],
  );
  assert.deepEqual(
    result.sections.today.map((item) => item.title),
    ['Team meeting', 'Today task', 'Today reminder'],
  );
  assert.deepEqual(
    result.sections.upcoming.map((item) => item.title),
    ['Upcoming task'],
  );

  const overdueItem = result.sections.overdue[0];
  assert.equal(Object.hasOwn(overdueItem, 'description'), false);
  assert.equal(Object.hasOwn(overdueItem, 'userId'), false);
});

test('uses the requested timezone to decide what belongs to today', () => {
  const reminder = makeItem('Early reminder', {
    itemType: 'reminder',
    reminderAt: '2026-08-16T05:00:00.000Z',
  });

  const newYorkResult = buildDailyBriefingSchedule([reminder], options);
  const tokyoResult = buildDailyBriefingSchedule([reminder], {
    timeZone: 'Asia/Tokyo',
    currentTime: options.currentTime,
  });

  assert.deepEqual(
    newYorkResult.sections.today.map((item) => item.title),
    ['Early reminder'],
  );
  assert.deepEqual(tokyoResult.sections.today, []);
});

test('uses local day boundaries when daylight saving time starts', () => {
  const items = [
    makeItem('Late Sunday reminder', {
      itemType: 'reminder',
      reminderAt: '2026-03-09T03:30:00.000Z',
    }),
    makeItem('Monday reminder', {
      itemType: 'reminder',
      reminderAt: '2026-03-09T04:30:00.000Z',
    }),
  ];

  const result = buildDailyBriefingSchedule(items, {
    timeZone: 'America/New_York',
    currentTime: '2026-03-08T16:00:00.000Z',
  });

  assert.deepEqual(
    result.sections.today.map((item) => item.title),
    ['Late Sunday reminder'],
  );
  assert.deepEqual(
    result.sections.upcoming.map((item) => item.title),
    ['Monday reminder'],
  );
});

test('includes an event that started before midnight and ends today', () => {
  const event = makeItem('Overnight event', {
    itemType: 'event',
    startAt: '2026-08-16T03:00:00.000Z',
    endAt: '2026-08-16T05:00:00.000Z',
  });

  const result = buildDailyBriefingSchedule([event], options);

  assert.deepEqual(
    result.sections.today.map((item) => item.title),
    ['Overnight event'],
  );
});

test('keeps a recurring event at the same local time across DST', () => {
  const event = makeItem('Weekly planning', {
    itemType: 'event',
    startAt: '2026-10-26T14:00:00.000Z',
    endAt: '2026-10-26T15:00:00.000Z',
    recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
  });

  const result = buildDailyBriefingSchedule([event], {
    timeZone: 'America/New_York',
    currentTime: '2026-11-01T17:00:00.000Z',
  });

  assert.equal(result.sections.upcoming.length, 1);
  assert.equal(
    result.sections.upcoming[0].startAt,
    '2026-11-02T15:00:00.000Z',
  );
});

test('keeps an all-day recurring event on local calendar days', () => {
  const event = makeItem('All-day conference', {
    itemType: 'event',
    startAt: '2026-10-25T04:00:00.000Z',
    endAt: '2026-10-26T04:00:00.000Z',
    allDay: true,
    recurrenceRule: 'FREQ=WEEKLY;COUNT=2',
  });

  const result = buildDailyBriefingSchedule([event], {
    timeZone: 'America/New_York',
    currentTime: '2026-11-01T17:00:00.000Z',
  });

  assert.equal(result.sections.today.length, 1);
  assert.equal(result.sections.today[0].startAt, '2026-11-01T04:00:00.000Z');
  assert.equal(result.sections.today[0].endAt, '2026-11-02T05:00:00.000Z');
});

test('uses the original event when its recurrence rule is invalid', () => {
  const event = makeItem('Imported meeting', {
    itemType: 'event',
    startAt: '2026-08-16T17:00:00.000Z',
    endAt: '2026-08-16T18:00:00.000Z',
    recurrenceRule: 'NOT A VALID RULE',
  });

  const result = buildDailyBriefingSchedule([event], options);

  assert.deepEqual(
    result.sections.today.map((item) => item.title),
    ['Imported meeting'],
  );
});

test('limits dense recurring events', () => {
  const event = makeItem('Frequent check-in', {
    itemType: 'event',
    startAt: '2026-08-16T04:00:00.000Z',
    endAt: '2026-08-16T04:01:00.000Z',
    recurrenceRule: 'FREQ=MINUTELY',
  });

  const result = buildDailyBriefingSchedule([event], options);

  assert.equal(
    result.counts.today + result.counts.upcoming,
    MAX_BRIEFING_OCCURRENCES,
  );
});

test('does not change the original schedule items', () => {
  const items = [
    makeItem('Original task', { dueAt: '2026-08-16T18:00:00.000Z' }),
  ];
  const originalItems = structuredClone(items);

  buildDailyBriefingSchedule(items, options);

  assert.deepEqual(items, originalItems);
});

test('rejects invalid input', () => {
  assert.throws(
    () => buildDailyBriefingSchedule([], { timeZone: 'New_York' }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
  assert.throws(
    () => buildDailyBriefingSchedule('not an array', options),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
});
