// models/index.js — one place to collect all models and their relationships.
// Lets the rest of the app grab them from here: const { Task } = require('./models')

const db = require('../db');
const User = require('./user');
const ScheduleItem = require("./scheduleItem");
const Category = require("./category");

// ---------- associations ----------
// Describe how tables relate here. When you're ready to tie tasks to their
// owner, uncomment these (it adds a userId column to tasks):
//   User.hasMany(Task)     // one user has many tasks
//   Task.belongsTo(User)   // each task belongs to one user (adds a userId column)

// A user can create many categories 
// deleting a user should also delete their created categories.
User.hasMany(Category, {
  foreignKey: "userId",
  onDelete: "CASCADE"
})
Category.belongsTo(User, {
  foreignKey: "userId"
})

// A user can have many schedule items 
User.hasMany(ScheduleItem, {
  foreignKey: "userId",
  onDelete: "CASCADE",
})
ScheduleItem.belongsTo(User, {
  foreignKey: "userId",
})

// A category can be added to many schedule items which makes filtering and sorting easier.
Category.hasMany(ScheduleItem, {
  foreignKey: "categoryId",
  onDelete: "SET NULL"
})
ScheduleItem.belongsTo(Category, {
  foreignKey: "categoryId",
})

module.exports = {
  db, // exported too so seed.js can sync from one place
  User,
  ScheduleItem,
  Category,
};
