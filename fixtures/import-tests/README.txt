TEAM RHYTHM - FICTIONAL IMPORT TEST PACK

All names, clients, email addresses, meetings and commitments are fictional.
Each file is an independent scenario. Do not merge them into one timeline.

01-clean-meeting-minutes.txt
  Four clear actions, one decision, two Signal observations and a parked idea.
  Checks relative dates without confusing targets or discussion with tasks.

02-messy-meeting-transcript.txt
  Seven task candidates: FIVE ready for review and TWO needing clarification.
  One task lacks a deadline. One has an inaudible owner. There is also a repeated
  task, a parked podcast idea and a Signal target that must not become a task.
  "Next Thursday" is relative to the recorded Thursday 8 October, so it is 15 October.

03-email-deadline-brought-forward.txt
  One task. Original 16 October deadline becomes 13 October at 16:00 after
  Alex confirms. Sort messages by their sent timestamps, not physical file order.
  Quoted copies are evidence duplicates, not new tasks or date changes.

04-email-deadline-postponed.txt
  One task. Original 8 October deadline moves two weeks to 22 October after
  confirmation, because an external dependency is away. Owner stays Alex.

05-email-conflicting-unconfirmed-updates.txt
  One task. 16 October is the last confirmed deadline. 12 and 15 October are
  unconfirmed alternatives. Flag the conflict; do not silently pick the newest.

06-undated-notes.txt
  One task with Alex as owner. Its relative date cannot be resolved until the
  original chat date and timezone are provided. Never anchor to today's date.

07-meeting-history-for-ai-queries.txt
  One coherent two-person history: four weekly meetings and a deadline amendment.
  Use it to test owners, original/changed dates, ratings, missed targets, recurring
  issues, supported inferences and missing completion or reason information.

AI QUERY EXAMPLES
  demo-ai-queries.txt is the readable question sheet.
  demo-ai-queries.json contains 19 questions, source scope, expected answer
  behaviour, evidence and assertions about what the AI must not invent.
  Expected answers are a human test oracle, not measured model outputs.
  Send the question and authorised records to the model, not this answer key.
  Keep each question in its stated source scope. Do not mix independent cases.

RECORDING PLAN
  demo-recording-sequence.txt in the project describes agent-driven browser
  takes. Record the live UI first, then write narration against the real takes.

PDF UPLOAD
  output/pdf/sample-email-chains.pdf in the project mirrors scenarios 03 and 04,
  with one email chain per page. Do not upload the expected-results file to AI.

HOW TO TEST
  1. Create an empty fictional workspace with the members in expected-results.json.
  2. Paste or upload ONE source file; confirm the shown source date and timezone.
  3. Generate proposed work using the selected OpenRouter model.
  4. Compare task count, owner, dates, source citations and flags with the answer key.
  5. Review edits, then save once. Retrying must not duplicate tasks.
  6. For a changed deadline, inspect both the original agreement and the amendment.

RECOMMENDED DEMO WORDING
  "Seven actions found. Five are ready; two need clarification."
  Show who/date is missing and ask a short, specific question for each.
  This is the EXPECTED test result, not a measured model-accuracy claim.

VERIFICATION
  These cases were exercised through the live Team Rhythm OpenRouter import.
  A fresh recorded browser run of the messy example returned seven proposals:
  five ready and two requiring clarification, with next Thursday on 15 October.
  The answer keys are still human expectations, not a universal AI benchmark.
  Model output and response speed can vary. Review every proposal before saving.
