const test = require('node:test');
const assert = require('node:assert/strict');

const { findConflicts, findFreeSlots } = require('../utils/scheduleConflicts');

test('finds an item that overlaps the candidate time', () => {
  const items = [
    { id: 1, status: 'active', startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' },
  ];
  const candidate = { startAt: '2026-08-17T14:30:00Z', endAt: '2026-08-17T15:30:00Z' };

  const conflicts = findConflicts(items, candidate);

  assert.equal(conflicts.length, 1);
});

test('ignores items that do not overlap', () => {
  const items = [
    { id: 1, status: 'active', startAt: '2026-08-17T09:00:00Z', endAt: '2026-08-17T10:00:00Z' },
  ];
  const candidate = { startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' };

  assert.deepEqual(findConflicts(items, candidate), []);
});

test('ignores cancelled, completed, and archived items', () => {
  const candidate = { startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' };
  const items = [
    { id: 1, status: 'cancelled', startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' },
    { id: 2, status: 'completed', startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' },
    { id: 3, status: 'archived', startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' },
  ];

  assert.deepEqual(findConflicts(items, candidate), []);
});

test('excludes the item itself when editing', () => {
  const candidate = { id: 5, startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' };
  const items = [
    { id: 5, status: 'active', startAt: '2026-08-17T14:00:00Z', endAt: '2026-08-17T15:00:00Z' },
  ];

  assert.deepEqual(findConflicts(items, candidate, candidate.id), []);
});

test('finds an open gap between two busy items', () => {
  const items = [
    { status: 'active', startAt: '2026-08-17T09:00:00Z', endAt: '2026-08-17T10:00:00Z' },
    { status: 'active', startAt: '2026-08-17T11:00:00Z', endAt: '2026-08-17T12:00:00Z' },
  ];

  const slots = findFreeSlots(items, '2026-08-17T09:00:00Z', '2026-08-17T12:00:00Z', 30);

  assert.equal(slots.length, 1);
  assert.equal(slots[0].start.toISOString(), '2026-08-17T10:00:00.000Z');
  assert.equal(slots[0].end.toISOString(), '2026-08-17T11:00:00.000Z');
});

test('offers a cancelled item time slot as free', () => {
  const items = [
    { status: 'cancelled', startAt: '2026-08-17T09:00:00Z', endAt: '2026-08-17T10:00:00Z' },
  ];

  const slots = findFreeSlots(items, '2026-08-17T09:00:00Z', '2026-08-17T10:00:00Z', 30);

  assert.equal(slots.length, 1);
});

test('finds no slots when there is no gap long enough', () => {
  const items = [
    { status: 'active', startAt: '2026-08-17T09:00:00Z', endAt: '2026-08-17T11:45:00Z' },
  ];

  const slots = findFreeSlots(items, '2026-08-17T09:00:00Z', '2026-08-17T12:00:00Z', 30);

  assert.deepEqual(slots, []);
});
