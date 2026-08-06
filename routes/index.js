// routes/index.js — one place to collect all routers.
// Lets app.js grab them from here: const { authRouter } = require('./routes')

const authRouter = require('./auth-routes');
const scheduleItemRouter = require('./scheduleItem-routes');
const categoryRouter = require('./category-routes');
const calendarRouter = require('./calendar-routes');

module.exports = {
  authRouter,
  scheduleItemRouter,
  categoryRouter,
  calendarRouter,
};
