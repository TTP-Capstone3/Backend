const { DataTypes } = require("sequelize")
const db = require('../db')

// A scheduleItem represents anything a user places on their calendar.
// The itemType field deteremines whether it behaves as a task, event, reminder, or note.
const ScheduleItem = db.define("scheduleItem", {
    // Short name displayed in calendar, list, and detail views.
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true, // Prevent titles containing only an empty string.
        },
    },

    // Optional summary explanation or additional information about the item.
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },

    // Determines how the application should display and validate the item.
    //
    // task: An that may have a deadline or scheduled work time.
    // event: Something occurring between a start and end time.
    // reminder: A notification or prompt that occurs at a specific time.
    // note: Information that may not need any scheduling fields.
    itemType: {
        type: DataTypes.ENUM("task", "event", "reminder", "note"),
        allowNull: false,
    },

    // Date and time when a scheduled item begins.
    startAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    // Date and time when a scheduled item ends.
    endAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    // Deadline for completing a task.
    // This is separate from startAt because a task can be due at one time while being scheduled to work on at another time.
    dueAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    // Date and time when the user should be reminded about an item.
    reminderAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    // Indicates whether or not the item applies to the entire day on the calendar.
    // (Calendar apps have this option so we should include it just incase.)
    allDay: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },

    // IANA timezone used to interpret and display an item's date values.
    // Storing the timezone is useful for imported calendar events and users who travel between timezones.
    timeZone: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "America/New_York", // This should be changed sometime later.
    },

    // User-selected importance level.
    priority: {
        type: DataTypes.ENUM("none", "very low", "low", "medium", "high", "very high"),
        allowNull: false,
        defaultValue: "none",
    },

    // Optional estimate of how long the item should take, stored in minutes.
    // This can later help the AI suggest available time slots.
    estimatedMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
            min: 1,
        },
    },

    // Optional physical or virtual location, such as a room or Zoom link.
    location: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    // Current state of the item.
    //
    // active: Currently relevant and visible.
    // completed: Marked as complete by the user (mainly for tasks)
    // archived: Hidden from normal views but not deleted permanantly.
    status: {
        type: DataTypes.ENUM("active", "completed", "archived", "cancelled"),
        allowNull: false,
        defaultValue: "active",
    },

    // The Date and time the item was completed.
    // Should be set when a status changes to "completed" and cleared if the item is later marked active.
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    // This describes how the item was originally created.
    //
    // manual: Created through the regular form provided by the app.
    // ai: Created by the AI-generated proposal after user confirmation.
    // ics-import: Imported from an external .ics calendar file (Important for extra fields below)
    source: {
        type: DataTypes.ENUM("manual", "ai", "ics-import"),
        allowNull: false,
        defaultValue: "manual",
    },

    // Stores the UID from an imported ICS calendar item.
    // This can be used to detect duplicate imports of the same event.
    externalUid: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    // Stores an ICS-compatiable recurrence rule for repeating items. 
    // Example: "FREQ=WEEKLY;BYDAY=MO,WE"
    // This field prepares the schema for recurrence if the calendars provide it.
    recurrenceRule: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
});

module.exports = ScheduleItem