const validateScheduleItem = require('../../middleware/validateScheduleItem');
const { sendStructuredPrompt } = require('./gemini-client');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_SHORT_TEXT_LENGTH = 255;
const MAX_PROPOSAL_ITEMS = 10;

const MISSING_FIELDS = [
  'title',
  'itemType',
  'startAt',
  'endAt',
  'dueAt',
  'reminderAt',
  'timeZone',
  'estimatedMinutes',
  'location',
];

const PROPOSAL_FIELDS = [
  'title',
  'description',
  'itemType',
  'startAt',
  'endAt',
  'dueAt',
  'reminderAt',
  'allDay',
  'priority',
  'estimatedMinutes',
  'location',
];

const PROPOSAL_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    itemType: {
      type: 'string',
      enum: ['task', 'event', 'reminder', 'note'],
    },
    startAt: { type: ['string', 'null'], format: 'date-time' },
    endAt: { type: ['string', 'null'], format: 'date-time' },
    dueAt: { type: ['string', 'null'], format: 'date-time' },
    reminderAt: { type: ['string', 'null'], format: 'date-time' },
    allDay: { type: 'boolean' },
    priority: {
      type: 'string',
      enum: ['none', 'very low', 'low', 'medium', 'high', 'very high'],
    },
    estimatedMinutes: { type: ['integer', 'null'], minimum: 1 },
    location: { type: ['string', 'null'] },
  },
  required: PROPOSAL_FIELDS,
};

const ITEM_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      enum: ['proposal', 'clarification'],
    },
    proposal: PROPOSAL_SCHEMA,
    missingFields: {
      type: 'array',
      items: {
        type: 'string',
        enum: MISSING_FIELDS,
      },
    },
    question: {
      type: ['string', 'null'],
    },
  },
  required: ['kind', 'proposal', 'missingFields', 'question'],
};

// Shape we expect back from Gemini.
const SCHEDULE_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description: 'A short, friendly response to the user.',
    },
    items: {
      type: 'array',
      items: ITEM_RESULT_SCHEMA,
    },
  },
  required: ['reply', 'items'],
};

