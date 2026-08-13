# Gemini setup

This connects the backend to the Gemini Developer API. It can turn one message
into validated schedule item previews, but it does not save the items.

## Local setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` if you do not already have a local `.env`.
3. Add the key to `.env`:

   ```env
   GEMINI_API_KEY=your-real-key
   GEMINI_MODEL=gemini-3.6-flash
   ```

4. Install dependencies with `npm install`.
5. Run `npm run ai:smoke` to send one synthetic connection-test prompt.

The key belongs only in the backend `.env`. Never add it to frontend code or
commit it to Git.

## What is included

- `services/ai/ai-config.js` reads the Gemini settings in one place.
- `services/ai/gemini-client.js` creates the SDK client only when it is needed.
- `GET /ai/status` reports whether a key is configured without returning it or
  making an API request.
- `npm run ai:smoke` makes one real request using synthetic text.

The Gemini Developer API has a free tier with usage limits. For this capstone,
use synthetic demo information while the project is on the unpaid tier. Google
states that unpaid-service content may be used to improve its products and may
be reviewed by people, so do not send private calendar information.

Current details are in Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and
[terms](https://ai.google.dev/gemini-api/terms).

## Next frontend step

`POST /ai/schedule-proposal` is ready for the Chat UI. The frontend still needs
to send the message and time zone, show the reply and item previews, and wait
for the user to confirm them.

After confirmation, save each item through the normal `POST /schedule-items`
route. Gemini should only prepare the previews.
