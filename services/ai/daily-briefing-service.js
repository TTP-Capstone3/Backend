const { sendStructuredPrompt } = require('./gemini-client');

const MAX_SUMMARY_LENGTH = 400;
const MAX_HEADLINE_LENGTH = 200;

const SECTION_KEYS = ['overdue', 'today', 'upcoming'];

const SECTION_TITLES = {
  overdue: 'Needs attention',
  today: 'Today',
  upcoming: 'Coming up',
};

// Gemini only writes the wording, so it never needs the other stored fields.
const PROMPT_FIELDS = [
  'title',
  'itemType',
  'startAt',
  'endAt',
  'dueAt',
  'reminderAt',
  'allDay',
  'priority',
];

// Gemini writes a summary and one headline per section. The items themselves
// always come from the grouping, so the model cannot add or change any.
const DAILY_BRIEFING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', enum: SECTION_KEYS },
          headline: { type: 'string' },
        },
        required: ['key', 'headline'],
      },
    },
  },
  required: ['summary', 'sections'],
};

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidResponse(message) {
  throw createError('GEMINI_INVALID_RESPONSE', message);
}

function cleanSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw createError(
      'AI_INVALID_INPUT',
      'A daily briefing schedule is required.',
    );
  }

  const sections = schedule.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    throw createError(
      'AI_INVALID_INPUT',
      'The schedule must include grouped sections.',
    );
  }

  for (const key of SECTION_KEYS) {
    if (!Array.isArray(sections[key])) {
      throw createError(
        'AI_INVALID_INPUT',
        `The ${key} section must be an array.`,
      );
    }
  }

  return schedule;
}

function makePromptItem(item) {
  const promptItem = {};

  for (const field of PROMPT_FIELDS) {
    promptItem[field] = item[field] ?? null;
  }

  return promptItem;
}

function buildPrompt(schedule) {
  const sections = {};

  for (const key of SECTION_KEYS) {
    sections[key] = schedule.sections[key].map(makePromptItem);
  }

  return [
    'Write a short daily briefing for the schedule below.',
    `Date: ${schedule.date}`,
    `User time zone: ${schedule.timeZone}`,
    '',
    'Rules:',
    '- Only describe the items provided.',
    '- Do not invent items, times, free time, or conflicts.',
    '- Keep the summary to one or two sentences.',
    '- Write one short headline for each section that has items.',
    `- Use only these section keys: ${SECTION_KEYS.join(', ')}.`,
    '- Do not claim anything was saved, moved, or changed.',
    '',
    'Schedule:',
    JSON.stringify(sections),
  ].join('\n');
}

function cleanResponseText(value, maxLength, label) {
  if (typeof value !== 'string' || !value.trim()) {
    invalidResponse(`Gemini returned an invalid ${label}.`);
  }

  const text = value.trim();
  if (text.length > maxLength) {
    invalidResponse(`Gemini returned a ${label} that is too long.`);
  }

  return text;
}

function getHeadlines(response) {
  if (!Array.isArray(response.sections)) {
    invalidResponse('Gemini returned invalid briefing sections.');
  }

  const headlines = {};

  for (const section of response.sections) {
    if (!section || typeof section !== 'object') {
      invalidResponse('Gemini returned an invalid briefing section.');
    }

    // Skip keys we did not ask for instead of failing the whole briefing.
    if (
      SECTION_KEYS.includes(section.key) &&
      headlines[section.key] === undefined
    ) {
      headlines[section.key] = cleanResponseText(
        section.headline,
        MAX_HEADLINE_LENGTH,
        'section headline',
      );
    }
  }

  return headlines;
}

function buildBriefing(schedule, summary, headlines) {
  const sections = SECTION_KEYS.filter(
    (key) => schedule.sections[key].length > 0,
  ).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    headline: headlines[key] || null,
    items: schedule.sections[key],
  }));

  return {
    date: schedule.date,
    timeZone: schedule.timeZone,
    counts: {
      overdue: schedule.sections.overdue.length,
      today: schedule.sections.today.length,
      upcoming: schedule.sections.upcoming.length,
    },
    summary,
    sections,
  };
}

function isEmptySchedule(schedule) {
  return SECTION_KEYS.every((key) => schedule.sections[key].length === 0);
}

const createDailyBriefing = async (schedule, options = {}) => {
  const cleanedSchedule = cleanSchedule(schedule);

  // Tests can pass a fake function here instead of calling Gemini.
  const generateStructured = options.generateStructured || sendStructuredPrompt;

  // Nothing to describe, so skip the Gemini call entirely.
  if (isEmptySchedule(cleanedSchedule)) {
    return buildBriefing(
      cleanedSchedule,
      'You have nothing scheduled right now.',
      {},
    );
  }

  const response = await generateStructured(
    buildPrompt(cleanedSchedule),
    DAILY_BRIEFING_SCHEMA,
  );

  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    invalidResponse('Gemini returned an invalid daily briefing.');
  }

  const summary = cleanResponseText(
    response.summary,
    MAX_SUMMARY_LENGTH,
    'summary',
  );

  return buildBriefing(cleanedSchedule, summary, getHeadlines(response));
};

module.exports = {
  MAX_SUMMARY_LENGTH,
  MAX_HEADLINE_LENGTH,
  SECTION_KEYS,
  DAILY_BRIEFING_SCHEMA,
  createDailyBriefing,
};