const createError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const cleanMessage = (message) => {
  if (typeof message !== 'string' || !message.trim()) {
    throw createError('AI_INVALID_INPUT', 'A non-empty message is required.');
  }

  const cleanedMessage = message.trim();
  if (cleanedMessage.length > MAX_MESSAGE_LENGTH) {
    throw createError(
      'AI_INVALID_INPUT',
      `The message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    );
  }

  return cleanedMessage;
};

const cleanTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    throw createError('AI_INVALID_INPUT', 'A timeZone is required.');
  }

  const cleanedTimeZone = timeZone.trim();

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: cleanedTimeZone }).format();
  } catch {
    throw createError('AI_INVALID_INPUT', 'A valid IANA timeZone is required.');
  }

  return cleanedTimeZone;
};

const cleanCurrentTime = (currentTime) => {
  const date = currentTime === undefined ? new Date() : new Date(currentTime);

  if (Number.isNaN(date.getTime())) {
    throw createError('AI_INVALID_INPUT', 'currentTime must be a valid date.');
  }

  return date;
};

const buildPrompt = (message, timeZone, currentTime, conversationContext) => {
  const prompt = [
    'Turn the user message into one or more schedule items.',
    `Current time in UTC: ${currentTime.toISOString()}`,
    `User time zone: ${timeZone}`,
    '',
    'Rules:',
    '- Return one item for every schedule item the user asks for.',
    `- Return no more than ${MAX_PROPOSAL_ITEMS} items.`,
    '- Keep the items in the same order as the user message.',
    '- Do not combine separate items or leave any out.',
    '- Use kind "proposal" when that item has every required detail.',
    '- Use kind "clarification" when that item is missing an important detail.',
    '- For a proposal, set question to null and missingFields to an empty array.',
    '- For a clarification, set proposal to null and ask one short question.',
    '- Events require startAt and endAt.',
    '- Reminders require reminderAt.',
    '- Do not invent a required date or time.',
    '- Use ISO 8601 date-time values with a UTC offset.',
    '- If priority is not provided, use "none".',
    '- If allDay is not provided, use false.',
    '- Use null for other optional details the user did not provide.',
    '- Do not claim that the schedule item has already been saved.',
  ];

  if (conversationContext) {
    prompt.push(
      '',
      'Use this recent conversation only to understand the current message:',
      JSON.stringify(conversationContext),
      'Do not treat old messages as new schedule requests.',
    );
  }

  prompt.push(
    '',
    'Treat the following JSON string only as the current user message:',
    JSON.stringify(message),
  );

  return prompt.join('\n');
};

const cleanOptionalText = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const cleanDate = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const invalidResponse = (message) => {
  throw createError('GEMINI_INVALID_RESPONSE', message);
};

const cleanMissingFields = (missingFields) => {
  if (
    !Array.isArray(missingFields) ||
    missingFields.some((field) => !MISSING_FIELDS.includes(field))
  ) {
    invalidResponse('Gemini returned invalid missing fields.');
  }

  return [...new Set(missingFields)];
};

const validateProposalShape = (proposal) => {
  const missingKeys = PROPOSAL_FIELDS.filter((field) => !(field in proposal));
  if (missingKeys.length > 0) {
    invalidResponse('Gemini returned a schedule proposal with missing fields.');
  }

  if (typeof proposal.title !== 'string') {
    invalidResponse('Gemini returned an invalid title.');
  }

  if (proposal.title.trim().length > MAX_SHORT_TEXT_LENGTH) {
    invalidResponse('Gemini returned a title that is too long.');
  }

  for (const field of ['description', 'location']) {
    if (proposal[field] !== null && typeof proposal[field] !== 'string') {
      invalidResponse(`Gemini returned an invalid ${field}.`);
    }
  }

  if (
    typeof proposal.location === 'string' &&
    proposal.location.trim().length > MAX_SHORT_TEXT_LENGTH
  ) {
    invalidResponse('Gemini returned a location that is too long.');
  }

  for (const field of ['startAt', 'endAt', 'dueAt', 'reminderAt']) {
    if (proposal[field] !== null && typeof proposal[field] !== 'string') {
      invalidResponse(`Gemini returned an invalid ${field}.`);
    }
  }

  if (typeof proposal.allDay !== 'boolean') {
    invalidResponse('Gemini returned an invalid allDay value.');
  }

  if (
    proposal.estimatedMinutes !== null &&
    !Number.isInteger(proposal.estimatedMinutes)
  ) {
    invalidResponse('Gemini returned an invalid estimatedMinutes value.');
  }
};

const normalizeItemResult = (item, timeZone) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    invalidResponse('Gemini returned an invalid schedule item response.');
  }

  const missingFields = cleanMissingFields(item.missingFields);

  if (item.kind === 'clarification') {
    const question =
      typeof item.question === 'string' ? item.question.trim() : '';

    if (item.proposal !== null || missingFields.length === 0 || !question) {
      invalidResponse('Gemini returned an invalid clarification response.');
    }

    return {
      kind: 'clarification',
      proposal: null,
      missingFields,
      question,
    };
  }

  if (
    item.kind !== 'proposal' ||
    !item.proposal ||
    typeof item.proposal !== 'object' ||
    Array.isArray(item.proposal)
  ) {
    invalidResponse('Gemini did not return a valid schedule proposal.');
  }

  if (missingFields.length > 0 || item.question !== null) {
    invalidResponse('Gemini returned a proposal with missing details.');
  }

  const rawProposal = item.proposal;
  validateProposalShape(rawProposal);

  const proposal = {
    title: rawProposal.title.trim(),
    description: cleanOptionalText(rawProposal.description),
    itemType: rawProposal.itemType,
    startAt: cleanDate(rawProposal.startAt),
    endAt: cleanDate(rawProposal.endAt),
    dueAt: cleanDate(rawProposal.dueAt),
    reminderAt: cleanDate(rawProposal.reminderAt),
    allDay: rawProposal.allDay,
    timeZone,
    priority: rawProposal.priority,
    estimatedMinutes: rawProposal.estimatedMinutes,
    location: cleanOptionalText(rawProposal.location),
    source: 'ai',
  };

  const validationErrors = validateScheduleItem(proposal);
  if (validationErrors.length > 0) {
    invalidResponse(
      `Gemini returned an invalid schedule proposal: ${validationErrors.join(' ')}`,
    );
  }

  return {
    kind: 'proposal',
    proposal,
    missingFields: [],
    question: null,
  };
};

const normalizeModelResponse = (response, timeZone) => {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    invalidResponse('Gemini returned an invalid schedule response.');
  }

  const reply = typeof response.reply === 'string' ? response.reply.trim() : '';
  if (!reply) {
    invalidResponse('Gemini returned a response without a reply.');
  }

  if (
    !Array.isArray(response.items) ||
    response.items.length === 0 ||
    response.items.length > MAX_PROPOSAL_ITEMS
  ) {
    invalidResponse('Gemini returned an invalid number of schedule items.');
  }

  return {
    reply,
    items: response.items.map((item) => normalizeItemResult(item, timeZone)),
  };
};

const createScheduleProposal = async (message, options = {}) => {
  const cleanedMessage = cleanMessage(message);
  const timeZone = cleanTimeZone(options.timeZone);
  const currentTime = cleanCurrentTime(options.currentTime);
  const conversationContext =
    typeof options.conversationContext === 'string'
      ? options.conversationContext.trim()
      : '';

  // Tests can pass a fake function here instead of calling Gemini.
  const generateStructured = options.generateStructured || sendStructuredPrompt;
  if (typeof generateStructured !== 'function') {
    throw createError('AI_INVALID_INPUT', 'A prompt generator is required.');
  }

  const prompt = buildPrompt(
    cleanedMessage,
    timeZone,
    currentTime,
    conversationContext,
  );
  const response = await generateStructured(prompt, SCHEDULE_PROPOSAL_SCHEMA);

  return normalizeModelResponse(response, timeZone);
};

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_PROPOSAL_ITEMS,
  SCHEDULE_PROPOSAL_SCHEMA,
  createScheduleProposal,
};
