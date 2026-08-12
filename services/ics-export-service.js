const { Temporal } = require('temporal-polyfill');
const { RRule } = require('rrule')

const DEFAULT_TIME_ZONE = 'America/New_York';
const PRODUCT_ID = '-//TTP Capstone 3//AI Calendar//EN';
const CRLF = '\r\n';

// Turn a database date into the compact UTC format required by ICS files.
// Example: 2026-08-10T13:00:00.000Z becomes 20260810T130000Z.
function formatUtcDateTime(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

// All-day events need a calendar date rather than a UTC timestamp. Convert
// the saved instant back into the event's timezone before taking its date.
function formatCalendarDate(value, timeZone, fieldName) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  const eventTimeZone = timeZone || DEFAULT_TIME_ZONE;

  try {
    return Temporal.Instant.fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(eventTimeZone)
      .toPlainDate()
      .toString()
      .replace(/-/g, '');
  } catch {
    throw new Error(`timeZone must be a valid IANA timezone.`);
  }
}

// Commas, semicolons, backslashes, and newlines have special meanings in ICS
// text fields. Escaping them keeps user-entered text from breaking the file.
function escapeCalendarText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// ICS content lines should be no longer than 75 UTF-8 bytes. Continued lines
// begin with one space so calendar programs know to join them back together.
function foldContentLine(line) {
  const foldedLines = [];
  let currentLine = '';

  for (const character of line) {
    if (Buffer.byteLength(currentLine + character, 'utf8') > 75) {
      foldedLines.push(currentLine);
      currentLine = ` ${character}`;
    } else {
      currentLine += character;
    }
  }

  foldedLines.push(currentLine);
  return foldedLines;
}

function getEventUid(scheduleItem) {
  if (typeof scheduleItem.externalUid === 'string' && scheduleItem.externalUid.trim()) {
    return scheduleItem.externalUid.trim();
  }

  if (scheduleItem.id !== undefined && scheduleItem.id !== null) {
    return `schedule-item-${scheduleItem.id}@ttp-capstone3.local`;
  }

  throw new Error('An event needs an id or externalUid before it can be exported.');
}

function createEventLines(scheduleItem, generatedAt) {
  if (!scheduleItem || scheduleItem.itemType !== 'event') {
    throw new Error('ICS export currently supports event schedule items only.');
  }

  if (!scheduleItem.startAt) {
    throw new Error('An exported event needs a startAt date.');
  }

  const recurrenceRule = normalizeRecurrenceRule(scheduleItem.recurrenceRule);
  const title = scheduleItem.title?.trim() || 'Untitled event';
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(getEventUid(scheduleItem))}`,
    `DTSTAMP:${formatUtcDateTime(generatedAt, 'generatedAt')}`,
  ];

  if (scheduleItem.allDay) {
    lines.push(
      `DTSTART;VALUE=DATE:${formatCalendarDate(
        scheduleItem.startAt,
        scheduleItem.timeZone,
        'startAt',
      )}`,
    );

    if (scheduleItem.endAt) {
      lines.push(
        `DTEND;VALUE=DATE:${formatCalendarDate(
          scheduleItem.endAt,
          scheduleItem.timeZone,
          'endAt',
        )}`,
      );
    }
  } else if (recurrenceRule) {
    const timeZone = scheduleItem.timeZone || DEFAULT_TIME_ZONE;

    lines.push(
      `DTSTART;TZID=${timeZone}:${formatZonedDateTime(
        scheduleItem.startAt,
        timeZone,
        'startAt',
      )}`,
    );

    if (scheduleItem.endAt) {
      lines.push(
        `DTEND;TZID=${timeZone}:${formatZonedDateTime(
          scheduleItem.endAt,
          timeZone,
          'endAt',
        )}`,
      );
    }
  } else {
    lines.push(`DTSTART:${formatUtcDateTime(scheduleItem.startAt, 'startAt')}`);

    if (scheduleItem.endAt) {
      lines.push(`DTEND:${formatUtcDateTime(scheduleItem.endAt, 'endAt')}`);
    }
  }

  lines.push(`SUMMARY:${escapeCalendarText(title)}`);

  if (scheduleItem.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeCalendarText(scheduleItem.description.trim())}`);
  }

  if (scheduleItem.location?.trim()) {
    lines.push(`LOCATION:${escapeCalendarText(scheduleItem.location.trim())}`);
  }

  if (scheduleItem.recurrenceRule?.trim()) {
    lines.push(`RRULE:${recurrenceRule}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

function normalizeRecurrenceRule(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('recurrenceRule must be a string.');
  }

  // RRULE should remain one ICS line.
  if (/[\r\n]/.test(value)) {
    throw new Error('recurrenceRule must be a single-line RRULE.');
  }

  const recurrenceRule = value.trim();

  try {
    RRule.fromString(recurrenceRule);
  } catch {
    throw new Error('recurrenceRule must be a valid RRULE.');
  }

  return recurrenceRule;
}

function formatZonedDateTime(value, timeZone, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  const eventTimeZone = timeZone || DEFAULT_TIME_ZONE;

  try {
    const zonedDateTime = Temporal.Instant
      .fromEpochMilliseconds(date.getTime())
      .toZonedDateTimeISO(eventTimeZone);

    const pad = (number) => String(number).padStart(2, '0');
    return (
      `${zonedDateTime.year}` +
      `${pad(zonedDateTime.month)}` +
      `${pad(zonedDateTime.day)}T` +
      `${pad(zonedDateTime.hour)}` +
      `${pad(zonedDateTime.minute)}` +
      `${pad(zonedDateTime.second)}`
    );
  } catch {
    throw new Error('timeZone must be a valid IANA timezone.');
  }
}

// Create one complete calendar document from event schedule items. generatedAt
// is optional in normal code and can be fixed in tests for predictable output.
function createIcsCalendar(scheduleItems, generatedAt = new Date()) {
  if (!Array.isArray(scheduleItems)) {
    throw new Error('scheduleItems must be an array.');
  }

  const contentLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
  ];

  for (const scheduleItem of scheduleItems) {
    contentLines.push(...createEventLines(scheduleItem, generatedAt));
  }

  contentLines.push('END:VCALENDAR');

  const foldedLines = contentLines.flatMap(foldContentLine);
  return `${foldedLines.join(CRLF)}${CRLF}`;
}

module.exports = {
  createIcsCalendar,
};
