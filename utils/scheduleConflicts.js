// Pure functions for checking schedule conflicts, no DB calls here.

const toDate = (value) => (value instanceof Date ? value : new Date(value));

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// Returns any items that overlap the candidate's start/end time.
const findConflicts = (items, candidate, { excludeId } = {}) => {
  if (!candidate.startAt || !candidate.endAt) return [];
  const start = toDate(candidate.startAt);
  const end = toDate(candidate.endAt);

  return items.filter((item) => {
    if (excludeId && item.id === excludeId) return false;
    if (!item.startAt || !item.endAt) return false;
    return rangesOverlap(start, end, toDate(item.startAt), toDate(item.endAt));
  });
};

// Finds open gaps in a time range that are long enough to fit a new item.
const findFreeSlots = (items, { rangeStart, rangeEnd, durationMinutes }) => {
  const start = toDate(rangeStart);
  const end = toDate(rangeEnd);
  const durationMs = durationMinutes * 60 * 1000;

  const busy = items
    .filter((item) => item.startAt && item.endAt)
    .map((item) => ({ start: toDate(item.startAt), end: toDate(item.endAt) }))
    .filter((item) => item.end > start && item.start < end)
    .sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = start;

  for (const item of busy) {
    if (item.start - cursor >= durationMs) {
      slots.push({ start: cursor, end: item.start });
    }
    if (item.end > cursor) cursor = item.end;
  }

  if (end - cursor >= durationMs) {
    slots.push({ start: cursor, end });
  }

  return slots;
};

module.exports = { findConflicts, findFreeSlots };
