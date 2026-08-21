const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCalendarEvents } = require('../services/ics-service');

async function parseWithServerTimeZone(calendarText, serverTimeZone) {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = serverTimeZone;

  try {
    return await parseCalendarEvents(calendarText);
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }
}

test('converts an ICS event into schedule item fields', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:team-standup@example.com',
    'SUMMARY:Team Standup',
    'DESCRIPTION:Daily team meeting',
    'LOCATION:Zoom',
    'DTSTART;TZID=America/New_York:20260810T090000',
    'DTEND;TZID=America/New_York:20260810T093000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const events = await parseCalendarEvents(calendarText);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Team Standup');
  assert.equal(events[0].description, 'Daily team meeting');
  assert.equal(events[0].location, 'Zoom');
  assert.equal(events[0].itemType, 'event');
  assert.equal(events[0].source, 'ics-import');
  assert.equal(events[0].externalUid, 'team-standup@example.com');
  assert.equal(events[0].timeZone, 'America/New_York');
  assert.equal(events[0].allDay, false);
  assert.ok(events[0].startAt instanceof Date);
  assert.ok(events[0].endAt instanceof Date);
  assert.equal(events[0].startAt.toISOString(), '2026-08-10T13:00:00.000Z');
  assert.equal(events[0].endAt.toISOString(), '2026-08-10T13:30:00.000Z');
});

test('recognizes an all-day event', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:demo-day@example.com',
    'SUMMARY:Demo Day',
    'DTSTART;VALUE=DATE:20260821',
    'DTEND;VALUE=DATE:20260822',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  for (const serverTimeZone of ['UTC', 'America/Los_Angeles']) {
    const events = await parseWithServerTimeZone(calendarText, serverTimeZone);

    assert.equal(events.length, 1);
    assert.equal(events[0].allDay, true);
    assert.equal(events[0].timeZone, 'America/New_York');
    assert.equal(events[0].startAt.toISOString(), '2026-08-21T04:00:00.000Z');
    assert.equal(events[0].endAt.toISOString(), '2026-08-22T04:00:00.000Z');
  }
});

test('uses the default timezone for a floating event', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:floating-event@example.com',
    'SUMMARY:Floating Event',
    'DTSTART:20260810T090000',
    'DTEND:20260810T100000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  for (const serverTimeZone of ['UTC', 'America/Los_Angeles']) {
    const events = await parseWithServerTimeZone(calendarText, serverTimeZone);

    assert.equal(events.length, 1);
    assert.equal(events[0].timeZone, 'America/New_York');
    assert.equal(events[0].startAt.toISOString(), '2026-08-10T13:00:00.000Z');
    assert.equal(events[0].endAt.toISOString(), '2026-08-10T14:00:00.000Z');
  }
});

test('rejects empty calendar text', async () => {
  await assert.rejects(parseCalendarEvents(''), {
    message: 'Calendar text is required.',
  });
});

test('converts an ICS VTODO into a task', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VTODO',
    'UID:finish-report@example.com',
    'SUMMARY:Finish report',
    'DESCRIPTION:Quarterly report',
    'DUE;TZID=America/New_York:20260812T170000',
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
    'END:VCALENDAR',
  ].join('\n');

  const items = await parseCalendarEvents(calendarText);

  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, 'task');
  assert.equal(items[0].title, 'Finish report');
  assert.equal(items[0].description, 'Quarterly report');
  assert.equal(items[0].status, 'active');
  assert.equal(items[0].externalUid, 'finish-report@example.com');
  assert.equal(items[0].dueAt.toISOString(), '2026-08-12T21:00:00.000Z');
});

test('marks a completed VTODO as a completed task', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VTODO',
    'UID:done-task@example.com',
    'SUMMARY:Already done',
    'STATUS:COMPLETED',
    'END:VTODO',
    'END:VCALENDAR',
  ].join('\n');

  const items = await parseCalendarEvents(calendarText);

  assert.equal(items[0].itemType, 'task');
  assert.equal(items[0].status, 'completed');
});

test('converts an ICS VJOURNAL into a note', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VJOURNAL',
    'UID:idea@example.com',
    'SUMMARY:Idea',
    'DESCRIPTION:Try adding note support',
    'END:VJOURNAL',
    'END:VCALENDAR',
  ].join('\n');

  const items = await parseCalendarEvents(calendarText);

  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, 'note');
  assert.equal(items[0].title, 'Idea');
  assert.equal(items[0].description, 'Try adding note support');
});

test('a VEVENT tagged X-TASKLY-ITEM-TYPE:reminder imports as a reminder', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:call-vet@example.com',
    'SUMMARY:Call the vet',
    'DTSTART:20260813T150000Z',
    'DTEND:20260813T150000Z',
    'X-TASKLY-ITEM-TYPE:reminder',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const items = await parseCalendarEvents(calendarText);

  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, 'reminder');
  assert.equal(items[0].title, 'Call the vet');
  assert.equal(items[0].reminderAt.toISOString(), '2026-08-13T15:00:00.000Z');
});

test('a plain VEVENT without the custom property still imports as an event', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:plain-event@example.com',
    'SUMMARY:Plain event',
    'DTSTART:20260813T150000Z',
    'DTEND:20260813T160000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const items = await parseCalendarEvents(calendarText);

  assert.equal(items[0].itemType, 'event');
});

test('preserves an imported recurrence rule', async () => {
  const calendarText = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:class@example.com',
    'SUMMARY:Class',
    'DTSTART;TZID=America/New_York:20260810T100000',
    'DTEND;TZID=America/New_York:20260810T110000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const events = await parseCalendarEvents(calendarText);
  assert.equal(events.length, 1);
  assert.equal(events[0].recurrenceRule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH');
});
