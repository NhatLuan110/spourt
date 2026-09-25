# DECISIONS

Every choice that departs from the specification, or that the specification left
open. Newest first within each phase.

---

## Phase P0 — Foundation

### D-001 · The repository lives on `E:\sprout`, not `F:\TIẾNG ANH`

**Context.** Work started in `F:\TIẾNG ANH`. That volume is a **removable FAT32
drive**. FAT32 supports neither symbolic links nor junctions, so pnpm cannot link
workspace packages (`ERR_PNPM_ENOENT` on every install), and PostgreSQL refuses
to initialise a cluster there.

**Decision.** The project lives on `E:\sprout` (NTFS). Confirmed with the owner.

**Consequence.** `pnpm install` went from failing after ten minutes to finishing
in ten seconds. The old copy under `F:\TIẾNG ANH\sprout` is stale and can be
deleted.

### D-002 · Local PostgreSQL runs from `embedded-postgres`, not Docker

**Context.** §4.2 and §11 assume `docker compose up`. This machine has no Docker
daemon and no PostgreSQL installation, and installing either needs admin rights.

**Decision.** `scripts/local-postgres.mjs` drives the genuine PostgreSQL binaries
shipped by the `embedded-postgres` npm package through `pg_ctl`, storing the
cluster in `.pgdata/` on port **5433**. `pnpm pg:start` / `pnpm pg:stop`.
`docker-compose.yml` is still committed for machines that do have Docker.

**Consequence.** Development uses **PostgreSQL 18.4** rather than the 16 named in
the spec. Every feature the schema relies on (arrays, `Json`, `@db.Date`,
partial indexes) behaves identically. Two details differ from a container:

- The package ships only `postgres` and `pg_ctl`, no `psql`/`createdb`, so the
  database is created through the `pg` driver instead. Use `pnpm db:studio` for
  a data browser.
- On Windows `pg_ctl` holds inherited stdio handles for the life of the server,
  so the launcher spawns it with `stdio: 'ignore'`, otherwise the script hangs.

### D-003 · One `.env` at the repository root

**Context.** Prisma reads `.env` from the schema directory; the spec wants a
single source of configuration.

**Decision.** One root `.env`. The API package pipes every database script
through `dotenv -e ../../.env --`.

### D-004 · `@node-rs/argon2` instead of `argon2`

**Context.** §7.13 and §11 require argon2id. The `argon2` package is a native
node-gyp addon and needs Visual Studio build tools on Windows.

**Decision.** `@node-rs/argon2`, a Rust implementation with prebuilt binaries.
Same algorithm, OWASP parameters (`memoryCost 19456, timeCost 2, parallelism 1`).

### D-005 · RS256 keys are generated on first boot in development

**Context.** §11 requires RS256, but §14 wants a fresh clone running in ten
minutes.

**Decision.** `ensureJwtKeys()` writes a 2048-bit pair into `apps/api/.keys/`
(gitignored) when `JWT_PRIVATE_KEY` is unset. In production the variables are
mandatory and boot fails loudly without them.

### D-006 · Refresh tokens carry their family in the token string

**Context.** §11 asks for rotation plus reuse detection.

**Decision.** A refresh token is `"<family>.<secret>"`. Only the SHA-256 of the
secret is stored. Presenting a token that was already rotated revokes every
session in that family. Verified end to end: replaying a used token returns
`REFRESH_TOKEN_REUSED` and kills the successor token too.

### D-007 · No global `ValidationPipe`

**Context.** Nest's `ValidationPipe` requires `class-validator`; §11 mandates Zod
on both sides of the wire.

**Decision.** Validation is per route through `zodPipe(schema)` using the same
schemas the web app imports from `@sprout/shared`.

### D-008 · One pinned `fastify` version across the workspace

**Context.** `@nestjs/platform-fastify` bundled fastify 5.11 while the direct
dependency resolved to 5.12, producing two incompatible `FastifyInstance` types.

**Decision.** `pnpm.overrides` pins `fastify` to a single version.

### D-009 · Learning steps: Hard repeats, Easy graduates at four days

**Context.** §9.1 defines the REVIEW branch precisely but leaves the LEARNING
branch partly open.

**Decision.** In LEARNING: `Again` returns to step 0, `Hard` repeats the current
step, `Good` advances (graduating at 1 day), `Easy` graduates immediately at
**4 days** (`easyGraduatingIntervalDays`, configurable). Without this, Good and
Easy would be identical on the last step.

### D-010 · Fuzz is skipped below two days

**Context.** §9.1 fuzzes every interval by ±5%, but due dates are rounded to the
start of the learner's local day.

**Decision.** Fuzz applies only from two days upward, where it can actually move
a card to a different day.

### D-011 · A lapsed card keeps its pre-lapse interval

**Context.** §9.1 says a relearning card graduates to
`max(1, round(prevInterval × 0.5))`, which requires remembering `prevInterval`.

**Decision.** `Again` in REVIEW writes the old interval back to `intervalDays`
and schedules the 10-minute relearning step separately, so graduation can halve
the right number.

### D-012 · Distinct pseudo-phonemes for the `-ed` ending

**Context.** In §7.6.3 both "mất phụ âm cuối" and "đuôi -ed" claim `/t/` and
`/d/`, so a single lookup table cannot tell them apart.

**Decision.** `final-consonant` owns `final-t`/`final-d`; `past-ed` owns
`ed-t`/`ed-d`/`ɪd`; `plural-s` owns `final-s`/`final-z`/`ɪz`. Table order breaks
any remaining tie (first pattern wins).

### D-013 · Review always wins the recommendation, by rule not by weight

**Context.** §9.6 gives review 40 × urgency and also states that review always
wins when cards are due. With 24 cards due, the weighted formula ranked a weak
listening lesson higher.

**Decision.** Review candidates get an explicit precedence boost while
`dueCount > 0`, so the stated rule holds regardless of the other weights.

### D-014 · Dictation alignment penalises a mismatch more than one gap

**Context.** With Needleman-Wunsch at mismatch −1 / gap −2, a missing word tied
with two substitutions, and the traceback reported "wrong, wrong" instead of
"missing, extra".

**Decision.** Mismatch −3, gap −2. A replaced word is still a substitution
(−3 beats −4), while a genuinely missing word now opens a gap.

### D-015 · Homophones never score as typos

**Context.** §9.5 flags homophones separately, and `there`/`their` are also
within Levenshtein 2 of each other.

**Decision.** The homophone check runs first; a homophone is always a full error
plus a "right sound, wrong word" warning, never a half-point spelling slip.

### D-016 · `DailyStat.date` is a `@db.Date`

