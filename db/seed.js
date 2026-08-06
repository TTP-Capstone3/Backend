require('dotenv').config();
const { db, User, Category, ScheduleItem } = require('../models');

async function seed() {
  try {
    await db.sync({ force: true });
    console.log('🌱 Database reset.');

    const [ada, alan] = await User.bulkCreate([
      { auth0Id: 'auth0|seed-ada', username: 'ada', email: 'ada@example.com', name: 'Ada Lovelace' },
      { auth0Id: 'auth0|seed-alan', username: 'alan', email: 'alan@example.com', name: 'Alan Turing' },
    ]);
    console.log('🌱 Sample users created.');

    const [work, school, personal] = await Category.bulkCreate([
      { name: 'Work', userId: ada.id },
      { name: 'School', userId: ada.id },
      { name: 'Personal', userId: alan.id },
    ]);
    console.log('🌱 Sample categories created.');

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
    await db.close();
    console.log('🌱 Done. Connection closed.');
  }
}

seed();
