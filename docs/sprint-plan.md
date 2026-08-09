# CaseMap — feature audit and sprint plan

Audited against the four features the portal is meant to provide. Written
2026-08-08 against commit `2cea774`.

Estimates are rough and assume a small team (1–2 engineers) on two-week
sprints. They are for sequencing, not for committing to a date.

---

## 1. Audit: what already exists

Two of the four features are largely built. One has a specific missing piece.
One does not exist at all.

| # | Feature | State | Detail |
|---|---|---|---|
| 1 | Community Chat | **Mostly built** | Feed, posts, likes, comments, topic rooms with live messages, handles/profiles |
| 2 | Story & Document Checker | **Partly built** | Inconsistency detection works; advising *which documents to obtain* does not exist |
| 3 | Document upload + correspondence | **Built, under-surfaced** | Upload, OCR and doc↔story adjudication all work, but the verdict is buried |
| 4 | Ask a Lawyer | **Not built** | Booking a consultation. No availability, booking or appointment concept exists |

### 1. Community Chat — mostly built

Working today: `community.feed` (posts, likes, comments), `community.rooms`
and `community.rooms.$slug` (topic rooms with Supabase realtime on
`community_messages`), `community.profile` (handle + display name gating).
Backed by `community-service.ts`.

Missing: `community_dm_threads`, `community_reports` and `community_blocks`
exist as tables **and appear nowhere in application code** — they are
referenced only in the generated `types.ts`. So there are no direct messages,
no reporting, and no blocking. For a peer-support space used by people
discussing persecution, the absence of report/block is the more serious of the
two.

### 2. Story & Document Checker — the advisor is missing

Working today:
- Writing the story: 15 structured sections (`app.story.$section`), append-only
  answers, voice input.
- Inconsistency detection: `analyze-consistency.functions.ts` compares facts
  across sources and raises `clarification_items` — this covers the dates,
  places, times and narration cases in the brief.
- Fact extraction and timeline construction: `extract-facts`, `build-events`.

Two gaps:

**(a) "Upload your story" is only partly true.** You can type a story, or
upload a document/voice note that gets OCR'd and mined for facts. There is no
flow that accepts a whole written narrative — pasted or uploaded as a file —
and treats it *as the story*, mapping it back onto the 15 sections.

**(b) "Advise documentation required based on your story" does not exist.**
This is the clearest missing feature in the brief. `analyze-gaps.functions.ts`
is explicitly rules-only ("RULES ONLY. No model call.") and emits exactly four
mechanical observations:

```
document_no_event     document uploaded but not linked to any event
event_no_document     event with no document attached
missing_translation   non-English document without a translation
unanswered_section    story section not started
```

It can say *"this event has no document"*. It cannot say *"for a detention in
March you would normally want a release paper, a medical record, or a letter
from someone who visited you"*. That advisory layer has to be built.

### 3. Document upload + correspondence — built, but buried

`map-evidence.functions.ts` already does what the brief asks. It pairs each
document against each event and has the model adjudicate a single relationship
from a fixed enum:

```
directly_supports · partially_supports · background_context
related_person_or_org · potential_conflict · date_needs_clarification
identity_needs_clarification · relevance_uncertain · not_connected
requires_professional_review
```

That is "does this document correspond with your story", including the
disagreement case (`potential_conflict`).

The gap is presentation, not capability: the verdict lives on the Evidence Map
screen, and nothing appears on the Documents screen after an upload. Someone
who uploads a passport page is never told what the system made of it.

### 4. Ask a Lawyer — does not exist

**Scope clarified 2026-08-08:** this is **booking a consultation** with a
lawyer, not a live advice channel inside the platform. That changes the shape
of the work and most of the risk. What follows is written against the booking
interpretation.

What exists is adjacent but is not this feature:

- `app.questions` generates *questions to ask a lawyer*. It produces a list to
  take to an appointment. It does not send anything to anyone.
- `sharing-service.ts` lets an applicant grant a verified professional scoped,
  time-limited access to the case, and `listVerifiedProfessionals()` already
  returns a directory of them with jurisdiction.
- Professionals review summaries (Gate 2) and write `professional_notes` —
  the RLS policy is `prof_notes_select_same_org`, so those stay internal to
  the firm.

Missing: any notion of availability, a booking, or an appointment. There is no
`consultations` table, no scheduling, no confirmation, no reminders.