**Context.** §5.8 types it `DateTime` while describing a local calendar date.

**Decision.** `@db.Date` holding the learner's local day at UTC midnight, so a
day is one row and range queries stay simple.

### D-017 · i18n without a locale prefix in the URL

**Context.** §11 requires `next-intl` with Vietnamese default and English
available; the spec does not describe URL structure.

**Decision.** No `/vi` or `/en` segment. Vietnamese is the default and the choice
is stored in the `sprout_locale` cookie, so links shared between learners always
open. `messages/vi.json` and `messages/en.json` are key-for-key identical.

### D-018 · Unbuilt sections are disabled, not linked

**Context.** The sidebar lists ten destinations; P0 builds two of them.

**Decision.** Not-yet-built entries render greyed with a "sắp có" tag and
`aria-disabled`, so navigation never reaches a dead route (§14: no blank
screens). Each becomes a real link as its phase lands.

### D-019 · Integration tests use a real `sprout_test` database, not Testcontainers

**Context.** §11 asks for Supertest plus Testcontainers. Testcontainers needs a
Docker daemon, which this machine does not have.

**Decision.** `apps/api/test/setup-db.ts` creates a separate `sprout_test`
database on the same local server and runs `prisma migrate deploy` before the
suite. Tests hit the real HTTP stack through Fastify's `app.inject`, so guards,
filters, interceptors and Zod pipes all run. On CI, where Docker is available,
the workflow uses a `postgres:16` service container instead.

### D-020 · Vitest compiles the API with SWC

**Context.** Nest resolves constructor arguments from `design:paramtypes`
metadata. Vitest's esbuild transform cannot emit decorator metadata, so every
guard received `undefined` for its dependencies.

**Decision.** `unplugin-swc` compiles the API tests. Also: worker processes do
not inherit environment changes made in `globalSetup`, so `NODE_ENV` and the
test `DATABASE_URL` are declared in `vitest.config.ts` under `test.env`.

### D-021 · Rate limiting is skipped in the test environment

**Context.** `/auth/register` allows 5 requests per minute per IP. An
integration suite that registers an account per test trips that limit and every
later assertion fails with a misleading 401.

**Decision.** `ThrottlerModule` sets `skipIf: () => NODE_ENV === 'test'`. Rate
limiting is exercised by its own test rather than throttling the whole suite.

### D-022 · Turbo runs at most two tasks at once

**Context.** This machine has 7.7 GB of RAM. Six parallel `tsc` processes
exhausted it and turbo reported SIGABRT (exit 134), which looked like a
compilation failure but was an out-of-memory kill.

**Decision.** `--concurrency=2` for build, lint and typecheck, and
`--concurrency=1` for tests since the API suite owns the test database. Raise
these on a larger machine.

---

## Phase P1 — Vocabulary, SRS and gamification

### D-023 · ESLint was never actually running, and now is

**Context.** The P0 report claimed the lint task passed. It did not: no ESLint
was installed anywhere in the workspace, `packages/*` ran `eslint src` against a
binary that did not exist, and `apps/web` ran `next lint`, which stops on an
interactive prompt because there is no config. §11 requires ESLint.

**Decision.** One flat `eslint.config.mjs` at the root covers every package,
with `@typescript-eslint/no-explicit-any` and `no-console` as errors so the §0.2
and §14 rules are enforced rather than merely stated. Every package now runs
`eslint . --max-warnings 0`.

**Consequence.** The first clean run found three real problems (a useless regex
escape in `normalizeForComparison`, a dead constant, a generated file being
linted); all three are fixed. The earlier "lint passes" claim was wrong and is
corrected here.

### D-024 · Generated practice items are stored as real `Exercise` rows

**Context.** §7.3.4 asks for five vocabulary exercise formats generated from the
learner's own words. Keeping a generated set in memory would mean the correct
answer has to travel to the browser to be graded there, or be re-derived on
submit from client-supplied data.

**Decision.** Generating an item upserts an `Exercise` row with a deterministic
id (`vp_<mode>_<wordId>`). The answer lives in the `answer` column and never
leaves the server; the client posts the exercise id and its choice.

**Consequence.** Every attempt lands in `ExerciseAttempt`, so daily accuracy,
the mistake ledger and the §12.3 achievements all see practice work without a
second code path. Items are shared content, so the same word asks the same
question for everyone — the per-session variety comes from the order and from
which words are picked, not from re-rolling the distractors.

### D-025 · Option ids are hashes, and matching salts the two columns apart

**Context.** If an option id were the candidate's word id, a learner could read
the answer out of the network tab, since the item already names the word it is
about.

**Decision.** An option id is `sha256(exerciseId + wordId)` truncated to twelve
hex characters. For matching, the left and right columns are hashed with
different salts (`:L` and `:R`), so identical ids cannot be lined up.

### D-026 · Word formation is scored as GRAMMAR, not VOCABULARY

**Context.** §7.4 sits inside the vocabulary module, but the skill it trains is
morphology: which class a suffix produces.

**Decision.** Word-form exercises, their attempts, their mistakes and their
skill observations are all `GRAMMAR`.

**Consequence.** The §9.6 recommender can suggest word-form practice alongside
review, because it de-duplicates by skill; scoring both as vocabulary would have
hidden one behind the other.
### D-027 · Browser speech synthesis stands in for missing word audio

**Context.** §12.1 requires a US and a UK recording for every word. No TTS
provider key is configured, so the seeded words have no audio file, and the
"listen and type" exercise would be unusable.

**Decision.** `playWord()` plays the recording when the word has one and falls
back to the browser's `speechSynthesis` otherwise. The listening exercise also
offers a 0.75x replay, which synthesis supports natively.

**Consequence.** Every word is audible today, offline and at no cost, with the
accent the learner picked. It is not a substitute for real recordings — synthesis
gets stress wrong on unusual words — so `audioUsUrl` stays in the schema and
takes precedence the moment a provider is configured.

### D-028 · One award can carry a quantity

**Context.** Committing twenty new words meant twenty passes through the whole
gamification pipeline, and therefore twenty full achievement evaluations.

**Decision.** `award()` takes an optional `quantity` that multiplies the base XP
before the streak multiplier. Twenty new words is one award of 100 XP.

**Consequence.** The daily rollup, the streak check and the achievement engine
run once per session rather than once per word. The XP total is identical.

### D-029 · "Học 10 từ" counts the collection, not the reviewed subset

**Context.** The `words_learned` achievements read one number while
`UserProgress.wordsLearned` counted another: the achievement engine required
`state != NEW`, so meeting twenty words unlocked nothing until they had also
been graded.

