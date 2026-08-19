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
// apiVersion defaults to v1, but TTS needs v1beta since it's still a preview feature.
const createGeminiClient = (env = process.env, apiVersion = 'v1') => {
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
    httpOptions: { apiVersion },
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

// Separate from the text model in .env, since audio output needs a TTS model.
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_SAMPLE_RATE = 24000;

// Gemini returns raw 16-bit PCM audio, not a playable file. Wrap it in a
// standard WAV header so the browser can just play it directly.
const pcmToWav = (base64Pcm, sampleRate, channels = 1, bitsPerSample = 16) => {
  const pcmBuffer = Buffer.from(base64Pcm, 'base64');
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]).toString('base64');
};

// Pulls the sample rate out of a mime type like "audio/L16;codec=pcm;rate=24000".
const parseSampleRate = (mimeType) => {
  const match = /rate=(\d+)/.exec(mimeType || '');
  return match ? Number(match[1]) : DEFAULT_SAMPLE_RATE;
};

// Ask Gemini to speak the text out loud instead of answering in text.
const sendSpeechPrompt = async (
  text,
  voiceName,
  env = process.env,
  clientFactory = createGeminiClient,
) => {
  const input = cleanPrompt(text);
  const { client } = clientFactory(env, 'v1beta');

  const interaction = await client.interactions.create({
    model: TTS_MODEL,
    input,
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice: voiceName || 'Kore' }],
    },
    store: false,
  });

  const audio = interaction.output_audio;
  if (!audio?.data) {
    throw createInvalidResponseError('Gemini did not return any audio.');
  }

  const sampleRate = audio.sample_rate || parseSampleRate(audio.mime_type);
  const channels = audio.channels || 1;

  return {
    data: pcmToWav(audio.data, sampleRate, channels),
    mimeType: 'audio/wav',
  };
};

module.exports = {
  createGeminiClient,
  sendTextPrompt,
  sendStructuredPrompt,
  sendSpeechPrompt,
};