Because advice happens in the consultation rather than through CaseMap, the
liability question that previously blocked this is largely settled — the
platform is an introducer, not the source of advice. Three narrower questions
remain, none of which blocks design work:

1. **Does CaseMap take payment for the consultation?** If yes, that brings
   refunds, cancellations and consumer-protection obligations, and a payment
   processor. If the lawyer bills directly, the booking is just a calendar.
2. **What case data travels with a booking?** The safe default is nothing
   beyond what the applicant explicitly grants through the existing
   `sharing_grants` flow — booking should not become a side channel that
   bypasses it.
3. **Listing a professional is a representation.** `professionals.verified` is
   currently set by hand with nothing checking a licence, which is thin if the
   product is putting names in front of asylum claimants.

---

## 2. Also outstanding (not part of the four, but blocking)

| Item | Impact | Effort |
|---|---|---|
| Google OAuth not enabled in Supabase | Sign-in button fails with a "not configured" message | ~30 min, dashboard only |
| `STT_API_KEY` unset | Voice notes fail; the rest of the app is unaffected | ~15 min once a key exists |
| Arabic ~11% translated | 424 keys missing, 190 still English. Nav is translated; body copy is not | Needs a professional translator, not engineering |
| No professional verification flow | `professionals.verified` is set by hand; nothing checks a licence | 1 sprint if Ask a Lawyer ships |

---

## 3. Sprint plan

### Sprint 1 — Finish the Story Checker
**Goal:** the checker does everything the brief describes, including advising
on documents.

| Ticket | Description | Est. |
|---|---|---|
| S1-1 | **Narrative intake.** Paste or upload a whole story (txt/docx/pdf). Extract, then map passages onto the 15 sections for confirmation. Reuses `extract-facts`. | 5d |
| S1-2 | **Documentation advisor.** New server function: given confirmed facts and events, propose document types worth obtaining, each tied to the event that motivates it. Model-backed, guardrailed like the other AI calls, written to `missing_info_items` (`related_event_id` and `suggested_action` already exist). | 5d |
| S1-3 | **Advisor UI** on Clarify: grouped by event, each item dismissible with a reason, never phrased as a requirement. | 3d |
| S1-4 | Guardrail tests for S1-2: no legal conclusions, no invented document types, no advice about *whether* to claim. | 2d |

**Acceptance:** a seeded case with a detention event yields concrete,
event-linked document suggestions; guardrails reject the forbidden phrasings.

**Watch:** the advisor sits close to legal advice. It should name document
*types* and never assess whether they help a claim succeed. Reuse the existing
refusal vocabulary checks from `map-evidence`.

---

### Sprint 2 — Surface correspondence; make Community safe
**Goal:** upload feedback becomes visible, and the community gets the safety
controls its schema already anticipates.

| Ticket | Description | Est. |
|---|---|---|
| S2-1 | **Per-document verdict.** After processing, show on the Documents screen what the document appears to relate to, using existing `evidence_event_links`. | 4d |
| S2-2 | **Conflict surfacing.** `potential_conflict` and `date_needs_clarification` raise a visible, non-alarming prompt rather than sitting silently in the map. | 3d |
| S2-3 | **Report + block.** Wire `community_reports` and `community_blocks`: report a post/message, block a user, hide blocked content from feed and rooms. | 4d |
| S2-4 | **Moderation queue** for an admin role. | 3d |

**Acceptance:** uploading a document that contradicts a stated date produces a
visible, calm prompt; a blocked user's posts disappear from both surfaces.

**Watch:** S2-2 is a wording problem as much as an engineering one. "This does
not match what you wrote" is accusatory to someone recounting trauma. Draft the
copy before building.

---

### Sprint 3 — Ask a Lawyer (booking)
Unblocked: advice happens in the consultation, not through the platform.
Confirm the payment question (1 above) before S3-4 — it is the only ticket
that depends on it.

| Ticket | Description | Est. |
|---|---|---|
| S3-1 | Schema: `consultation_slots` (professional availability) and `consultations` (booking, status, jurisdiction, language), RLS scoped to the two parties. | 3d |
| S3-2 | Professional side: publish availability, see and manage bookings. | 4d |
| S3-3 | Applicant side: browse professionals by jurisdiction and language, pick a slot, book. Offer to carry the "Questions for My Lawyer" list into the appointment. | 4d |
| S3-4 | Booking confirmation and what it does and does not include — explicitly not legal advice, and not case access unless separately granted. Payment only if (1) says so. | 3d |
| S3-5 | Confirmations, reminders and cancellation, by email at minimum. | 3d |