**Decision.** Both count every `UserWord` row. Meeting a word is learning it;
grading it is reviewing it.

### D-030 · "Lên một bậc" needs three measured skills

**Context.** §9.7 blends the mean of the skills with the weakest one. With a
single skill measured, the mean and the weakest are the same number, so one
perfect review session declared a B1 learner C2 and paid out 500 XP.

**Decision.** The `cefr_increased` achievement only fires once at least three
skills have a confidence of 0.3 or better.

### D-031 · The test database is seeded with the real content

**Context.** The vocabulary suites need topics, words, examples with highlight
offsets and word families. Fixtures would drift from the content the app ships.

**Decision.** `test/setup-db.ts` runs the actual seed after migrating, so the
tests exercise the same rows a fresh install gets — which also means the seed
itself is covered.

### D-032 · 164 words shipped, against the §12.1 target of 200–250 per topic

**Context.** §12.1 asks for 200 to 250 words per topic, or roughly 1,700 in
total, each with IPA, syllables, stress, two bilingual examples and relations.

**Decision.** All eight topics are populated, with 20 to 22 words each — 164 in
total — plus 13 word families and the 30 suffix rules. Every entry is complete:
no placeholder definitions, no missing examples, no unresolved highlight
offsets.

**Consequence.** This is enough for a real session — the demo learns twenty
words in one topic and the distractor pool is large enough to make plausible
options — but it is well short of the specification. The gap is content
authoring, not code: `content/vocabulary/*.yaml` is the only file that has to
grow, and `pnpm db:seed` is idempotent, so words can be added a batch at a time.

## Phase P2 — Grammar, reading and listening

### D-033 · Listening plays through speech synthesis, with estimated timings

**Context.** §5.6 gives `ListeningTrack` an `audioUrl` and `TranscriptSegment` a
millisecond `startMs`/`endMs` plus per-word timings for karaoke highlighting.
No TTS provider is configured and there are no recordings to measure.

**Decision.** `audioUrl` is seeded as an empty string. The player speaks each
transcript segment with the browser's `speechSynthesis` and advances on the
utterance's `onend` event, so the highlighted segment is genuinely the one being
spoken. The seeded timings are estimates — 400 ms per word, roughly 150 words a
minute, with each word's share of the segment weighted by its length and the
last word pinned to the segment end so rounding cannot run past it. They drive
the duration shown on the card and the progress display.

**Consequence.** Segment-level highlighting is real; word-level highlighting is
an approximation and is not used to drive the UI. Dictation, comprehension and
the playback-rate record are unaffected, because they never needed the audio
file. When a provider is configured, seeding a real `audioUrl` switches the same
component to `<audio>` playback with no UI change, and the estimated timings
should be replaced with measured ones at the same time.

### D-034 · Lesson prose is rendered by a small Markdown subset, not a library

**Context.** `LessonSection.bodyMdx` holds Markdown: headings, paragraphs,
bullet and numbered lists, tables, and inline bold, italic and code. §11
forbids injecting untrusted markup.

**Decision.** `lesson-markdown.tsx` parses exactly that subset into React
elements. No `dangerouslySetInnerHTML` anywhere, and no Markdown dependency.

**Consequence.** Content authors are limited to the subset, which is checked by
`scripts/check-content.cjs` parsing every file and by unit tests over the
parser. Anything outside it renders as plain text rather than breaking the page.
Adding a syntax means adding a branch and a test, which is the right amount of
friction for prose that ships to learners.

### D-035 · One grading engine behind grammar, reading and listening

**Context.** All three features grade a set of exercises, write
`ExerciseAttempt` and `MistakeLog` rows, close a `StudySession` and award XP.
Vocabulary practice already does the same thing in `practice.service.ts`.

**Decision.** `LearningEngineService.submit` owns that loop for the three new
features. Each feature passes its skill, XP source and the list of exercise ids
it owns; the engine refuses any answer whose id is not in that list. Vocabulary
practice keeps its own copy because its items are generated per session rather
than authored, and merging the two would mean one method with two modes.

**Consequence.** A fix to grading, mistake logging or session accounting lands
in all three at once. The `allowedExerciseIds` check is what stops a learner
posting another activity's answers to collect its XP twice; it has a test.

### D-036 · Reading speed is timed from opening the passage, and a fast accurate read is not a skim

**Context.** §7 wants reading speed reported against a level-appropriate target.
The obvious implementation times the questions, which measures the wrong thing.

**Decision.** The web page opens a `StudySession` when the passage renders, not
when the questions open, so the elapsed time covers the read. The server owns
the clock: `elapsedMs` from the client is only used when there is no session,
and is clamped to two hours. `readingSpeedBand` calls a read "skimmed" only when
it is more than twice the target *and* accuracy is below 60 percent — speed
alone is not evidence of skimming.

**Consequence.** A learner who reads carefully and answers well is told they
read fast, not that they cheated. A learner who races through and gets the
questions wrong is told plainly. The two-second floor in `readingWpm` means a
mis-fired timer produces a large number rather than a division by zero, which is
visible rather than silent.

### D-037 · Accessibility rules are enforced, with two documented exemptions

**Context.** §11 lists accessibility as a requirement, but nothing was checking
it: `eslint-plugin-jsx-a11y` was never installed.

**Decision.** The plugin is installed and its recommended rules run in CI. Two
rules are exempted, both with the reason in the config or at the call site:
`no-autofocus` is off because every use is a drill screen whose single input is
the whole page, and `media-has-caption` is disabled on the one `<audio>` element
because the transcript rendered directly below it is a richer caption than a
track file — per speaker, translated, and clickable to replay a line.

**Consequence.** Seven genuine findings were fixed when the plugin went in,
including a `CardTitle` that spread its children through props so no checker
could see the heading had content.

## Phase P5 — Tests and analytics

### D-038 · The placement walk is a legible ladder, not an IRT model

**Context.** §7 wants an adaptive placement test that produces a CEFR level.
Item response theory is the textbook answer and needs calibration data that does
not exist for freshly authored questions.

**Decision.** `packages/scoring/src/adaptive.ts` walks the CEFR ladder: start at
A2, two right in a row moves up a level, two wrong moves down, both streaks
reset on a move because the difficulty just changed. The test runs at least 12
questions, stops at 30, and stops early once the walk has changed direction
three times. The final level is the highest level where the learner answered at
least 60 percent correctly over two or more questions, defaulting to A1.

**Consequence.** A learner can be told exactly why they were placed where they
were. The precision is coarser than IRT would give, and the estimate is only as
good as how evenly the question bank covers the levels — which is why
`skillOutcomes` reports "not measured" rather than zero for a skill the walk
never reached, and why the result screen says so out loud.

