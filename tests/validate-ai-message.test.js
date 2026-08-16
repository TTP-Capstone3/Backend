const test = require('node:test');
const assert = require('node:assert/strict');

const validateAiMessage = require('../middleware/validateAiMessage');
const {
  MAX_AI_MESSAGE_LENGTH,
  MAX_AI_MESSAGE_ITEMS,
} = require('../middleware/validateAiMessage');

test('accepts a user message', () => {
  const errors = validateAiMessage({
    sender: 'user',
    text: 'Add soccer practice tomorrow',
  });

  assert.deepEqual(errors, []);
});

test('accepts an AI clarification', () => {
  const errors = validateAiMessage({
    sender: 'ai',
    text: '',
    items: [
      {
        kind: 'clarification',
        question: 'What time is soccer practice?',
      },
    ],
  });

  assert.deepEqual(errors, []);
});

test('accepts an AI proposal', () => {
  const errors = validateAiMessage({
    sender: 'ai',
    text: 'Review this item:',
    items: [
      {
        kind: 'proposal',
        proposal: { title: 'Soccer practice' },
        isSaved: false,
      },
    ],
  });

  assert.deepEqual(errors, []);
});

test('requires message data to be an object', () => {
  assert.deepEqual(validateAiMessage(null), [
    'Message data must be an object.',
  ]);
  assert.deepEqual(validateAiMessage([]), [
    'Message data must be an object.',
  ]);
});

test('checks the sender, text, and items types', () => {
  const errors = validateAiMessage({
    sender: 'helper',
    text: 10,
    items: 'not an array',
  });

  assert.equal(errors.includes('Sender must be user or ai.'), true);
  assert.equal(errors.includes('Text must be a string.'), true);
  assert.equal(errors.includes('Items must be an array.'), true);

  const nullItemsErrors = validateAiMessage({
    sender: 'ai',
    text: 'Hello',
    items: null,
  });

  assert.equal(nullItemsErrors.includes('Items must be an array.'), true);
});

test('requires text or an AI item', () => {
  const errors = validateAiMessage({
    sender: 'ai',
    text: '   ',
    items: [],
  });

  assert.equal(errors.includes('A message must include text or an item.'), true);
});

test('does not allow AI items in a user message', () => {
  const errors = validateAiMessage({
    sender: 'user',
    text: 'Add a meeting',
    items: [{ kind: 'proposal', proposal: { title: 'Meeting' } }],
  });

  assert.equal(errors.includes('User messages cannot include AI items.'), true);
});

test('limits message text and AI items', () => {
  const errors = validateAiMessage({
    sender: 'ai',
    text: 'a'.repeat(MAX_AI_MESSAGE_LENGTH + 1),
    items: Array.from(
      { length: MAX_AI_MESSAGE_ITEMS + 1 },
      () => ({ kind: 'proposal', proposal: { title: 'Meeting' } }),
    ),
  });

  assert.equal(
    errors.includes(`Text must be ${MAX_AI_MESSAGE_LENGTH} characters or fewer.`),
    true,
  );
  assert.equal(
    errors.includes(
      `A message can have no more than ${MAX_AI_MESSAGE_ITEMS} items.`,
    ),
    true,
  );
});

test('checks clarification and proposal items', () => {
  const errors = validateAiMessage({
    sender: 'ai',
    text: 'Please review these items.',
    items: [
      null,
      { kind: 'unknown' },
      { kind: 'clarification', question: '   ' },
      { kind: 'proposal', proposal: null },
      {
        kind: 'proposal',
        proposal: { title: 'Meeting' },
        isSaved: 'yes',
      },
    ],
  });

  assert.equal(errors.includes('Item 1 must be an object.'), true);
  assert.equal(errors.includes('Item 2 must have a valid kind.'), true);
  assert.equal(errors.includes('Item 3 must include a question.'), true);
  assert.equal(errors.includes('Item 4 must include a proposal.'), true);
  assert.equal(errors.includes('Item 5 isSaved must be true or false.'), true);
});