**Acceptance:** an applicant books a slot with a verified professional in
their jurisdiction; the professional sees it; no case data is visible to that
professional unless a `sharing_grant` exists — verified by an RLS integration
test alongside the existing ones.

#### Delivered

S3-1 to S3-4 are built and verified end to end against the live project, both
sides, with a real booking and a real cancellation.

- `consultation_slots` and `consultations` (`20260808180000`). A consultation
  has no `case_id` and no column large enough to carry case material; `topic`
  is capped at 300 characters. Only verified, active professionals can be
  listed or booked, enforced by RLS rather than by the client.
- `/app/consultations` — browse by place and language, pick a slot, confirm
  behind the four disclosures (no case access, advice happens in the
  appointment, the lawyer bills directly, cancel any time), carry the
  "Questions for My Lawyer" list into the appointment.
- `/pro/availability` — publish and withdraw times, see bookings, edit the
  languages and blurb the directory shows. A time someone has taken cannot be
  withdrawn; the booking must be cancelled first.
- Acceptance test in `rls.integration.test.ts`: books a real slot, proves the
  professional sees the booking and still reads zero rows from every
  case-scoped table, that `consultations` has no `case_id` to select, that a
  third applicant sees nothing, and that the slot cannot be taken twice.

Two things had to be fixed to get there, both pre-existing:

- **`professionals` was unreadable by everyone** (`42P17`, infinite recursion:
  its SELECT policy read `sharing_grants`, whose SELECT policy read
  `professionals`). Every `/pro/*` screen begins by reading that table, so this
  was breaking more than booking. Fixed in `20260808200000` with SECURITY
  DEFINER helpers, the same pattern `has_role` already used.
- **The directory had nowhere to read from.** An applicant browsing for the
  first time can see no `professionals` row by design. Added the
  `bookable_professionals` view: five fields, verified and active only, so
  browsing does not expose licence numbers or organisation membership.

A booking now also carries `applicant_display_name` (`20260808220000`) — the
name the applicant types at the point of booking. `profiles` is own-row only,
so before this a professional saw an appointment with no idea who was coming,
while both screens promised them a name.

#### Not delivered

**S3-5 (email).** Cancellation works, in-app, from either side. Confirmations
and reminders **by email do not exist** — there is no transactional email
infrastructure in this project at all: no provider, no credentials, no
templates, no send path. Someone who books and closes the tab has nothing to
remind them. This needs a provider decision (Resend, Postmark, SES) before it
can be built, and is roughly 3d once that is made.

**Still the real exposure: S4-1.** `professionals.verified_at` is still set by
hand in SQL. Everything above enforces "only verified professionals can be
booked" precisely and provably — but nothing yet checks that a verified
professional holds the licence they claim. In a booking product that is the
liability, and it is a Sprint 4 ticket.

---

### Sprint 4 — Ask a Lawyer (trust) + Community DMs

| Ticket | Description | Est. |
|---|---|---|
| S4-1 | Professional verification: licence number, jurisdiction, evidence upload, admin approval before `verified` is set. | 5d |
| S4-2 | Lawyer directory: browse by jurisdiction and language, with what each offers. | 4d |
| S4-3 | Direct messages (`community_dm_threads`), with block enforcement from S2-3. | 4d |
| S4-4 | Response-time expectations and stale-request handling. | 2d |

**Acceptance:** an unverified professional cannot appear in the directory or
answer a consultation.

#### Delivered

All four tickets, verified end to end against the live project.

**S4-1 — verification.** The hole this sprint existed to close was worse than
the plan assumed. `professionals` had `GRANT UPDATE ... TO authenticated` and a
policy of `auth.uid() = user_id` with no column restriction, so a professional
could set their own `license_number`, `license_jurisdiction` and `verified_at`.
Confirmed by doing it: signing in as the seed professional and rewriting the
licence number succeeded. Row-level security cannot restrict *which columns* an
update touches, so the fix is a trigger
(`professionals_guard_privileged_columns`). A professional may now edit how they
appear — display name, languages, blurb, reply time — and nothing else.

