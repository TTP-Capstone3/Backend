// db/seed.js — reset the tables and fill them with sample data.  Run: npm run seed
// Gives you (and your teammates) the same predictable rows to build against.

require('dotenv').config(); // seed.js runs standalone (not through app.js), so load .env here too
const { db, User, Category, ScheduleItem } = require('../models');

const seed = async () => {
  try {
    // force: true DROPS every table and recreates it empty.
    // Perfect for a seed script — never do this to real user data.
    await db.sync({ force: true });
    console.log('🌱 Database reset.');

    // Fake users since real ones normally come from Auth0 logins.
    const [ada, alan] = await User.bulkCreate([
      { auth0Id: 'auth0|seed-ada', username: 'ada', email: 'ada@example.com', name: 'Ada Lovelace' },
      { auth0Id: 'auth0|seed-alan', username: 'alan', email: 'alan@example.com', name: 'Alan Turing' },
    ]);
    console.log('🌱 Sample users created.');

    // Every category belongs to one user.
    const [work, school, personal] = await Category.bulkCreate([
      { name: 'Work', userId: ada.id },
      { name: 'School', userId: ada.id },
      { name: 'Personal', userId: alan.id },
    ]);
    console.log('🌱 Sample categories created.');

    // A spread of the different itemTypes so every screen has something to show.
    await ScheduleItem.bulkCreate([
      {
        title: 'Finish capstone PRD',
        description: 'Write up the problem statement and core features.',
        itemType: 'task',
        dueAt: new Date('2026-08-05T23:59:00'),
        priority: 'high',
        estimatedMinutes: 60,
        status: 'completed',
        completedAt: new Date('2026-08-05T18:00:00'),
        userId: ada.id,
        categoryId: work.id,
      },
      {
        title: 'Team standup',
        description: 'Daily sync with the group.',
        itemType: 'event',
        startAt: new Date('2026-08-06T10:00:00'),
        endAt: new Date('2026-08-06T10:15:00'),
        priority: 'medium',
        status: 'active',
        userId: ada.id,
        categoryId: work.id,
      },
      {
        title: 'Study for algorithms exam',
        itemType: 'task',
        dueAt: new Date('2026-08-10T23:59:00'),
        priority: 'very high',
        estimatedMinutes: 120,
        status: 'active',
        userId: ada.id,
        categoryId: school.id,
      },
      {
        title: 'Pay electricity bill',
        itemType: 'reminder',
        reminderAt: new Date('2026-08-07T09:00:00'),
        priority: 'medium',
        status: 'active',
        userId: alan.id,
        categoryId: personal.id,
      },
      {
        title: 'Ideas for the demo pitch',
        description: 'Problem / solution / technical highlight — jot down phrasing here.',
        itemType: 'note',
        priority: 'none',
        status: 'active',
        userId: alan.id,
        categoryId: personal.id,
      },
    ]);
    console.log('🌱 Sample schedule items created.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await db.close(); // close the connection so the script can exit
    console.log('🌱 Done. Connection closed.');
  }
};

seed();
