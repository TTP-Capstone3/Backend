const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_CONTEXT_MESSAGES,
  buildConversationContext,
} = require('../services/ai/conversation-context');

test('returns empty context when there are no messages', () => {
  assert.equal(buildConversationContext([]), '');
  assert.equal(buildConversationContext(null), '');
});

test('formats user messages and AI clarifications in order', () => {
  const context = buildConversationContext([
    {
      sender: 'user',
      text: '  Add soccer practice tomorrow  ',
    },
    {
      sender: 'ai',
      text: '',
      items: [
        {
          kind: 'clarification',
          question: 'What time is soccer practice?',
        },
      ],
    },
    {
      sender: 'user',
      text: '4 PM to 9 PM',
    },
  ]);

  assert.equal(
    context,
    [
      'User: Add soccer practice tomorrow',
      'Assistant: What time is soccer practice?',
      'User: 4 PM to 9 PM',
    ].join('\n'),
  );
});

test('includes useful proposal details', () => {
  const context = buildConversationContext([
    {
      sender: 'ai',
      text: 'Review this item:',
      items: [
        {
          kind: 'proposal',
          proposal: {
            title: 'Soccer practice',
            startAt: '2026-08-16T20:00:00.000Z',
            endAt: '2026-08-17T01:00:00.000Z',
          },
        },
      ],
    },
  ]);

  assert.equal(
    context,
    'Assistant: Review this item: | Proposal: Title: Soccer practice, Starts: 2026-08-16T20:00:00.000Z, Ends: 2026-08-17T01:00:00.000Z',
  );
});

test('uses only the most recent messages', () => {
  const messages = Array.from(
    { length: MAX_CONTEXT_MESSAGES + 2 },
    (_, index) => ({
      sender: 'user',
      text: `Message ${index + 1}`,
    }),
  );

  const context = buildConversationContext(messages);
  const lines = context.split('\n');

  assert.equal(lines.length, MAX_CONTEXT_MESSAGES);
  assert.equal(lines[0], 'User: Message 3');
  assert.equal(lines.at(-1), 'User: Message 12');
});

test('does not include private or unnecessary fields', () => {
  const messages = [
    {
      id: 'message-1',
      conversationId: 'conversation-1',
      createdAt: '2026-08-15T04:00:00.000Z',
      sender: 'ai',
      text: '',
      items: [
        {
          kind: 'proposal',
          isSaved: true,
          proposal: {
            title: 'Study session',
            description: 'Private description',
            location: 'Private room',
            userId: 'user-1',
          },
        },
      ],
    },
  ];
  const originalMessages = structuredClone(messages);

  const context = buildConversationContext(messages);

  assert.equal(context, 'Assistant: Proposal: Title: Study session');
  assert.equal(context.includes('message-1'), false);
  assert.equal(context.includes('conversation-1'), false);
  assert.equal(context.includes('user-1'), false);
  assert.equal(context.includes('Private'), false);
  assert.deepEqual(messages, originalMessages);
});

test('skips invalid messages and items', () => {
  const context = buildConversationContext([
    null,
    { sender: 'helper', text: 'Ignore this' },
    { sender: 'ai', text: '', items: [{ kind: 'unknown' }] },
    { sender: 'user', text: 'Keep this message' },
  ]);

  assert.equal(context, 'User: Keep this message');
});
