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

**Status: Sprints 1 and 2 shipped 2026-08-08** (`39334ea`, `709b1bd`) — documentation
advisor, narrative intake, guardrail tests, plus two bugs found on the way (a
missing `<Outlet />` that made the story sections unreachable, and a delete in
analyzeGaps that would have wiped the advisor's output). Sprint 2 surfaced the
per-document verdict, wired report/block, and added the moderation queue with
a migration for report lifecycle and soft-hiding.
