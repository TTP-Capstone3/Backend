const { sendSpeechPrompt } = require('./gemini-client');

const MAX_SPEECH_TEXT_LENGTH = 2000;

const createError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const cleanText = (text) => {
  if (typeof text !== 'string' || !text.trim()) {
    throw createError('AI_INVALID_INPUT', 'A non-empty text is required.');
  }

  const cleanedText = text.trim();
  if (cleanedText.length > MAX_SPEECH_TEXT_LENGTH) {
    throw createError(
      'AI_INVALID_INPUT',
      `Text must be ${MAX_SPEECH_TEXT_LENGTH} characters or fewer.`,
    );
  }

  return cleanedText;
};

const createSpeech = async (text, options = {}) => {
  const cleanedText = cleanText(text);

  // Tests can pass a fake function here instead of calling Gemini.
  const generateSpeech = options.generateSpeech || sendSpeechPrompt;

  return generateSpeech(cleanedText, options.voiceName);
};

module.exports = {
  MAX_SPEECH_TEXT_LENGTH,
  createSpeech,
};
