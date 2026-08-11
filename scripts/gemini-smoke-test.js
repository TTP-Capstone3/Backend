require('dotenv').config();

const { sendTextPrompt } = require('../services/ai/gemini-client');

const runSmokeTest = async () => {
  console.log('Sending a synthetic test prompt to Gemini...');

  const reply = await sendTextPrompt(
    'This is a capstone connection test. Reply with: Gemini connection works.',
  );

  if (!reply) {
    throw new Error('Gemini returned an empty response.');
  }

  console.log(`Gemini replied: ${reply}`);
};

runSmokeTest().catch((error) => {
  console.error(`Gemini smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