### D-039 · A failed hard question never raises the level estimate

**Context.** Blending accuracy with difficulty is necessary — a perfect run at
A1 is not a perfect run at B2 — but the obvious blend lets a learner who
attempted several C1 questions and failed them all come out above a learner who
only ever saw A2.

**Decision.** `skillOutcomes` averages the level of the questions the learner
answered **correctly**, not the ones they were asked. A run of failed C1
questions contributes nothing to the difficulty bonus.

**Consequence.** Reaching a hard question is not evidence of anything; answering
it is. Covered by a test that gives a learner one correct A1 and two failed C1
questions and asserts they come out at A1.

### D-040 · Unparseable input on a true/false question is wrong, not "false"

**Context.** `gradeExercise` mapped anything that was not the string `true` to
`false`, so a garbage submission scored correct on every question whose answer
happened to be false — half of them.

**Decision.** Only `true` and `false` are answers. Anything else scores zero.

**Consequence.** Found by a placement test that submitted nonsense to every
question and came out with 3.6 percent accuracy instead of zero. The fix
matters beyond the test: it closes a way of farming XP from lessons by posting
junk.

### D-041 · A topic is only a weak spot when the learner is actually weak at it

**Context.** `rankWeakTopics` returns the lowest-scoring topics whatever their
scores. On the analytics page, whose whole job is to point at real weaknesses,
that named a grammar lesson at 71 percent as something to revise purely because
it was the lowest of a strong set.

**Decision.** The analytics service keeps only topics below 70 percent, and
drops the bookkeeping tags (`test`, `comprehension`, `dictation`) that are not
topics a learner could go and revise. `rankWeakTopics` itself is unchanged, so
the recommendation engine that also uses it keeps its behaviour.

**Consequence.** An empty weak-spot list now means "nothing is going badly",
which is information. The page says so explicitly rather than showing a blank
box.

### D-042 · Analytics is computed from existing rows, never from a summary table

**Context.** The obvious way to make an analytics page fast is to maintain a
denormalised table of its numbers.

**Decision.** Every figure is read from rows that already exist for another
reason: `DailyStat` for the per-day series, `ExerciseAttempt` for accuracy,
`MistakeLog` for the error breakdown, `SkillScore` for §9.7, `StudySession` for
study hours. Nothing is written just to make this page work.

**Consequence.** The page cannot drift away from the activity it describes, and
a bug fix in grading retroactively corrects the analytics. The cost is several
queries per page load over a 90-day window; if that becomes a problem the answer
is a cache with an explicit invalidation, not a second source of truth.

### D-043 · A skill with no attempts reports null, not zero

**Context.** A skill the learner has not touched and a skill they are failing
both come out as zero if you are not careful, and they mean opposite things.

**Decision.** `SkillBreakdown.periodAccuracy` is `null` when there were no
attempts in the window, and the UI renders "chưa luyện trong kỳ này" rather than
0 percent. The same rule governs `insightsVi`, which refuses to compare skills
until at least two of them have five attempts each.

**Consequence.** The page says less, and what it says is true. A learner who has
only done vocabulary is told there is not enough data to compare skills, rather
than being told listening is their weakest skill on the strength of no evidence.

## Phase P3 — Writing and the AI tutor

### D-044 · The AI provider is configuration, not code

**Context.** §10 names Claude. Claude has no free tier, and this project has to
be runnable by someone with no payment card — which is the situation it is
actually being built in.

**Decision.** Everything that talks to a model goes through `AiProvider` in
`modules/ai`. Five implementations ship: Gemini (default, free tier needs no
card), Groq, OpenRouter and Ollama through one OpenAI-compatible class, and
Anthropic exactly as §10 describes. `AI_PROVIDER` and `AI_API_KEY` choose
between them; `ANTHROPIC_API_KEY` still works so an existing deployment does not
break. Ollama reports itself configured with no key at all, because it runs on
the learner's own machine.

**Consequence.** Moving to Claude later is one line in `.env`, not a rewrite.
The cost is that the lowest common denominator across providers sets the
interface: no streaming, and speech is optional per provider rather than
assumed. `AiService.canSpeak()` and `canTranscribe()` exist so a feature can ask
rather than find out by failing.

### D-045 · Gemini's free key does text, speech and transcription

**Context.** §12.1 wants recorded audio for every word, §5.6 wants audio for
listening tracks, and P4 needs speech-to-text. D-027 and D-033 recorded these as
missing because no provider was configured.

**Decision.** Verified against the live free tier: the same key that generates
text also returns 24 kHz PCM from `gemini-2.5-flash-preview-tts`, and transcribes
audio sent back to `gemini-3.5-flash`. A round trip — generate a sentence, speak
it, transcribe it — returned the sentence exactly. The provider adds the 44-byte
WAV header, because raw PCM is not playable and no caller should have to know
that.

**Consequence.** D-027 and D-033 are solvable without a second provider or a
card, and P4 is no longer blocked on Azure. `isProviderConfigured(env, 'tts')`
and `'stt'` now answer true for a Gemini key, so features can light up as soon
as audio generation is wired in.

### D-046 · Thinking tokens are capped, because they come out of the answer's budget

**Context.** Grading a real essay returned a JSON parse error. The model had not
failed: 3.5 Flash thinks by default, thinking tokens are drawn from
`maxOutputTokens`, and 1068 tokens of thinking left too little for the JSON,
which arrived truncated mid-object.

**Decision.** The FAST tier disables thinking outright for latency. The DEEP
tier caps it at 1024 tokens so the answer always has room, and writing feedback
asks for 8192 output tokens rather than 4096.

**Consequence.** Long structured output is reliable. The failure mode this
replaces was particularly unhelpful — a truncated response looks like a broken
provider rather than a budget problem — so `GeminiProvider` also reports
`finishReason` when the text comes back empty.

### D-047 · Criterion names are normalised; everything else stays strict

**Context.** Told to return `"task"`, the model sometimes returns
`"Task Achievement"`, and occasionally `"Ngữ pháp"`. Zod rejected the whole
response, throwing away good feedback over a label.

**Decision.** `normalizeFeedback` maps the IELTS-style and Vietnamese names onto
the four §5.6 keys before validation. A criterion nobody recognises is dropped
rather than guessed at. The rest of the schema is unchanged and still strict:
scores, offsets and explanations are validated exactly.

**Consequence.** Feedback survives a cosmetic difference in naming and still
fails loudly on anything substantive.

