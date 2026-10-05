# Team Rhythm

Better meetings, clear commitments — even for two people.

Team Rhythm is a small-team operating rhythm: **prepare → talk → commit → remember → improve**. The contest version builds on earlier client-work concepts, with fictional demo data and its own terminology.

- [Try the live app — no signup needed](https://team-rhythm.theaiconsultant.co.uk/)
- [60-second app walkthrough](https://www.youtube.com/watch?v=uhehsdrxKn0)
- [Animated explainer](https://www.youtube.com/watch?v=RzIxSYCiMCI)
- [How it works and why](https://team-rhythm.theaiconsultant.co.uk/about)

## What it does

- Weekly and leadership meetings, private one-to-ones, quarterlies and annual meetings.
- Preparation, configurable Signals with your own units, milestones, owners and deadlines.
- Meeting notes, closing snapshots, history, individual usefulness ratings and trends.
- Admin/member roles and invitations by copied link.
- OpenRouter AI: review proposals from transcripts, minutes, email chains and readable PDFs; ask questions with evidence from the team record.
- Five skins, isolated fictional demos for two, four or six people, and realistic messy-source examples.

AI proposals require human review. Unknown owners and dates stay unresolved, and conflicting deadline requests need clarification. Core meetings work without AI.

## Run locally

Requirements: Node.js 22, npm, a **separate Supabase project or local Supabase stack**, and Poppler (`pdftotext`) for PDF import. On macOS, `brew install poppler`; on Debian/Ubuntu, `apt-get install poppler-utils`. The Docker image includes Poppler.

1. Configure your separate Supabase instance. [Enable anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous) for the fictional demos. Enable email/password signup. This contest build expects an immediate signup session, so disable email confirmation in the **isolated test instance**; a production email-verification flow would need additional implementation. See [password authentication](https://supabase.com/docs/guides/auth/passwords).
2. Copy `.env.example` to `.env`. Set the database URL, Supabase URL and anon key for **your instance**. Use a database role able to apply `server/schema.sql` and read/write the `rhythm` schema. The anonymous and authenticated Supabase roles cannot access these tables directly; requests go through Express.
3. Generate an encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and place the result in `APP_ENCRYPTION_KEY`. Keep it stable: changing it prevents decryption of previously saved OpenRouter keys.
4. For the default development ports, set `APP_URL=http://127.0.0.1:5173` and `PORT=3000`.
5. Install and start:

```sh
npm ci
npm run check
node --env-file=.env server/index.js
```

In another terminal:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` to Express on port 3000. The server applies its schema on startup. Choose a fictional demo or create a separate real team workspace.

For AI, optionally set a server-side `OPENROUTER_API_KEY` for fictional demos, or connect a key in workspace Settings. Your own provider account pays for usage. Saved workspace keys are encrypted and API responses expose only their last four characters. No credentials are included here.

## Build and host

```sh
npm run build
```

For a single Express deployment, serve the built client with `NODE_ENV=production`, your actual HTTPS origin in `APP_URL`, and the other server environment values. Production cookies require HTTPS. The app needs access to your database and Supabase Auth.

```sh
docker build -t team-rhythm .
docker run --rm --env-file .env -p 3000:3000 team-rhythm
```

For this container command, database/auth URLs must be reachable **from inside the container**; `127.0.0.1` refers to the container itself. Use your own network configuration and HTTPS reverse proxy.

Finished videos are linked above. Optional self-hosted video files go in `media/`, with `manifest.json`, `team-rhythm-explainer.mp4`, `video-poster.jpg` and `captions.vtt`; the manifest requires `ready: true`. Media binaries and video-production working files are outside this app-source package.

## Test it

Use the live fictional sandbox for the quickest review. Add a custom Signal, assign a milestone, change a deadline with a reason, finish a meeting, reopen its history, and ask AI who agreed to do what and when. In the six-person lab, the messy transcript has seven intended proposals: five ready and two needing clarification.

`fixtures/import-tests/` contains six independent source cases, fictional meeting history, 19 example AI queries and authored answer keys. The PDF is `output/pdf/sample-email-chains.pdf`.

```sh
npm run check
npm run build
python3 fixtures/import-tests/validate_fixtures.py
```

Integration checks target localhost by default. Run them only against your **isolated test instance**; they create fictional users and workspaces. AI checks require an enabled demo key and can vary with provider output. For these checks, use `APP_URL=http://127.0.0.1:3000` with a built client, or match `TEAM_RHYTHM_TEST_URL` to your test origin.

```sh
TEAM_RHYTHM_TEST_URL=http://127.0.0.1:3000 python3 tests/live_checks.py
TEAM_RHYTHM_TEST_URL=http://127.0.0.1:3000 python3 tests/invitation_checks.py
```

The original contest deployment passed 50 live checks and browser admin/role/invitation/milestone/meeting/history workflows. That is historical deployment verification, not a claim that every new installation has been tested.

## Limits and ownership

PDF import reads text, not scanned-page OCR: 8 MB, 30 pages. Deadlines are dates; stated times stay in source evidence. Invitations use copied links, not outbound email. Demo AI has bounded allowances and provider limits. Bot progress/resume-ID tracking is a future idea.

Inspired by broad operating principles from Gino Wickman/EOS, Ryan Deiss and Jack Stack. Independent software; no affiliation or endorsement. All demo people and events are fictional.

Copyright © 2026 Paul Cowen. Licensed under the [MIT License](LICENSE). You may use, modify and redistribute this software under its terms. Dependency packages retain their respective licences.