Around that: `professional_verifications` (submission, evidence, decision, who
decided and when), a private `professional-evidence` bucket with no UPDATE or
DELETE policy so a submission stays as submitted, `/pro/verification` for
sending details, and `/admin/professionals` for reviewing them. Approval and
revocation go through two SECURITY DEFINER functions that refuse anyone without
`platform_admin`. Revoking also withdraws the professional's future slots, and
deliberately leaves existing bookings visible to both parties so they can be
cancelled rather than silently vanishing.

**S4-2 — directory.** Browsing by jurisdiction and language shipped in Sprint 3.
Added what someone actually needs in order to choose: when the licence was
checked (the platform's claim, not the professional's) and the reply time they
state.

**S4-3 — direct messages.** `community_dm_threads` and the DM half of
`community_messages` were written in the first migration and had sat unused
ever since. Now `/community/messages`, with realtime, and blocking enforced by
the existing insert policies — which re-check the pair on every message, so a
block stops the next message, not just the next conversation.

**S4-4 — response expectations and staleness.** Professionals state a usual
reply time. A booking's end is derived from its slot (`consultations_with_slot`,
`is_past`) rather than written by a scheduled job, so an appointment that has
happened stops looking like one that is coming; either party can close it out
with `complete_consultation()`, which refuses to run before the end time.

Three pre-existing faults surfaced and are fixed here:

- **`hitsForbiddenVocabulary` matched substrings, not words.** The entry `"lie"`
  fired on "client", "believe", "relief" and "earlier". A vocabulary hit
  discards the entire model response, so ordinary extractions were being thrown
  away for containing the word "client". Found when the string "Earlier
  submissions" tripped the scanner in a new test. Now word-boundary matched,
  with a regression test.
- **`/community/rooms` was a layout route with no `<Outlet />`,** so opening a
  room rendered the room list instead and topic rooms were unreachable — the
  same fault found in `app.story` last sprint. Split into a layout and an index
  route.
- **A platform admin could not read `professionals` at all,** so "Currently
  listed" was always empty and revocation could not be reached from the screen.
  The decision functions run as SECURITY DEFINER and were never blocked, which
  is why this only showed up by using the page.

**Verification:** the RLS suite gains six tests — an unverified professional is
absent from the directory, their slots are invisible, they cannot be booked,
they cannot set their own `verified_at`/`active`/licence/jurisdiction, neither
they nor an applicant can approve a submission, and the queue does not leak.
Plus two for DMs: a third party (including a platform admin) reads neither the
thread nor its messages, and a block refuses sends in both directions. 14 RLS
tests pass live; 143 unit tests pass.

#### Known limits

- **A moderator cannot see a reported DM.** Reporting from a conversation files
  against the profile, and the reporter's own words are the only context, because
  RLS does not show private messages to anyone but the two participants. The
  alternative — letting moderators read private conversations — is worse. If
  reported DMs need to be reviewable, the right shape is the reporter attaching
  the specific messages they are reporting, which is a separate ticket.
- **Nothing stops an unsolicited first message.** Blocking is after the fact.
  A per-account "who may message me" setting is not built.
- **Verification is a person reading a document.** There is no integration with
  a law-society register, so an admin approving a submission is asserting they
  checked it themselves. The screen says so.

---

### Sprint 5 — Loose ends that reach a real person

Not in the original four. This sprint is what §2 and the "Known limits" notes
from Sprints 3 and 4 had accumulated: the things that would be felt by someone
actually using the product.

| Ticket | Description | Est. |
|---|---|---|
| S5-1 | Duplicate case creation: find the cause and make it impossible. | 2d |
| S5-2 | Transactional email for appointments — the S3-5 carry-over. | 4d |
| S5-3 | Who may message you, and reports that carry the messages they are about. | 3d |
| S5-4 | Make the Arabic gap measurable and stop it widening. | 1d |

**Acceptance:** twelve simultaneous callers get one case; a booking, a
cancellation and a reminder each record exactly one delivery per person; a
closed inbox refuses a new conversation without touching existing ones; a
moderator sees only the messages a reporter chose to show them.

#### Delivered