### D-048 · Issue offsets are computed server side, never trusted from the model

**Context.** Highlighting a mistake inside the learner's own text needs
character offsets. Asking the model for them invites off-by-several errors that
underline the wrong words.

**Decision.** The model quotes the text verbatim; `anchorIssues` locates each
quote in the submission and derives the offsets, searching forward from the last
match so repeated phrases stay in order and falling back to a case-insensitive
search. An issue whose quote cannot be found is **dropped**.

**Consequence.** A highlight is either correct or absent, never wrong. In the
live run all six checked issues anchored exactly. Losing an occasional issue is
the right trade: a mis-anchored underline teaches the learner the wrong lesson.

### D-049 · The tutor's context goes next to the question, not at the top of the thread

**Context.** Asking "Tại sao câu này sai?" with an exercise attached produced an
explanation of the *previous* question. The context was being prepended to the
message list, so the model read past it and found the earlier exchange sitting
closer to the question.

**Decision.** `buildTurns` attaches the context line to the current message
itself, immediately above the question, rather than as a separate earlier turn.

**Consequence.** Deixis works: a learner can ask "why is this wrong?" without
retyping the sentence. Verified live — the same request now explains
`She go to school` instead of the previous turn's sentence.

### D-050 · A failed grading keeps the learner's writing

**Context.** Grading calls a network service that can be over quota, overloaded,
or simply slow. Writing three hundred words and losing them to a 429 is the
worst possible outcome.

**Decision.** The submission row is written before the model is called and
marked `grading`. A failure updates it to `failed` with the Vietnamese reason
and rethrows; the text is already saved either way.

**Consequence.** The learner can reopen a failed submission, read why, and
resubmit. `WritingSubmission.status` and `errorMessage` in §5.6 exist for
exactly this and are now used rather than always holding `graded`.

## Phase P4 — Speaking

### D-051 · Pronunciation is scored at the word level, and the limit is stated

**Context.** §9.3 describes Azure Pronunciation Assessment, which returns a
score per phoneme. Azure needs a card. Gemini transcribes for free but returns
words, not phonemes.

**Decision.** `packages/scoring/src/speech.ts` aligns the transcript against the
reference with the same Needleman-Wunsch used for dictation and scores each
word: heard exactly is 100, heard as something else scores by edit distance
floored at 20, not heard at all is an omission at 0. Completeness and fluency
come from the existing §9.3 helpers. Phoneme-level issues are **inferred** —
from omissions, and from which drill the learner failed, since each drill is
written to isolate one sound from the §7.6.3 table.

**Consequence.** Omitted final consonants, dropped words and pacing are caught
well. What is caught poorly is substitution, and the reason is worth recording:
**the transcription model repairs pronunciation on its own.** Fed synthetic
audio of "I sink sree sings", it returned "I think three things" despite being
told not to. The prompt has since been rewritten to insist on literal
transcription at temperature zero, and `pnpm check:stt` exists to verify that
against the live API — it had not been re-run when this was written, because the
free quota was spent. Until it passes, th→s and v→y errors are under-reported.

### D-052 · Prosody is null, not zero

**Context.** §9.3 weights prosody at 15 percent of the total. Nothing in this
pipeline measures intonation.

**Decision.** `prosodyScore` is stored as null and `overallWithoutProsody`
redistributes its weight across accuracy, fluency and completeness. The UI shows
"chưa đo được" rather than a number.

**Consequence.** Scoring it zero would cost every learner fifteen points for
something nobody measured; scoring it a hundred would flatter every learner by
the same amount. A visible gap is the honest third option, and it becomes a real
number the moment a provider that measures prosody is configured.

### D-053 · Speech chooses its provider separately from text

**Context.** Gemini is the only free provider that does speech. Running the
tutor and writing grader on the same key means a chatty afternoon exhausts the
quota that pronunciation scoring depends on — which is exactly what happened
while building P3 and P4.

**Decision.** `AI_SPEECH_PROVIDER` and `AI_SPEECH_API_KEY` are separate from
`AI_PROVIDER` and `AI_API_KEY`. Text can run on Groq, GitHub Models,
OpenRouter or Ollama while speech stays on Gemini with its own key and its own
quota. Unset means "same as text", so a single-provider setup needs no extra
configuration. `GeminiProvider` takes a role so the two instances cannot read
each other's key.

**Consequence.** Two free tiers instead of one, with no rate-limit
circumvention: each provider is used within its own terms. It also fixed a bug
found on the way — `isProviderConfigured` reported speech as available whenever
an Azure or ElevenLabs key was present, though neither has an implementation.
Only providers that are actually built now count, so the record button cannot
light up on a capability that does not exist.

### D-054 · Recordings are scored and discarded

**Context.** `SpeakingAttempt.audioUrl` implies stored audio, and no object
store is configured.

**Decision.** The recording is sent as base64, transcribed, scored, and dropped.
`audioUrl` is written empty. The transcript, the per-word scores and the
detected issues are kept, which is everything the learner and the analytics
page actually read.

**Consequence.** No storage bill, no retention policy to write, and no archive
of voice recordings to secure — which for audio of a learner's voice is a
feature rather than a shortcoming. Replaying an old attempt is not possible;
if that is wanted later, `audioUrl` is already in the schema for it.

### D-055 · A drill's focus must match the §7.6.3 table, checked at seed time

**Context.** The drill recommender maps a learner's weak phonemes to
`drillFocus` values. A drill whose focus is misspelled would simply never be
recommended, and nothing would say so.

**Decision.** `seedSpeaking` throws on any focus that is not in
`VIETNAMESE_ERROR_PATTERNS`, listing the valid ones, and warns about any error
pattern with no drill covering it.

**Consequence.** The seed output is a coverage report: all nine Vietnamese
error groups have drills, and adding a tenth pattern without content fails
loudly rather than producing an empty recommendation list.

---

## Open questions from §17, answered by default

| # | Question | Assumption in force |
|---|----------|---------------------|
| 1 | Monthly AI/Speech budget | None set. Every provider is optional: without `ANTHROPIC_API_KEY` / `AZURE_SPEECH_KEY` the app reports the feature as unconfigured instead of failing, and the fallback scorer in `packages/scoring` covers pronunciation. |
| 2 | Solo or team | Confirmed: NestJS stays a separate service, per §4.2. |
| 3 | Deadline | None given. Phases run in the §13 order. |
| 4 | Existing content | None supplied. Seed content is authored from public-domain and open-licence sources, recorded in `content/LICENSES.md`. |
| 5 | Product name and domain | "Sprout" as in the specification; no domain chosen. |

---

## Phase P6 — Ngăn tiếng Trung

