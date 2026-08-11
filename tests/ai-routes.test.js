const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Test-only settings needed before the auth code loads.
process.env.LOCAL_DATABASE_URL ||=
  'postgres://test:test@127.0.0.1:5432/capstone_test';
process.env.JWT_SECRET ||= 'test-only-jwt-secret';
process.env.AUTH0_DOMAIN ||= 'example.auth0.com';
process.env.AUTH0_AUDIENCE ||= 'https://example.test/api';

const aiRouter = require('../routes/ai-routes');

const startTestServer = () => {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
};

test('schedule proposal route requires authentication', async (t) => {
  const server = await startTestServer();

  t.after(() => {
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/ai/schedule-proposal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Add a study session tomorrow at 6 PM.',
        timeZone: 'America/New_York',
      }),
    },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: 'Authentication required',
  });
});
