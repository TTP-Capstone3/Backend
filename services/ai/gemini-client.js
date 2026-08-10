const { GoogleGenAI } = require('@google/genai');
const { getAiConfig } = require('./ai-config');

const cleanPrompt = (prompt) => {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('A non-empty prompt is required.');
  }

  return prompt.trim();
};

const createInvalidResponseError = (message) => {
  const error = new Error(message);
  error.code = 'GEMINI_INVALID_RESPONSE';
  return error;
};

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
  const input = cleanPrompt(prompt);
  const { client, model } = createGeminiClient(env);
  const interaction = await client.interactions.create({
    model,
    input,
    store: false,
  });

  return (interaction.output_text || '').trim();
};

// Ask Gemini for JSON here. The proposal service still validates it.
const sendStructuredPrompt = async (
  prompt,
  responseSchema,
  env = process.env,
  clientFactory = createGeminiClient,
) => {
  const input = cleanPrompt(prompt);

  if (
    !responseSchema ||
    typeof responseSchema !== 'object' ||
    Array.isArray(responseSchema)
  ) {
    throw new Error('A response schema is required.');
  }

  const { client, model } = clientFactory(env);
  const interaction = await client.interactions.create({
    model,
    input,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: responseSchema,
    },
    store: false,
  });

  const output = (interaction.output_text || '').trim();
  if (!output) {
    throw createInvalidResponseError('Gemini returned an empty response.');
  }

  try {
    return JSON.parse(output);
  } catch {
    throw createInvalidResponseError('Gemini returned invalid JSON.');
  }
};

module.exports = {
  createGeminiClient,
  sendTextPrompt,
  sendStructuredPrompt,
};