### D-101 · Tiếng Trung là một ngăn riêng, không mở rộng kho tiếng Anh

**Context.** Yêu cầu: thêm tiếng Trung vào Sprout, chia ngăn với tiếng Anh, dạy
từ số không lên HSK 6, và có tài liệu tập viết in ra giấy A4. Kèm ràng buộc rõ
ràng từ chủ dự án: **không đụng gì tới phần tiếng Anh**.

**Decision.** Ngăn tiếng Trung dùng model, route và kho nội dung riêng hoàn toàn.

- Schema thêm `Hanzi`, `ChineseWord`, `ChineseWordHanzi`, `ChineseExample`,
  `UserChineseWord`, `UserHanzi`, enum `LearningTrack` và `HskLevel`. Không sửa
  một cột nào của `Word`, `Topic`, `WordSense`, `UserWord`.
- `UserSettings` thêm ba cột (`activeTrack`, `hskTarget`, `hanziPerDay`), đều có
  giá trị mặc định nên mọi tài khoản cũ giữ nguyên hành vi.
- Route nằm dưới `/chinese/*`; route tiếng Anh không đổi đường dẫn nào.
- Chỉ hai tệp dùng chung bị sửa, và đều theo hướng chỉ thêm: `app-nav.ts` thêm
  `CHINESE_SIDEBAR_ITEMS`, và `(app)/layout.tsx` chọn danh sách điều hướng theo
  đường dẫn rồi chèn `TrackSwitcher`.

**Reason.** `Word` gắn chặt với tiếng Anh: `cefr`, `ipaUs`, `ipaUk`,
`stressPattern`, `PartOfSpeech`. Tiếng Trung cần chữ Hán, pinyin có thanh, âm
Hán Việt, số nét, bộ thủ. Nhét chung một bảng thì mỗi hàng nửa số cột để trống
và mọi truy vấn đều phải lọc thêm điều kiện ngôn ngữ — hỏng cả hai ngăn.

### D-102 · Nội dung HSK dựng từ bộ dữ liệu mở, nghĩa tiếng Việt ghép từ ba nguồn

**Context.** HSK 2.0 có 5000 từ. Soạn tay từng từ kèm pinyin và nghĩa tiếng Việt
là không khả thi.

**Decision.** `scripts/chinese/build-content.mjs` dựng `content/chinese/*.yaml` từ:

| Nguồn | Dùng cho | Giấy phép |
|---|---|---|
| complete-hsk-vocabulary | chữ, pinyin, phồn thể, tần suất, từ loại, nghĩa Anh | MIT |
| VietPhrase | nghĩa tiếng Việt theo từ | từ điển cộng đồng |
| Thiều Chửu | nghĩa tiếng Việt theo chữ | từ điển cộng đồng |
| hanviet-pinyin-wordlist | âm Hán Việt theo chữ + thanh | dữ liệu mở |
| hanzi-writer-data | đường nét bút từng chữ | Arphic Public License |

Kết quả: 4991 từ và 2632 chữ, **không từ nào thiếu nghĩa tiếng Việt hay âm Hán
Việt**. 86 từ bộ từ điển không phủ được thì soạn tay trong
`scripts/chinese/overrides.json`.

**Ba cái bẫy đã phải xử lý, ghi lại để lần sau khỏi vấp:**

1. `forms[0]` của bộ HSK thường là âm hiếm — 个 ra `gě`, 都 ra `Dū`, 上 ra
   `shǎng`. Phải bỏ qua các mục CC-CEDICT mở đầu bằng "used in", "variant of",
   "surname" mới lấy đúng âm người học cần.
2. `hanviet.csv` đánh khoá theo chữ **phồn thể**, nên tra 这 trượt, phải đổi sang
   這. Bảng giản↔phồn dựng từ chính bộ HSK, và phải chọn dạng xuất hiện nhiều
   nhất: 词 vừa ứng với 詞 vừa ứng với biến thể hiếm 䛐.
3. Khoá tra âm Hán Việt phải giữ số thanh. Bỏ số đi thì 好 `hao3` "hảo" bị
   `hao4` "hiếu" đè mất.

**Consequence.** Nghĩa lấy máy từ VietPhrase đôi khi hơi thô vì bộ này vốn soạn
cho dịch truyện. Sửa bằng cách thêm mục vào `overrides.json` rồi dựng lại, không
sửa thẳng tệp YAML.

### D-103 · Bảng tập viết A4 vẽ bằng đường SVG, in qua trình duyệt

**Context.** Cần "tài liệu tập viết, tất cả các chữ trên một tờ A4, tải về in ra".

**Decision.** Trang `/chinese/worksheet` dựng tờ A4 bằng HTML với `@page { size: A4 }`,
người dùng bấm In rồi chọn "Lưu thành PDF" của trình duyệt.

- Chữ vẽ bằng đường SVG lấy từ hanzi-writer-data, **không dùng phông chữ**. Nhờ
  vậy tờ in ra giống hệt nhau trên mọi máy, kể cả máy không cài phông tiếng Trung.
- Nét bút để ở tệp tĩnh `public/hanzi-data/<chữ>.json` chứ không nhét vào cột
  `Json` của bảng `Hanzi`: mỗi chữ vài KB, để trong DB thì mọi truy vấn danh sách
  đều kéo theo hàng megabyte vô ích.
- Không thêm thư viện sinh PDF. Trình duyệt đã in được A4 đúng khổ, thêm
  Puppeteer hay pdfkit chỉ tốn phụ thuộc và bộ nhớ trên một máy vốn đã chật.
- Mọi kích thước dùng `mm` để bản xem trên màn hình và bản in khớp nhau.

**Consequence.** `print-color-adjust: exact` là bắt buộc — thiếu nó trình duyệt
bỏ luôn chữ mẫu mờ và nét kẻ ô cho "tiết kiệm mực", tờ giấy in ra thành tờ trắng.

### D-104 · Nền danh thắng dùng ảnh 4K phóng chậm, không dùng video

**Context.** Yêu cầu nền động 4K cảnh đẹp Trung Quốc phía sau ngăn tiếng Trung.

**Decision.** Tám ảnh 3840px tải sẵn về `public/scenery/`, mỗi cảnh vừa phóng
chậm vừa trôi ngang rồi tan sang cảnh kế (Ken Burns). Nguồn Wikimedia Commons,
ghi công và giấy phép nằm trong `public/scenery/manifest.json` và hiện ở góc màn hình.

