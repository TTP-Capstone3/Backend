const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');

process.env.LOCAL_DATABASE_URL ||=
  'postgres://test:test@127.0.0.1:5432/capstone_test';
process.env.JWT_SECRET ||= 'test-only-jwt-secret';
process.env.AUTH0_DOMAIN ||= 'example.auth0.com';
process.env.AUTH0_AUDIENCE ||= 'https://example.test/api';

const { User, ScheduleItem } = require('../models');
const { signToken } = require('../middleware/auth');
const dailyBriefingService = require('../services/ai/daily-briefing-service');

const originalCreateDailyBriefing = dailyBriefingService.createDailyBriefing;
let createDailyBriefing = originalCreateDailyBriefing;

dailyBriefingService.createDailyBriefing = (...args) =>
  createDailyBriefing(...args);

const aiPlanningRouter = require('../routes/ai-planning-routes');

const originalMethods = {
  findUser: User.findByPk,
  findScheduleItems: ScheduleItem.findAll,
};

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/ai', aiPlanningRouter);

  server = await new Promise((resolve) => {
    const testServer = app.listen(0, '127.0.0.1', () => resolve(testServer));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  User.findByPk = originalMethods.findUser;
  ScheduleItem.findAll = originalMethods.findScheduleItems;
  dailyBriefingService.createDailyBriefing = originalCreateDailyBriefing;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

const authHeaders = () => {
  const token = signToken({ id: 'user-1', username: 'Angel' });

  return {
    'Content-Type': 'application/json',
    Cookie: `token=${token}`,
  };
};

test('daily briefing route requires authentication', async () => {
  const response = await fetch(`${baseUrl}/ai/daily-briefing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeZone: 'America/New_York' }),
  });

  assert.equal(response.status, 401);
});

test('rejects a request without a valid time zone', async () => {
  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  ScheduleItem.findAll = async () => [];

  const response = await fetch(`${baseUrl}/ai/daily-briefing`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ timeZone: 'New_York' }),
  });

  assert.equal(response.status, 400);

  const body = await response.json();
  assert.match(body.error, /valid IANA timeZone/);
});

test('returns a briefing for the current user schedule', async () => {
  let scheduleQuery;
  let briefingSchedule;

  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  ScheduleItem.findAll = async (options) => {
    scheduleQuery = options;
    return [
      {
        id: 1,
        title: 'Turn in lab report',
        itemType: 'task',
        status: 'active',
        dueAt: '2026-08-16T15:00:00.000Z',
      },
    ];
  };
  createDailyBriefing = async (schedule) => {
    briefingSchedule = schedule;
    return {
      date: schedule.date,
      timeZone: schedule.timeZone,
      counts: schedule.counts,
      summary: 'You have one overdue task.',
      sections: [],
    };
  };

  const response = await fetch(`${baseUrl}/ai/daily-briefing`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ timeZone: 'America/New_York' }),
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.summary, 'You have one overdue task.');
  assert.equal(body.timeZone, 'America/New_York');

  // Only the signed-in user's items are read, and they reach the grouping.
  assert.deepEqual(scheduleQuery.where, { userId: 'user-1' });
  assert.equal(briefingSchedule.sections.overdue.length, 1);
  assert.equal(briefingSchedule.sections.overdue[0].title, 'Turn in lab report');
});

test('reports when Gemini is not configured', async () => {
  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  ScheduleItem.findAll = async () => [];
  createDailyBriefing = async () => {
    const error = new Error('GEMINI_API_KEY is missing.');
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  };

  const response = await fetch(`${baseUrl}/ai/daily-briefing`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ timeZone: 'America/New_York' }),
  });

  assert.equal(response.status, 503);

  const body = await response.json();
  assert.match(body.error, /not configured/);
});

test('hides provider errors behind a generic message', async () => {
  User.findByPk = async () => ({ id: 'user-1', username: 'Angel' });
  ScheduleItem.findAll = async () => [];
  createDailyBriefing = async () => {
    throw new Error('gemini api key sk-secret-value rejected');
  };

  const response = await fetch(`${baseUrl}/ai/daily-briefing`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ timeZone: 'America/New_York' }),
  });

  assert.equal(response.status, 502);

  const body = await response.json();
  assert.equal(body.error, 'The AI service could not create a daily briefing.');
  assert.equal(body.error.includes('sk-secret-value'), false);
});
