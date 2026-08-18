const { RRule } = require('rrule');
const { Temporal } = require('temporal-polyfill');

const MAX_BRIEFING_OCCURRENCES = 250;
const UPCOMING_DAYS = 7;
const HIDDEN_STATUSES = ['completed', 'archived', 'cancelled'];

function createInputError(message) {
  const error = new Error(message);
  error.code = 'AI_INVALID_INPUT';
  return error;
}

function cleanTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    throw createInputError('A timeZone is required.');
  }

  const cleanedTimeZone = timeZone.trim();

  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(
      cleanedTimeZone,
    );
  } catch {
    throw createInputError('A valid IANA timeZone is required.');
  }

  return cleanedTimeZone;
}

function cleanCurrentTime(currentTime) {
  const date = currentTime === undefined ? new Date() : new Date(currentTime);

  if (Number.isNaN(date.getTime())) {
    throw createInputError('currentTime must be a valid date.');
  }

  return date;
}

function getDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDayBoundaries(currentTime, timeZone) {
  const zonedTime = Temporal.Instant.fromEpochMilliseconds(
    currentTime.getTime(),
  ).toZonedDateTimeISO(timeZone);
  const date = zonedTime.toPlainDate();
  const startOfToday = date.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from('00:00'),
  });

  return {
    date: date.toString(),
    todayStart: new Date(startOfToday.epochMilliseconds),
    tomorrowStart: new Date(startOfToday.add({ days: 1 }).epochMilliseconds),
    upcomingEnd: new Date(
      startOfToday.add({ days: UPCOMING_DAYS + 1 }).epochMilliseconds,
    ),
  };
}

function getItemTimeZone(item, fallbackTimeZone) {
  if (typeof item.timeZone !== 'string' || !item.timeZone.trim()) {
    return fallbackTimeZone;
  }

  const itemTimeZone = item.timeZone.trim();

  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(itemTimeZone);
    return itemTimeZone;
  } catch {
    return fallbackTimeZone;
  }
}

function toRRuleDate(value, timeZone) {
  const zonedTime = Temporal.Instant.fromEpochMilliseconds(
    value.getTime(),
  ).toZonedDateTimeISO(timeZone);

  return new Date(
    Date.UTC(
      zonedTime.year,
      zonedTime.month - 1,
      zonedTime.day,
      zonedTime.hour,
      zonedTime.minute,
      zonedTime.second,
      zonedTime.millisecond,
    ),
  );
}

function fromRRuleDate(value, timeZone) {
  const zonedTime = Temporal.ZonedDateTime.from({
    timeZone,
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
    millisecond: value.getUTCMilliseconds(),
  });

  return new Date(zonedTime.epochMilliseconds);
}