**Reason.** Một tệp video 4K mười giây nặng vài trăm megabyte và giải mã liên tục
suốt buổi học — máy phát triển hiện chỉ còn khoảng 0,3 GB RAM trống, thêm luồng
giải mã video là treo. Ảnh tĩnh phóng chậm cho cảm giác chuyển động tương đương,
tổng dung lượng 24 MB, và sắc nét ở mọi cỡ màn hình. Người bật "giảm chuyển
động" trong hệ điều hành thì nền đứng yên.

### D-105 · Máy phát triển chạy bản production, không chạy `next dev`

**Context.** Máy có 7,7 GB RAM và thường chỉ còn 0,3 GB trống. Ở chế độ dev,
Next biên dịch từng trang lúc người dùng bấm vào: trang `/login` mất **hơn 180
giây** và thường timeout hẳn.

**Decision.** Trên máy này chạy `next build` rồi `next start`. Sau khi đổi, `/login`
trả về trong **0,019 giây**.

**Consequence.** Mỗi lần sửa mã nguồn phải build lại (2–4 phút) thay vì hot
reload. Đổi lại app dùng được. Cũng vì lý do bộ nhớ mà `tsc` và `tsup` phải chạy
với `NODE_OPTIONS=--max-old-space-size`, nếu không sẽ chết vì hết heap.

### D-106 · Mỗi mục điều hướng một danh thắng, ảnh 4K làm nền cả hai ngăn

**Context.** Chủ dự án thấy giao diện "nhạt nhẽo" và muốn nền động 4K danh lam,
mỗi mục sidebar một cảnh khác nhau.

**Decision.** 32 ảnh 3840px tải sẵn về `public/scenery-vn/` (16 cảnh Việt Nam,
nền ngăn tiếng Anh) và `public/scenery/` (16 cảnh Trung Quốc, nền ngăn tiếng
Trung). `components/layout/scene-map.ts` ánh xạ đường dẫn sang cảnh, khớp tiền
tố dài nhất trước nên `/chinese/hsk/HSK1` lấy cảnh của `/chinese/hsk`.

Nguồn Wikimedia Commons, ghi công và giấy phép hiện ở góc dưới màn hình.

**Consequence.** Phần nội dung chuyển thành một "tờ giấy" trong mờ đặt trên ảnh
(`bg-[var(--bg)]/82` + `backdrop-blur`). Vì vậy các trang tiếng Trung phải bỏ
bảng màu chữ-trắng-trên-kính-đen cũ và chuyển hết sang token dùng chung, nếu
không chữ trắng nằm trên nền kem sẽ mất hút ở giao diện sáng.

### D-107 · Bộ icon vẽ tay thay cho emoji, và tô cả các bề mặt trình duyệt

**Context.** Điều hướng dùng emoji làm icon. Chủ dự án muốn thêm icon và màu.

**Decision.** `components/ui/icon.tsx` — 22 icon vẽ trên lưới 24, nét 1.75, tô
bằng `currentColor`. Mỗi mục điều hướng mang một `tint` lấy từ bảng token, nền
mục đang mở pha từ chính sắc đó qua `color-mix`.

Đồng thời tô các bề mặt do trình duyệt vẽ: vệt bôi đen, con trỏ nhập, thanh
cuộn, vòng focus.

**Reason.** Emoji không phải hệ icon: mỗi hệ điều hành vẽ một kiểu, độ dày nét
vênh nhau, màu do phông quyết định nên không theo được bảng màu. Còn thanh cuộn
và vệt bôi đen mặc định thì không thuộc hệ thiết kế nào — đây là chỗ rẻ nhất để
một trang trông như được thiết kế thay vì được lắp ghép.

Hai điểm này lấy từ skill thiết kế `impeccable` (clone ở `E:\skills\impeccable`),
cùng với việc bỏ vạch màu `border-left` 3px ở thẻ thanh điệu — vạch màu ở mép là
trang trí, không dạy gì; giờ màu thanh điệu nhuộm cả nền thẻ.

### D-108 · Nội dung tham khảo tĩnh của ngăn tiếng Trung nằm ở frontend

**Context.** Ngữ pháp và bài đọc tiếng Trung cần chỗ để chứa. Kho tiếng Anh đi
theo đường YAML → seed → cơ sở dữ liệu → API.

**Decision.** Ngữ pháp (`content/chinese-grammar.ts`, 26 điểm) và bài đọc
(`content/chinese-reading.ts`, 6 bài) nằm thẳng trong frontend dưới dạng module
TypeScript. Bài "Sắp xếp câu" sinh tại chỗ từ chính hai tệp này.

**Reason.** Nội dung này không có trạng thái theo người học, không cần lọc hay
phân trang, và luôn tải cùng trang. Đưa xuống DB thì phải thêm bảng, seed, API
và một vòng đi về mạng mà không đổi lấy được gì.

**Consequence.** Khi nào cần chấm điểm và lưu tiến độ từng bài ngữ pháp thì phải
chuyển xuống DB. Từ vựng thì đã ở DB sẵn vì có lịch ôn theo người học.

### D-109 · Gia sư AI tiếng Trung dùng lại endpoint của ngăn tiếng Anh

**Decision.** `/chinese/tutor` gọi thẳng `POST /tutor/ask`, chèn thêm một dòng
nêu rõ đây là câu hỏi tiếng Trung.

**Reason.** Hạn mức theo ngày, ghi log dùng AI và khoá API riêng của người học
đều đã nằm ở module đó; dựng đường AI thứ hai là phải chép lại cả ba.

**Consequence.** Lời nhắc gốc viết cho người dạy tiếng Anh, nên phải chèn dòng
bối cảnh ở mỗi câu hỏi. Nếu chất lượng trả lời không đạt thì bước tiếp theo là
thêm `kind: 'chinese'` vào `ConversationKind` và tách lời nhắc riêng.

### D-110 · Bề mặt trong mờ để ảnh danh thắng còn nhìn thấy được

**Context.** Sau D-106, phần nội dung là một tờ giấy đục 82% và mọi thẻ bên
trong dùng `--surface` màu trắng đặc. Kết quả là ảnh nền chỉ hở ra ở hai mép,
đúng thứ chủ dự án phản đối.

**Decision.** Cho chính token bề mặt độ trong, thay vì sửa lớp CSS ở từng trang:

| Token | Trước | Sau |
|---|---|---|
| `--surface` | `#ffffff` | `rgb(255 255 255 / 0.55)` |
| `--surface-alt` | `#f2efe6` | `rgb(242 239 230 / 0.6)` |
| `--surface-sunken` | `#ede9dc` | `rgb(237 233 220 / 0.68)` |
| tờ giấy nền | `/82` + `blur-2xl` | `/14` + `blur-[2px]` |
| lớp phủ ảnh | tối 82→90% | veil sáng 16→28% |

