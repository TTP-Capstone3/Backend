// This file exports a simple middleware function to validate the creation of a scheduleItem.

const VALID_ITEM_TYPES = [
    'task',
    'event',
    'reminder',
    'note',
];

const VALID_PRIORITIES = [
    'none',
    'very low',
    'low',
    'medium',
    'high',
    'very high',
];

const VALID_STATUSES = [
    'active',
    'completed',
    'archived',
];

const VALID_SOURCES = [
    'manual',
    'ai',
    'ics-import',
];

function isValidDate(value) {
    return value == null || !Number.isNaN(new Date(value).getTime());
}

function validateScheduleItem(data) {
    const errors = [];

    // Title can't be missing
    if (!data.title?.trim()) {
        errors.push('Title is required.');
    }

    // Item type can't be missing
    if (!VALID_ITEM_TYPES.includes(data.itemType)) {
        errors.push('A valid itemType is required.');
    }

    // Priority can't be invalid
    if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
        errors.push('Priority is invalid.');
    }

    // Status can't be invalid
    if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
        errors.push('Status is invalid.');
    }

    // Source can't be invalid
    if (data.source !== undefined && !VALID_SOURCES.includes(data.source)) {
        errors.push('Source is invalid.');
    }

    // All fields from scheduleItem that are Date values.
    const dateFields = [
        'startAt',
        'endAt',
        'dueAt',
        'reminderAt',
        'completedAt',
    ];

    // Loop through each and check if they are valid dates.
    for (const field of dateFields) {
        if (!isValidDate(data[field])) {
            errors.push(`${field} must be a valid date.`);
        }
    }

    if (data.itemType === 'event') {
        if (!data.startAt) {
            errors.push('Events require a start date and time.');
        }

        if (!data.endAt) {
            errors.push('Events require an end date and time.');
        }
    }

    if (data.itemType === 'reminder' && !data.reminderAt) {
        errors.push('Reminders require a reminder date and time.');
    }

    // End dates cannot be before their start dates.
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
        errors.push('endAt must occur after startAt.');
    }

    if (data.estimatedMinutes !== undefined && data.estimatedMinutes !== null && (!Number.isInteger(data.estimatedMinutes) || data.estimatedMinutes < 1)) {
        errors.push('estimatedMinutes must be a positive integer.');
    }

    return errors;
}

module.exports = validateScheduleItem;