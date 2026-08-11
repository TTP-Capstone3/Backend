const ical = require('node-ical');
const { Temporal } = require('temporal-polyfill');

const DEFAULT_TIME_ZONE = 'America/New_York';

// Calendar fields sometimes contain empty strings. This helper turns those
// values into null so they are easier to save in the database later.
function getText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

// ICS values without a timezone are "floating" times. node-ical initially
// reads them in the server's timezone, so rebuild the same clock values in our
// default timezone. This keeps imports consistent on every developer machine
// and on production servers, which commonly run in UTC.
function normalizeCalendarDate(calendarDate, timeZone) {
  if (!(calendarDate instanceof Date)) {
    return null;
  }

  // Dates with an ICS timezone already represent the correct instant.
  if (calendarDate.tz) {
    return calendarDate;
  }

  const zonedDateTime = Temporal.ZonedDateTime.from({
    timeZone,
    year: calendarDate.getFullYear(),
    month: calendarDate.getMonth() + 1,
    day: calendarDate.getDate(),
    hour: calendarDate.getHours(),
    minute: calendarDate.getMinutes(),
    second: calendarDate.getSeconds(),
    millisecond: calendarDate.getMilliseconds(),
  });

  return new Date(zonedDateTime.epochMilliseconds);
}

// Preserve an imported event's ICS recurrence rule as text so it can be
// rendered by the frontend and written back out during ICS export.
function getRecurrenceRule(calendarEvent) {
  if (!calendarEvent.rrule) {
    return null;
  }

  const ruleText = calendarEvent.rrule.toString();
  const recurrenceLine = ruleText
    .split(/\r?\n/)
    .find((line) => line.startsWith('RRULE:'));

  if (!recurrenceLine) {
    return null;
  }

  return recurrenceLine.slice('RRULE:'.length).trim();
}

// Convert one VEVENT from node-ical into the field names used by ScheduleItem.
function convertCalendarEvent(calendarEvent) {
  const timeZone = calendarEvent.start?.tz || DEFAULT_TIME_ZONE;

  return {
    title: getText(calendarEvent.summary) || 'Untitled event',
    description: getText(calendarEvent.description),
    itemType: 'event',
    startAt: normalizeCalendarDate(calendarEvent.start, timeZone),
    endAt: normalizeCalendarDate(calendarEvent.end, timeZone),
    allDay: Boolean(calendarEvent.start?.dateOnly),
    timeZone,
    location: getText(calendarEvent.location),
    source: 'ics-import',
    externalUid: getText(calendarEvent.uid),
    recurrenceRule: getRecurrenceRule(calendarEvent)
  };
}

// Parse calendar text and return only events. Other ICS entries, such as
// timezone definitions and tasks, are not part of the first version.
async function parseCalendarEvents(calendarText) {
  if (typeof calendarText !== 'string' || !calendarText.trim()) {
    throw new Error('Calendar text is required.');
  }

  const parsedCalendar = await ical.async.parseICS(calendarText);

  return Object.values(parsedCalendar)
    .filter((calendarEntry) => calendarEntry.type === 'VEVENT')
    .map(convertCalendarEvent);
}

module.exports = {
  parseCalendarEvents,
};
