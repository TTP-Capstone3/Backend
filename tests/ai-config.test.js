const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_GEMINI_MODEL,
  getAiConfig,
  getAiStatus,
} = require('../services/ai/ai-config');
const { createGeminiClient } = require('../services/ai/gemini-client');

test('AI config uses the default model when environment values are empty', () => {
  const config = getAiConfig({});

  assert.deepEqual(config, {
    apiKey: '',
    model: DEFAULT_GEMINI_MODEL,
    configured: false,
  });
});

test('AI config reads and trims Gemini environment values', () => {
  const config = getAiConfig({
    GEMINI_API_KEY: '  test-key  ',
    GEMINI_MODEL: '  test-model  ',
  });

  assert.deepEqual(config, {
    apiKey: 'test-key',
    model: 'test-model',
    configured: true,
  });
});

test('AI status never exposes the API key', () => {
  const status = getAiStatus({ GEMINI_API_KEY: 'secret-key' });

  assert.deepEqual(status, {
    provider: 'gemini',
    model: DEFAULT_GEMINI_MODEL,
    configured: true,
  });
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
});

test('Gemini client gives a clear error when the key is missing', () => {
  assert.throws(
    () => createGeminiClient({}),
    (error) =>
      error.code === 'GEMINI_NOT_CONFIGURED' &&
      error.message.includes('GEMINI_API_KEY'),
  );
});