**Các con số này chọn bằng tính toán, không phải ướm mắt.** Ghép bốn lớp
(ảnh → veil → tờ giấy → thẻ) rồi tính độ sáng cuối và tỉ lệ tương phản với màu
chữ `--text`, lấy trường hợp xấu nhất là ảnh tối nhất. Bộ giá trị đầu cho tương
phản 11,4:1 nhưng ảnh chỉ lọt qua 13% — phủ dày quá. Bộ đang dùng cho **31% ảnh
lọt qua** ở tương phản **7,4:1**, vẫn trên xa ngưỡng 4,5:1 của WCAG AA.

Thêm `--surface-solid` cho những chỗ bắt buộc phải kín: sidebar và thanh dưới.
Giấy tập viết khi in vốn đã dùng `bg-white` nên không đụng tới.

**Reason.** Sửa ở tầng token thì hơn ba mươi trang đổi theo cùng lúc và không
trang nào bị bỏ sót. Nhoè mạnh cũng phải bỏ: `blur-2xl` làm ảnh thành một mảng
màu, nhìn không ra danh thắng nữa.

**Lớp phủ phải đổi theo giao diện.** Trước đây lớp phủ luôn tối. Nhưng ở giao
diện sáng, chữ là chữ đen trên nền sáng — dìm ảnh tối lại chính là kéo tụt tương
phản của chữ. Nên `--scenery-scrim` giờ là veil **sáng** ở giao diện sáng và
veil **tối** ở giao diện tối.

**Consequence.** Thẻ lồng trong thẻ sẽ cộng dồn độ đục. Hiện chưa chỗ nào lồng
nên không sao, nhưng nếu sau này có thì thẻ trong phải dùng nền không màu.

### D-111 · Ba mức chữ xám gộp còn hai, vì nền ảnh không cố định

**Context.** Sau D-110, chủ dự án báo "chữ màu ghi mờ quá". Đo lại thì đúng: tôi
đã tính tương phản bằng màu chữ chính `--text` mà bỏ sót hai mức xám.

Trên nền xấu nhất (ảnh tối, các lớp trong mờ chồng lên):

| Màu chữ | Trước | Chuẩn AA |
|---|---|---|
| `--text` #1f2a24 | 7,6:1 | đạt |
| `--text-muted` #5f6e64 | **2,7:1** | trượt |
| `--text-subtle` #8b9990 | **1,5:1** | trượt |

**Decision.** Tăng độ đục thêm 10 điểm (`--surface` 0,55 → 0,65, tờ giấy nền
`/14` → `/24`) **và** sửa hẳn hai màu xám:

- Giao diện sáng: `--text-muted` #5f6e64 → **#4e5a52**, `--text-subtle`
  #8b9990 → **#515954**. Cả hai đạt 4,6:1.
- Giao diện tối: `--text-subtle` #74887c → **#97b1a1**.

**Reason.** Chỉ tăng độ đục là không đủ — tính ra chữ ghi mới lên 3,4:1, vẫn
trượt. Gốc rễ nằm ở chỗ ba mức xám ấy vốn dựng cho nền đục cố định; đặt lên nền
ảnh thay đổi liên tục thì mức nhạt nhất không cách nào đạt chuẩn.

**Consequence.** Ở giao diện sáng, `--text-muted` và `--text-subtle` giờ gần
bằng nhau, tức là **chỉ còn hai mức chữ chứ không phải ba**. Phần chữ ít quan
trọng nhất từ nay phân biệt bằng cỡ chữ và độ đậm, không phân biệt bằng màu nhạt
hơn nữa. Đây là đánh đổi bắt buộc: giữ đủ ba mức thì mức thứ ba không đọc được.

Ảnh nền lọt qua 21% (trước đó 30% nhưng chữ không đọc nổi).

### D-112 · Nội dung ôn thi IELTS / TOEIC / Aptis bám đúng cấu trúc từng Part

**Context.** Codex đã dựng xong khung `exam-prep` (schema, API, trang web,
migration) nhưng chưa sinh nội dung, nên `content/exams/` trống và endpoint
`GET /exam-prep` báo lỗi 500. Yêu cầu của chủ dự án: ba kỳ thi, đủ bốn kỹ năng,
chia theo mức điểm, và **đề luyện phải khó hơn mức điểm thật**.

**Decision.** 12 gói `content/exams/{examId}-{levelId}.json`, mỗi gói 12 từ vựng
và 11 hoạt động: 3 đọc, 3 nghe, 2 viết, 3 nói.

Mỗi hoạt động gọi đúng tên Part của đề thật, không dùng nhãn chung chung:

| Kỳ thi | Đọc | Nghe | Viết | Nói |
|---|---|---|---|---|
| IELTS | Passage 1/2/3 | Section 1/2/4 | Task 1 (20′/150 từ) · Task 2 (40′/250 từ) | Part 1/2/3 |
| TOEIC | Part 5/6/7 | Part 2/3/4 | Respond to Request · Opinion Essay | Describe Picture · Respond Using Info · Propose Solution |
| Aptis | Part 1/3/4 | ba đoạn ghi âm ngắn | Part 3 (chat) · Part 4 (hai thư) | Part 1/2/4 |

Thời lượng quy từ tốc độ làm bài thật rồi **siết lại**: IELTS Reading 75 giây một
câu thay vì 90, TOEIC Part 5 18 giây một câu thay vì 20. Đề luyện khó hơn còn ở
chỗ đáp án nhiễu đều đúng một phần, câu hỏi diễn đạt lại thay vì lặp từ khoá của
bài, và mỗi bài nghe đều cài ít nhất một chỗ người nói tự đính chính.

**Consequence.** Ba điểm cần nhớ khi làm tiếp:

- `ExamPrepService` **cache gói trong bộ nhớ** theo khoá `{exam}-{level}`. Sửa
  tệp JSON xong phải khởi động lại API, nếu không vẫn phục vụ bản cũ. Đã vấp
  đúng lỗi này: một gói bị cache từ lúc mới có 2 bài nói.
- `scripts/exams/check-packs.mjs` kiểm tra 12 gói bằng chính schema của API, nên
  soạn tới đâu chạy tới đó. Nó đã bắt được một `id` gõ nhầm sang chữ Kirin.
- `scripts/exams/fix-newlines.mjs` thoát các dấu xuống dòng thật lọt vào chuỗi
  JSON — lỗi rất dễ mắc khi soạn văn bản nhiều đoạn, và chỉ lộ ra lúc `JSON.parse`.