function getAllDayDuration(item, timeZone, originalStart) {
  const originalEnd = getDate(item.endAt);
  if (!originalEnd) {
    return 1;
  }

  const startDate = Temporal.Instant.fromEpochMilliseconds(
    originalStart.getTime(),
  )
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const endDate = Temporal.Instant.fromEpochMilliseconds(originalEnd.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();

  return Math.max(1, startDate.until(endDate).days);
}

function getOccurrenceEnd(item, occurrenceStart, originalStart, timeZone) {
  if (item.allDay) {
    const durationDays = getAllDayDuration(item, timeZone, originalStart);
    const occurrenceStartZoned = Temporal.Instant.fromEpochMilliseconds(
      occurrenceStart.getTime(),
    ).toZonedDateTimeISO(timeZone);

    return new Date(
      occurrenceStartZoned.add({ days: durationDays }).epochMilliseconds,
    );
  }

  const originalEnd = getDate(item.endAt);
  const duration = originalEnd
    ? Math.max(0, originalEnd.getTime() - originalStart.getTime())
    : 0;

  return new Date(occurrenceStart.getTime() + duration);
}

function expandRecurringEvent(item, boundaries, fallbackTimeZone) {
  const originalStart = getDate(item.startAt);
  if (!originalStart || !item.recurrenceRule) {
    return [];
  }

  const timeZone = getItemTimeZone(item, fallbackTimeZone);
  const originalEnd = getDate(item.endAt);
  const duration = originalEnd
    ? Math.max(0, originalEnd.getTime() - originalStart.getTime())
    : 0;
  const searchPadding = item.allDay
    ? duration + 24 * 60 * 60 * 1000
    : duration;
  const searchStart = new Date(
    boundaries.todayStart.getTime() - searchPadding,
  );

  try {
    const options = RRule.parseString(item.recurrenceRule);
    options.dtstart = toRRuleDate(originalStart, timeZone);
    options.tzid = timeZone;

    const rule = new RRule(options);
    const occurrenceStarts = rule.between(
      toRRuleDate(searchStart, timeZone),
      toRRuleDate(boundaries.upcomingEnd, timeZone),
      true,
      (_date, index) => index < MAX_BRIEFING_OCCURRENCES,
    );

    return occurrenceStarts.map((value) => {
      const start = fromRRuleDate(value, timeZone);
      return {
        start,
        end: getOccurrenceEnd(item, start, originalStart, timeZone),
        timeZone,
      };
    });
  } catch {
    return null;
  }
}

function toIsoString(value) {
  const date = getDate(value);
  return date ? date.toISOString() : null;
}

function makeBriefingItem(item, changes = {}) {
  const startAt = changes.startAt ?? toIsoString(item.startAt);
  const endAt = changes.endAt ?? toIsoString(item.endAt);
  const key = changes.key ?? String(item.id);

  return {
    key,
    id: item.id,
    title:
      typeof item.title === 'string' && item.title.trim()
        ? item.title.trim()
        : 'Untitled item',
    itemType: item.itemType,
    startAt,
    endAt,
    dueAt: toIsoString(item.dueAt),
    reminderAt: toIsoString(item.reminderAt),
    allDay: Boolean(item.allDay),
    timeZone: changes.timeZone ?? item.timeZone ?? null,
    priority: item.priority || 'none',
    estimatedMinutes: Number.isInteger(item.estimatedMinutes)
      ? item.estimatedMinutes
      : null,
  };
}

function getSortTime(item) {
  return new Date(
    item.dueAt || item.startAt || item.reminderAt || 0,
  ).getTime();
}

function sortBriefingItems(firstItem, secondItem) {
  const timeDifference = getSortTime(firstItem) - getSortTime(secondItem);
  return timeDifference || firstItem.title.localeCompare(secondItem.title);
}

function isInRange(value, start, end) {
  return value >= start.getTime() && value < end.getTime();
}

function eventOverlapsRange(start, end, rangeStart, rangeEnd) {
  const startTime = start.getTime();
  const endTime = Math.max(startTime + 1, end.getTime());

  return startTime < rangeEnd.getTime() && endTime > rangeStart.getTime();
}

function addTask(item, boundaries, sections) {
  const dueAt = getDate(item.dueAt);
  if (!dueAt) {
    return;
  }

  const dueTime = dueAt.getTime();
  const briefingItem = makeBriefingItem(item);

  if (dueTime < boundaries.todayStart.getTime()) {
    sections.overdue.push(briefingItem);
  } else if (
    isInRange(dueTime, boundaries.todayStart, boundaries.tomorrowStart)
  ) {
    sections.today.push(briefingItem);
  } else if (
    isInRange(dueTime, boundaries.tomorrowStart, boundaries.upcomingEnd)
  ) {
    sections.upcoming.push(briefingItem);
  }
}

function addReminder(item, boundaries, sections) {
  const reminderAt = getDate(item.reminderAt);
  if (!reminderAt) {
    return;
  }

  const reminderTime = reminderAt.getTime();
  const briefingItem = makeBriefingItem(item);

  if (
    isInRange(reminderTime, boundaries.todayStart, boundaries.tomorrowStart)
  ) {
    sections.today.push(briefingItem);
  } else if (
    isInRange(reminderTime, boundaries.tomorrowStart, boundaries.upcomingEnd)
  ) {
    sections.upcoming.push(briefingItem);
  }
}

function addEventOccurrence(
  item,
  start,
  end,
  timeZone,
  boundaries,
  sections,
  isRecurring = false,
) {
  const briefingItem = makeBriefingItem(item, {
    key: isRecurring
      ? `${item.id}:${start.toISOString()}`
      : String(item.id),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    timeZone,
  });

  if (
    eventOverlapsRange(
      start,
      end,
      boundaries.todayStart,
      boundaries.tomorrowStart,
    )
  ) {
    sections.today.push(briefingItem);
  } else if (
    eventOverlapsRange(
      start,
      end,
      boundaries.tomorrowStart,
      boundaries.upcomingEnd,
    )
  ) {
    sections.upcoming.push(briefingItem);
  }
}

function addEvent(item, boundaries, timeZone, sections) {
  if (item.recurrenceRule) {
    const occurrences = expandRecurringEvent(item, boundaries, timeZone);
    if (occurrences) {
      for (const occurrence of occurrences) {
        addEventOccurrence(
          item,
          occurrence.start,
          occurrence.end,
          occurrence.timeZone,
          boundaries,
          sections,
          true,
        );
      }
      return;
    }
  }

  const startAt = getDate(item.startAt);
  if (!startAt) {
    return;
  }

  const endAt = getDate(item.endAt) || startAt;
  addEventOccurrence(
    item,
    startAt,
    endAt,
    getItemTimeZone(item, timeZone),
    boundaries,
    sections,
  );
}

function buildDailyBriefingSchedule(scheduleItems, options = {}) {
  if (!Array.isArray(scheduleItems)) {
    throw createInputError('scheduleItems must be an array.');
  }

  const timeZone = cleanTimeZone(options.timeZone);
  const currentTime = cleanCurrentTime(options.currentTime);
  const boundaries = getDayBoundaries(currentTime, timeZone);
  const sections = {
    overdue: [],
    today: [],
    upcoming: [],
  };

  for (const item of scheduleItems) {
    if (!item || HIDDEN_STATUSES.includes(item.status)) {
      continue;
    }

    if (item.itemType === 'task') {
      addTask(item, boundaries, sections);
    } else if (item.itemType === 'event') {
      addEvent(item, boundaries, timeZone, sections);
    } else if (item.itemType === 'reminder') {
      addReminder(item, boundaries, sections);
    }
  }

  for (const section of Object.values(sections)) {
    section.sort(sortBriefingItems);
  }

  return {
    date: boundaries.date,
    timeZone,
    counts: {
      overdue: sections.overdue.length,
      today: sections.today.length,
      upcoming: sections.upcoming.length,
    },
    sections,
  };
}

module.exports = {
  MAX_BRIEFING_OCCURRENCES,
  UPCOMING_DAYS,
  buildDailyBriefingSchedule,
};
