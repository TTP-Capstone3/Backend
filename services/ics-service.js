const ical = require('node-ical');

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

// Convert one VEVENT from node-ical into the field names used by ScheduleItem.
function convertCalendarEvent(calendarEvent) {
  return {
    title: getText(calendarEvent.summary) || 'Untitled event',
    description: getText(calendarEvent.description),
    itemType: 'event',
    startAt: calendarEvent.start || null,
    endAt: calendarEvent.end || null,
    allDay: Boolean(calendarEvent.start?.dateOnly),
    timeZone: calendarEvent.start?.tz || DEFAULT_TIME_ZONE,
    location: getText(calendarEvent.location),
    source: 'ics-import',
    externalUid: getText(calendarEvent.uid),
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
