function findConflicts(items, candidate, excludeId) {
  if (!candidate.startAt || !candidate.endAt) return [];

  const start = new Date(candidate.startAt);
  const end = new Date(candidate.endAt);

  return items.filter((item) => {
    if (excludeId && item.id === excludeId) return false;
    if (!item.startAt || !item.endAt) return false;

    const itemStart = new Date(item.startAt);
    const itemEnd = new Date(item.endAt);

    return start < itemEnd && itemStart < end;
  });
}

function findFreeSlots(items, rangeStart, rangeEnd, durationMinutes) {
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const durationMs = durationMinutes * 60 * 1000;

  const busy = items
    .filter((item) => item.startAt && item.endAt)
    .map((item) => ({ start: new Date(item.startAt), end: new Date(item.endAt) }))
    .filter((item) => item.end > start && item.start < end)
    .sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = start;

  for (const item of busy) {
    if (item.start - cursor >= durationMs) {
      slots.push({ start: cursor, end: item.start });
    }
    if (item.end > cursor) {
      cursor = item.end;
    }
  }

  if (end - cursor >= durationMs) {
    slots.push({ start: cursor, end: end });
  }

  return slots;
}

module.exports = { findConflicts, findFreeSlots };