**S5-1 — the duplicate case, cause found.** Reported in an earlier sprint and
not diagnosed at the time. It is a read-then-insert race with two writers: the
`handle_new_user` trigger creates a draft case on signup, and
`getOrCreateOwnCase` creates one if it does not find one — and that function is
called from `audit-service` on sign-in and from the consent screen as well as
from route queries. The first two do not share React Query's cache, so two
copies could be in flight, both find nothing, and both insert. Reproduced in
this project's own data: the seed professional had two cases created 279ms
apart. Clarify reads the case with `.maybeSingle()`, which is why the symptom
was "No case yet" on a case that plainly existed.

Fixed in three layers: existing duplicates merged (audit history moved, and the
migration refuses to run if any duplicate holds real case material), a unique
index so a second case is impossible, and `get_or_create_own_case()` doing the
whole thing in one statement. Twelve simultaneous calls now return one id.

**S5-2 — email.** Off unless `RESEND_API_KEY` is set; without it every message
is recorded as `skipped` rather than silently dropped. Confirmation on booking,
notice on cancellation from either side, and a reminder a day or two ahead
driven by a Vercel cron. The endpoint fails closed without `CRON_SECRET` — an
open endpoint that sends mail is a way to mail people repeatedly.

The cron runs **once a day**, not hourly: Vercel's Hobby plan permits one run
per day and rejects anything more frequent at deploy time, which fails the whole
deployment rather than just the job. That is why the lookahead window is 48
hours and not 24 — with a daily sweep and a 24-hour window, an appointment at
09:00 tomorrow would miss today's run by an hour and be picked up by tomorrow's,
giving someone one hour's notice for something they may need to take time off
work for. A 48-hour window means every appointment is caught at least a day
ahead, and at most two. On a plan with hourly crons, set the schedule back to
`0 * * * *` and the window to 24; nothing else changes, because sending once is
enforced by claiming a delivery row rather than by the schedule.

Two constraints in the messages themselves: no case material (the fields they
draw on cannot hold any), and no tracking pixels, remote images or click
wrapping — all three tell a third party when a refugee opened their mail. Send
once is enforced by claiming a row in `email_deliveries` before sending, so the
hourly job reminds once; proved by running it twice.

**S5-3 — message controls.** `dm_policy` on a community profile decides who may
*start* a conversation; existing threads are untouched, because closing an inbox
should not silently end conversations already under way. And a reported
conversation now carries the specific messages the reporter ticked. A moderator
still cannot read a thread — the excerpts are copied into the report, only the
reporter can attach them, and only their own messages from that person are
offered. This is the one path by which anything private becomes visible, and
the screen says so before anything is sent.

**S5-4 — the Arabic gap, measured.** `npm run i18n:report` gives the real
number: **571 strings need a translator** — 424 missing outright and 147 present
but still in English, which the earlier "424 missing" count had not caught. Five
tests hold the line: namespaces added since Sprint 3 must be complete in both
languages, no English may sit in `ar.json` for those, the overall gap has a
ceiling that may only fall, no orphan keys, and interpolation variables must
match — `{{when}}` rendered as anything else prints a placeholder to the person
least able to work out what it meant.

#### Known limits

- **Email is built but unproven against a real provider.** Every path was
  exercised with no key configured, which exercises everything except the
  provider call itself. The first deployment with `RESEND_API_KEY` set should
  book one appointment and check the mail arrives.
- **Reminders are a single notice, one to two days ahead.** No second reminder,
  no per-person preference, no unsubscribe link — the only mail this sends is
  about an appointment the person booked themselves. The imprecise timing is a
  consequence of the daily cron the Hobby plan allows.
- **The Arabic ceiling is 430, not 0.** The check stops the gap widening; it
  does not close it. That still needs a translator.

---

### Sprint 6 — The community becomes the centre of gravity

A repositioning rather than a feature. The community moves from a side room to
the front door: CaseMap becomes a place where people going through asylum and
immigration share what they have been through, with the private case tools
alongside rather than in front.

The reasoning is about who arrives. Someone signing up today landed on a blank
form asking them to write down what happened to them — the hardest thing in
the product, on day one, before any reason to trust it. The community is the
part that is useful to a person who is not ready for that yet, and the part
where they can be useful to someone else.

