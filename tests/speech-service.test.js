const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_SPEECH_TEXT_LENGTH,
  createSpeech,
} = require('../services/ai/speech-service');

test('sends the trimmed text to the speech generator and returns the result', async () => {
  let receivedText;
  let receivedVoice;

  const result = await createSpeech('  Hello there  ', {
    voiceName: 'Kore',
    generateSpeech: async (text, voiceName) => {
      receivedText = text;
      receivedVoice = voiceName;
      return { data: 'ZmFrZS1hdWRpbw==', mimeType: 'audio/wav' };
    },
  });

  assert.equal(receivedText, 'Hello there');
  assert.equal(receivedVoice, 'Kore');
  assert.deepEqual(result, { data: 'ZmFrZS1hdWRpbw==', mimeType: 'audio/wav' });
});

test('rejects an empty message', async () => {
  await assert.rejects(
    createSpeech('   ', { generateSpeech: async () => ({}) }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
});

test('rejects text that is too long', async () => {
  const tooLong = 'a'.repeat(MAX_SPEECH_TEXT_LENGTH + 1);

  await assert.rejects(
    createSpeech(tooLong, { generateSpeech: async () => ({}) }),
    (error) => error.code === 'AI_INVALID_INPUT',
  );
});
