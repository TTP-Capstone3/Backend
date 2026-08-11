const test = require('node:test');
const assert = require('node:assert/strict');

const { sendStructuredPrompt } = require('../services/ai/gemini-client');

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
  required: ['message'],
};

const makeClientFactory = (outputText, requestHolder) => {
  return () => ({
    model: 'test-model',
    client: {
      interactions: {
        create: async (request) => {
          requestHolder.request = request;
          return { output_text: outputText };
        },
      },
    },
  });
};

test('structured prompt sends a JSON schema and parses the response', async () => {
  const requestHolder = {};
  const result = await sendStructuredPrompt(
    '  Return a test message.  ',
    TEST_SCHEMA,
    {},
    makeClientFactory('{"message":"It works"}', requestHolder),
  );

  assert.deepEqual(result, { message: 'It works' });
  assert.deepEqual(requestHolder.request, {
    model: 'test-model',
    input: 'Return a test message.',
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: TEST_SCHEMA,
    },
    store: false,
  });
});

test('structured prompt rejects an empty Gemini response', async () => {
  await assert.rejects(
    () =>
      sendStructuredPrompt(
        'Return JSON.',
        TEST_SCHEMA,
        {},
        makeClientFactory('   ', {}),
      ),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});

test('structured prompt rejects invalid JSON from Gemini', async () => {
  await assert.rejects(
    () =>
      sendStructuredPrompt(
        'Return JSON.',
        TEST_SCHEMA,
        {},
        makeClientFactory('not-json', {}),
      ),
    (error) => error.code === 'GEMINI_INVALID_RESPONSE',
  );
});