| Ticket | Description | Est. |
|---|---|---|
| S6-1 | Forums: categories, titled topics, replies, activity ordering, search. | 4d |
| S6-2 | Forum screens: index, category, thread, composer, search. | 4d |
| S6-3 | Re-centre the app: sign-in lands in the community, one navigation with the forums first and the case tools as a section. | 2d |
| S6-4 | Safety for a bigger front door: what not to write in public, and the wall between community identity and case. | 2d |

**Acceptance:** a signed-in person lands in the forums, finds a category, reads
a thread and replies; the reply bumps the topic; nothing from anyone's case is
reachable from any community screen.

#### Delivered

**Topics are `community_posts` rows with a title and a category, and replies
are `community_comments`.** That is the load-bearing decision. Everything built
in Sprints 2 to 5 sits on those two tables — the moderation queue's
`hidden_at`, the `is_blocked_pair` read policy, reporting, report excerpts. A
parallel `forum_topics` table would have needed a parallel copy of all of it,
and a moderation path that only some content passes through is worse than
none.

- Ten seeded categories, named to avoid two traps: they promise no answers
  ("Legal advice") and they do not label people by status ("Refused
  claimants"). Nobody should have to file themselves under a setback to ask a
  question.
- Ordering is by last activity, not creation: a question answered this morning
  is more use than one posted this morning and ignored. A trigger maintains
  `last_activity_at` and `reply_count` so the index does not count replies per
  row.
- Search is `websearch_to_tsquery` over a generated `tsvector`, title weighted
  above body, `simple` rather than `english` — the forum is multilingual and
  English stemming applied to Arabic does more harm than none.
- Pinning is an RPC, not an UPDATE policy. A policy letting admins update posts
  would also let them rewrite the body of someone's post, which is not a power
  worth handing out to make a topic sticky. Pins apply in a category and
  deliberately not in "recently active", where they would contradict the
  heading.
- The old flat feed is a redirect. It was one chronological stream in which
  the same questions were asked weekly with the answers already scrolled away.
  The route stays because people share links.

**The composer carries the safety work.** A notice above the form, every time
rather than dismissed forever — someone who posted about housing in March is
in a different position in June when they write about the people who threatened
them. It names the specific things that identify a person rather than saying
"be careful", covers other people who cannot consent to being written about,
states the wall in both directions, and offers a direct message as the place
for what should not be public. Eighteen tests hold that copy and the wall.

**The wall itself is tested, not just asserted.** `forum-service` may not read
any case-scoped table, and may not read `profiles` — the real name given at
signup — only `community_profiles`, the handle. Every listing function must
apply both the moderator filter and the personal block filter.

**Demo content.** Fourteen topics and thirty-one replies across the categories,
written as seed data rather than poked into the database, with fixed UUID
prefixes so the whole set is removable. Seed content in a forum is not filler:
it is the first thing a new member reads, and people match the register of what
is already there. So the posts model the behaviour the notice asks for — no
names, places, dates or file numbers — and they answer each other.

#### Known limits

- **Signed-in and pseudonymous, by default.** The forums are not publicly
  readable. Opening them to search engines would bring people who need this
  and cannot yet sign up, and is also a materially different safety posture for
  a population whose posts could reach the wrong readers. That decision is not
  mine to take silently; the schema supports either.
- **No notifications.** Someone who answers a question does not know whether
  the person came back. Email exists as of Sprint 5, and a "someone replied to
  you" digest is the natural next use of it.
- **Moderation is reactive.** Reports and blocks work; nothing scans a post
  before it appears. For a forum this size that is the right trade, and it will
  not stay right as it grows.

---

### Sprint 7 — The community holds together as it grows

Two problems that only appear once people actually use a forum. Someone asks a
question, a stranger spends twenty minutes writing a careful answer, and the
person who asked never finds out — the answer sits unread and both of them
conclude the place is empty. And one account can post as fast as it can type.

| Ticket | Description | Est. |
|---|---|---|
| S7-1 | Reply notifications: in-app, block-aware, with an unread count. | 3d |
| S7-2 | A daily digest email, folded into the existing sweep, with a switch. | 2d |
| S7-3 | Look at a draft for identifying details before it becomes public. | 3d |
| S7-4 | Posting rate limits in the database. | 1d |

**Acceptance:** a reply notifies the topic author and everyone who replied
before, and nobody else; a blocked person's reply notifies nothing; a draft
containing a phone number pauses before publishing and can still be published;
a seventh topic in an hour is refused with a sentence a person can read.

#### Delivered

**Notifications are written by a trigger and never by a client.** There is no
INSERT policy on the table, deliberately — if the client could write them,
anyone could put text in front of a person who had blocked them. The trigger
fans out to the topic author and to everyone who replied before, minus the
writer, minus anyone who turned notifications off, and minus either side of a
block. Verified against the live project: `reply_to_topic` to the author,
`reply_after_you` to earlier repliers, nothing to the writer, nothing readable
by anyone else, and nothing at all once a block exists.

**The digest runs in the same daily sweep as the appointment reminders.** Not
for elegance: the Hobby plan allows very few cron entries, and one endpoint
that does the day's work is one fewer thing to discover has silently stopped.
Both jobs run under `Promise.allSettled`, so a failure in one cannot skip the
other. "Once a day" comes from stamping `emailed_at` on the notifications a
message covered, not from the schedule — the second run of the sweep found
nothing left to send.

The digest names who replied and where, and carries nothing else: no case
material, and — unlike the in-app screen — no excerpt of the reply. The app is
behind a sign-in; an inbox may be shared, read over a shoulder, or synced to a
device the person does not control.

**The draft check (S7-3) is the piece worth arguing about.** It looks for email
addresses, phone numbers, case and reference numbers, links, full dates and
postcodes, and it never blocks, never accuses, and runs entirely on the device
— a privacy check that transmits the text being checked is not one. It stays
silent unless it has something, because warning on every post is how a check
teaches people to dismiss it before the night it matters.

The false-positive tests matter more than the true-positive ones, and they are
written from sentences people in this forum actually write: "I have been
waiting 11 months", "my children are 8 and 13", "there were 3 of us in the
room". None of them trips it. "+44 7700 900123" and "my file number is
A-1234567" both do.

**Rate limits** are six topics and forty replies an hour, set far above what a
person does and far below what a script does, enforced in the database because
the client is not the only way to reach the table. The refusal reaches someone
as a sentence rather than as `rate_limited`.

**The email provider question from Sprint 5 is now answered.** The first live
send returned `403 ... domain is not verified` from the provider. The key
works and the path works; the sending domain needs verifying with the
provider. That failure was visible only as a number in a cron response, which
is why digest sends now join `email_deliveries` with their reason — the same
record every other message this product sends already had.

#### Known limits

- **Nothing verifies the sending domain for you.** Until it is verified at the
  provider, every digest and every appointment email records `failed` with that
  403. The app is unaffected; the mail simply does not go.
- **The draft check is patterns, not understanding.** It will not notice a
  village named in prose, or "the man who ran the checkpoint on my street". The
  composer notice is still the primary defence; this catches the mechanical
  cases.
- **Moderation is still reactive.** Reports, blocks and rate limits work;
  nothing reads a post before it appears, and at this size that remains the
  right trade.
- **No notification for direct messages.** Only forum replies notify. A DM
  arriving is arguably more urgent, and is the obvious next addition.

---

## 4. Sequencing rationale

Sprint 1 first because it is the only one of the four features with a
*capability* missing rather than a surface — the advisor needs new AI work,
guardrails and tests, and that is the longest lead time.

Sprint 2 next because it is cheap: the correspondence engine already exists
and mostly needs presenting, and report/block is a safety gap that should not
outlive another release.

Ask a Lawyer is last of the four because it is the largest and depends on
professional verification being real, which is currently manual. With the
booking scope clarified it is no longer the riskiest — it introduces people to
lawyers rather than carrying advice.

If Ask a Lawyer is the commercial priority, Sprints 1 and 2 can be deferred —
but S4-1 (verification) then has to move ahead of S3, not after it. Putting an
unverified name in front of an asylum claimant is the real exposure in the
booking model, and it is cheap to prevent.

**Status: Sprints 1–7 shipped.** Sprints 1 and 2 on 2026-08-08 (`39334ea`, `709b1bd`) — documentation
advisor, narrative intake, guardrail tests, plus two bugs found on the way (a
missing `<Outlet />` that made the story sections unreachable, and a delete in
analyzeGaps that would have wiped the advisor's output). Sprint 2 surfaced the
per-document verdict, wired report/block, and added the moderation queue with
a migration for report lifecycle and soft-hiding.
