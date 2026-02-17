# NEET 2026 AI Daily Prediction Website

Production-ready monorepo for daily NEET paper generation (100 MCQs/day) with strict topic enforcement, duplicate prevention, exam UI, and admin controls.

## Project Structure

```text
NEET-burhan-2026/
  ai-service/
    app/
      __init__.py
      config.py
      generator.py
      main.py
      schemas.py
      topics.py
    .env.example
    requirements.txt
  backend/
    scripts/
      run-migrations.js
    sql/
      schema.sql
    src/
      app.js
      server.js
      config/
        env.js
        topics.js
      db/
        postgres.js
        redis.js
      middleware/
        auth.js
        error.js
        validate.js
      routes/
        admin.js
        attempts.js
        auth.js
        papers.js
      services/
        adminService.js
        aiClient.js
        attemptService.js
        bootstrapService.js
        generationService.js
        questionValidation.js
      utils/
        date.js
        jwt.js
    .env.example
    package.json
  frontend/
    app/
      admin/page.tsx
      quiz/page.tsx
      quiz/[date]/page.tsx
      globals.css
      layout.tsx
      page.tsx
    components/
      PaletteButton.tsx
      QuestionCard.tsx
      ResultSummary.tsx
    lib/
      api.ts
      engines/
        adaptiveEngine.js
        analyticsEngine.js
        questionEngine.js
        scoringEngine.js
        storageEngine.js
        timerEngine.js
        uiController.js
    .env.example
    package.json
    tailwind.config.ts
    tsconfig.json
  .env.example
  docker-compose.yml
  DEPLOYMENT.md
  SETUP.md
```

## Highlights

- Daily cron at `00:01` IST (`Asia/Kolkata`) generates 30 Physics + 30 Chemistry + 40 Biology.
- Strict difficulty balancing per subject:
  Physics `10 easy / 12 moderate / 8 hard`, Chemistry `10 / 12 / 8`, Biology `20 / 12 / 8`.
- Strict allowed-topic validation and reject-on-outside-topic behavior.
- Multi-layer duplicate prevention:
  SHA-256 hash, lexical semantic-similarity filter (>=85%), and 7-day topic+concept repetition cap.
- Question quality metadata:
  `difficulty`, `conceptTag`, `sourceType`, `questionFormat`, `syllabusUnit`, `confidenceScore`, `verificationFlag`.
- Strict NEET-style stem/option depth:
  each question stem requires at least two lines and long-form options with descriptive wording.
- Built-in question format diversity:
  `Single Correct`, `Assertion-Reason`, `Statement I-II`, `Multi-Statement`, `Case-Based`.
- Secure APIs:
  JWT auth, role-based admin, rate limiting, CSP headers, origin-guarded state-changing requests, input sanitization, API-key protected AI service, structured JSON logging.
- Exam simulation:
  single-scroll 100-question layout, palette jump, timer, progress bar, per-question submit lock in exam mode, fullscreen mode, tab-switch warning, inactivity auto-submit, timeout auto-submit.
- Adaptive intelligence:
  local performance model, confidence scoring, readiness score, weak-area detection, improvement trends, adaptive difficulty recommendation, prediction mode prioritization.
- Analytics:
  total score, accuracy, subject/topic breakdown, strongest/weakest topics, time-per-question, time-by-subject, readiness band, estimated rank range, revision suggestions.
- Admin analytics dashboard:
  DAU trend, average score trend, weakest topics nationally, most attempted subject, hardest question, heatmap feed, difficulty success graph, daily/weekly leaderboards.

## Biology Topic Source

Strict Biology filtering is enforced from `BIOLOGY_TOPICS_JSON` (backend + AI service), and the current env templates are preloaded with the requested strict list. To change the allowlist later, update that JSON in both service env files.

## NEET 2026 Syllabus Source

Generation now validates `syllabusUnit` against the official NEET (UG) 2026 unit list in code:
- Backend map: `backend/src/config/syllabus2026.js`
- AI map: `ai-service/app/syllabus2026.py`

Reference:
- NTA notice published on 22 December 2025 with syllabus doc links.

See `SETUP.md` and `DEPLOYMENT.md` for complete instructions.

## Semantic Similarity Note

Current duplicate layer-2 uses lexical semantic similarity (token overlap) at threshold `0.85`, which is deterministic and deployable without external embedding APIs. If you want embedding-based semantic deduplication, wire an embedding provider in `backend/src/services/generationService.js` and replace the comparator with vector cosine similarity.
