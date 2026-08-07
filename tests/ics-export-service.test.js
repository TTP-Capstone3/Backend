const test = require('node:test');
const assert = require('node:assert/strict');

const { createIcsCalendar } = require('../services/ics-export-service');
const { parseCalendarEvents } = require('../services/ics-service');

const GENERATED_AT = new Date('2026-08-07T12:00:00.000Z');

test('creates ICS text for a timed event', () => {
  const calendarText = createIcsCalendar(
    [
      {
        id: 42,
        itemType: 'event',
        title: 'Planning, Review; Week 1',
        description: 'Discuss goals\nand blockers',
        location: 'Room 2\\A',
        startAt: new Date('2026-08-10T13:00:00.000Z'),
        endAt: new Date('2026-08-10T13:30:00.000Z'),
        allDay: false,
        timeZone: 'America/New_York',
      },
    ],
    GENERATED_AT,
  );

  assert.match(calendarText, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendarText, /VERSION:2\.0\r\n/);
  assert.match(calendarText, /UID:schedule-item-42@ttp-capstone3\.local\r\n/);
  assert.match(calendarText, /DTSTAMP:20260807T120000Z\r\n/);
  assert.match(calendarText, /DTSTART:20260810T130000Z\r\n/);
  assert.match(calendarText, /DTEND:20260810T133000Z\r\n/);
  assert.match(calendarText, /SUMMARY:Planning\\, Review\\; Week 1\r\n/);
  assert.match(calendarText, /DESCRIPTION:Discuss goals\\nand blockers\r\n/);
  assert.match(calendarText, /LOCATION:Room 2\\\\A\r\n/);
  assert.match(calendarText, /END:VCALENDAR\r\n$/);
});

test('uses the event timezone when exporting an all-day event', () => {
  const calendarText = createIcsCalendar(
    [
      {
        id: 43,
        itemType: 'event',
        title: 'Tokyo Demo Day',
        startAt: new Date('2026-08-20T15:00:00.000Z'),
        endAt: new Date('2026-08-21T15:00:00.000Z'),
        allDay: true,
        timeZone: 'Asia/Tokyo',
      },
    ],
    GENERATED_AT,
  );

  assert.match(calendarText, /DTSTART;VALUE=DATE:20260821\r\n/);
  assert.match(calendarText, /DTEND;VALUE=DATE:20260822\r\n/);
});

test('creates event text that the existing importer can parse again', async () => {
  const longTitle = 'Capstone planning meeting with a title long enough to require an ICS continuation line';
  const calendarText = createIcsCalendar(
    [
      {
        id: 44,
        itemType: 'event',
        title: longTitle,
        description: 'Review the calendar import and export work.',
        startAt: new Date('2026-08-11T14:00:00.000Z'),
        endAt: new Date('2026-08-11T15:00:00.000Z'),
        allDay: false,
        timeZone: 'America/New_York',
      },
    ],
    GENERATED_AT,
  );

  for (const line of calendarText.trimEnd().split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  }

  const importedEvents = await parseCalendarEvents(calendarText);

  assert.equal(importedEvents.length, 1);
  assert.equal(importedEvents[0].title, longTitle);
  assert.equal(importedEvents[0].description, 'Review the calendar import and export work.');
  assert.equal(importedEvents[0].externalUid, 'schedule-item-44@ttp-capstone3.local');
  assert.equal(importedEvents[0].startAt.toISOString(), '2026-08-11T14:00:00.000Z');
  assert.equal(importedEvents[0].endAt.toISOString(), '2026-08-11T15:00:00.000Z');
});

test('rejects non-event schedule items instead of silently dropping them', () => {
  assert.throws(
    () =>
      createIcsCalendar(
        [
          {
            id: 45,
            itemType: 'task',
            title: 'Finish export route',
            dueAt: new Date('2026-08-12T21:00:00.000Z'),
          },
        ],
        GENERATED_AT,
      ),
    { message: 'ICS export currently supports event schedule items only.' },
  );
});
