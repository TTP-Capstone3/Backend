const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

const getAiConfig = (env = process.env) => {
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  const model = (env.GEMINI_MODEL || '').trim() || DEFAULT_GEMINI_MODEL;

  return {
    apiKey,
    model,
    configured: Boolean(apiKey),
  };
};

const getAiStatus = (env = process.env) => {
  const { model, configured } = getAiConfig(env);

  return {
    provider: 'gemini',
    model,
    configured,
  };
};

module.exports = {
  DEFAULT_GEMINI_MODEL,
  getAiConfig,
  getAiStatus,
};
