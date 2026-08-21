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

// Our own export tags a reminder's zero-length VEVENT with this custom
// property (ICS has no standalone reminder component), so it comes back in
// as a reminder here instead of a plain event.
function convertCalendarReminder(calendarEvent) {
  const timeZone = calendarEvent.start?.tz || DEFAULT_TIME_ZONE;

  return {
    title: getText(calendarEvent.summary) || 'Untitled reminder',
    description: getText(calendarEvent.description),
    itemType: 'reminder',
    reminderAt: normalizeCalendarDate(calendarEvent.start, timeZone),
    timeZone,
    source: 'ics-import',
    externalUid: getText(calendarEvent.uid),
  };
}

// VTODO status values don't line up 1:1 with ours - CANCELLED maps to
// archived since scheduleItem creation doesn't accept a "cancelled" status.
function mapTodoStatus(calendarStatus) {
  if (calendarStatus === 'COMPLETED') {
    return 'completed';
  }

  if (calendarStatus === 'CANCELLED') {
    return 'archived';
  }

  return 'active';
}

// Convert one VTODO from node-ical into the field names used by ScheduleItem.
function convertCalendarTodo(calendarTodo) {
  const timeZone = calendarTodo.start?.tz || calendarTodo.due?.tz || DEFAULT_TIME_ZONE;

  return {
    title: getText(calendarTodo.summary) || 'Untitled task',
    description: getText(calendarTodo.description),
    itemType: 'task',
    startAt: normalizeCalendarDate(calendarTodo.start, timeZone),
    dueAt: normalizeCalendarDate(calendarTodo.due, timeZone),
    allDay: Boolean(calendarTodo.start?.dateOnly || calendarTodo.due?.dateOnly),
    timeZone,
    location: getText(calendarTodo.location),
    status: mapTodoStatus(calendarTodo.status),
    source: 'ics-import',
    externalUid: getText(calendarTodo.uid),
  };
}

// Convert one VJOURNAL from node-ical into the field names used by
// ScheduleItem. Notes don't need any scheduling fields.
function convertCalendarJournal(calendarJournal) {
  return {
    title: getText(calendarJournal.summary) || 'Untitled note',
    description: getText(calendarJournal.description),
    itemType: 'note',
    source: 'ics-import',
    externalUid: getText(calendarJournal.uid),
  };
}

// Parses calendar text into schedule items. VEVENT becomes an event (or a
// reminder if it carries our own X-TASKLY-ITEM-TYPE:reminder property),
// VTODO becomes a task, and VJOURNAL becomes a note. Anything else (timezone
// definitions, free/busy blocks, etc.) is ignored.
async function parseCalendarEvents(calendarText) {
  if (typeof calendarText !== 'string' || !calendarText.trim()) {
    throw new Error('Calendar text is required.');
  }

  const parsedCalendar = await ical.async.parseICS(calendarText);

  return Object.values(parsedCalendar)
    .map((calendarEntry) => {
      if (calendarEntry.type === 'VEVENT') {
        return calendarEntry['TASKLY-ITEM-TYPE'] === 'reminder'
          ? convertCalendarReminder(calendarEntry)
          : convertCalendarEvent(calendarEntry);
      }

      if (calendarEntry.type === 'VTODO') {
        return convertCalendarTodo(calendarEntry);
      }

      if (calendarEntry.type === 'VJOURNAL') {
        return convertCalendarJournal(calendarEntry);
      }

      return null;
    })
    .filter(Boolean);
}

module.exports = {
  parseCalendarEvents,
};
