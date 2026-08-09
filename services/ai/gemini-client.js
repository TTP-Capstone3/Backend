const { GoogleGenAI } = require('@google/genai');
const { getAiConfig } = require('./ai-config');

// Only create the client when Gemini is used so the backend can start without a key.
const createGeminiClient = (env = process.env) => {
  const config = getAiConfig(env);

  if (!config.configured) {
    const error = new Error(
      'GEMINI_API_KEY is missing. Add it to your local .env file.',
    );
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }

  const client = new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: { apiVersion: 'v1' },
  });

  return { client, model: config.model };
};

// This is only used by the smoke test.
const sendTextPrompt = async (prompt, env = process.env) => {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('A non-empty prompt is required.');
  }

  const { client, model } = createGeminiClient(env);
  const interaction = await client.interactions.create({
    model,
    input: prompt.trim(),
    store: false,
  });

  return (interaction.output_text || '').trim();
};

module.exports = {
  createGeminiClient,
  sendTextPrompt,
};
