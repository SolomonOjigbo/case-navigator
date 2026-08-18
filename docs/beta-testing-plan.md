# CaseMap closed beta — plan and field guide

Twelve testers, two weeks, recruited in Nigeria for a product whose users are
immigrants in Canada. Written 2026-08-14, alongside the tester scaffolding in
`20260814100000_beta_programme.sql`.

Budget: roughly ₦302,000 (about US$195 at ₦1,550/$). Price in naira and check
the rate on the day you pay.

---

## 1. What testing in Nigeria buys, and what it does not

Your users are in Canada. Your testers will be in Nigeria. That gap is fine for
most of what a beta is for and useless for the rest, so it is worth being
precise before spending anything.

**Valid from this round**

- Whether a person can find their way around without being taught.
- Whether the writing is clear to someone reading English as a second language.
- How the app behaves on a mid-range Android over mobile data — closer to real
  user conditions than a Toronto tester on fibre.
- Where it breaks, hangs, or loses work.
- Whether an almost-empty forum feels like a place worth returning to.
- Whether people understand this is not legal advice.

**Not valid from this round**

- Whether the document advisor names the right papers for a Canadian claim.
- Whether the fifteen story sections match what the IRB actually asks.
- Whether the consultation flow fits how Canadian immigration lawyers work.
- Whether the tone lands for someone genuinely mid-claim and frightened.
- Anything about demand, pricing or retention. Twelve paid testers measure none
  of those.

**The advantage hiding in the constraint.** Nigeria is one of the largest source
countries for Canadian immigration and refugee claims. Recruit Nigerians who are
*actually applying* — or whose sibling or cousin did — and this is not a cheap
proxy but the real population, one step earlier in the journey. Recruit randomly
and you get people role-playing a life they have never lived, which is where the
cheapness starts to cost you.

## 2. Who the twelve should be

| Group | Count | Why they are in the room |
|---|---|---|
| Applied or applying to Canada — any stream, or a close family member who has | 6 | The closest thing to a real user on this budget. They know what the paperwork feels like. |
| Intending to migrate within about two years, actively researching | 4 | The growth edge — people who would find CaseMap by searching, before they have a case. |
| No migration connection | 2 | A control. If they can navigate it, the interface does not depend on prior knowledge. |

Device and condition quotas, which overlap with the above:

| Condition | At least | What it protects against |
|---|---|---|
| Android phone | 8 | Users are not on iPhones. Neither should most testers be. |
| Budget device, 4 GB RAM or less | 2 | The slow render and the crash you never see on a MacBook. |
| Mobile data, not home wifi | 6 | Load weight, and anything that fails on a flaky connection. |
| English as a second language | 3 | Every safety notice in the app has to survive this. |
| Reads Arabic | 1 | Optional. If nobody is found, record that the Arabic build went untested rather than assuming it works. |

**Screener — five questions.** Have you, or someone close to you, applied to move
to Canada? What phone, roughly how old? Wifi or mobile data mostly? Can you give
about three hours over two weeks in short sessions? Are you comfortable writing
short notes in English about what confused you?

Recruit through a WhatsApp group, an alumni network or a diaspora community page
— not a paid microtask platform. Microtask workers optimise for speed of
completion, which is the opposite of what this needs.

## 3. Nobody uses their real story

Every tester works from a **fictional persona you supply**. Nobody types a real
persecution account, a real passport number or a real family member's name into
a beta database.

Three reasons, any one sufficient: a beta database is not a safe place for a real
claim; asking for someone's genuine account for ₦20,000 is not a fair trade; and
the forum is shared, so anything a tester posts is visible to the other eleven.

Write three personas — a student whose permit expired, someone who left after
political trouble, someone reuniting with a spouse. Each gets a name, a rough
timeline, and two or three documents they do and do not have. Testers pick one
and stay in it, including in the forum. This costs no signal: a persona exercises
every screen exactly as a real story would.

Send with the welcome pack: what you collect, how long you keep it, that they can
stop any time and keep the money for work already done, and that their account
and content are deleted when the beta closes.

## 4. The fortnight

Week one is guided, because comparing anything requires the same six flows
attempted by all twelve. Week two is unguided, because guided testing never shows
what someone does when nobody is watching.

| When | What happens |
|---|---|
| Day 0 | Welcome pack: what CaseMap is, the persona, the consent note, the WhatsApp group, the data bundle. One ask only — sign in and post an introduction. |
| Days 1–5 | One task script per day, sent to the group each morning. After each, one question: how easy or hard, 1 to 7. |
| Day 6 | Mid-point triage. Fix the blockers now — if four people cannot find the same button, week two would just measure it again. Post what changed. |
| Days 7–13 | Unguided use with a daily one-sentence prompt: what did you open it for, what did you avoid, what annoyed you. |
| Day 14 | Exit interviews, six of the twelve: the two most active, the two least active, two in the middle. The least active are the most informative. |
| Days 15–16 | Pay everyone within 48 hours, then write it up. Payment first. |

## 5. The six task scripts

Each gives a goal, never a route. "Tap the blue button" stops testing whether
anyone can find it.

1. **Arrive and introduce yourself.** Sign up, then tell the community about
   your persona. Success: posted unaided in under eight minutes. Watch: do they
   understand a handle is not their real name?
2. **Ask the community something.** Ask a question where others will see it, then
   answer someone else's. Watch: which category they pick, and whether they
   hesitate. A category nobody picks is named wrong.
3. **Write part of your story.** Two sections attempted, and the work still
   there on return. Watch: where they stop. The hardest screen in the product.
4. **Trip the draft check on purpose.** Write a post containing the persona's
   phone number and date of birth. Success: the warning appears, is read, and
   they can say afterwards what it warned about. A notice everyone clicks past
   does not exist.
5. **Book time with a lawyer.** Then explain what that lawyer can and cannot see.
   Success matters less than the explanation: if anyone believes booking shares
   their file, the highest-stakes wording in the app has failed.
6. **Share, then take it back.** Grant a lawyer access, then revoke it.
   Hesitation before granting is good. Hesitation before revoking means people
   do not trust that they are still in control.

## 6. The metric

With twelve people you cannot measure conversion, retention, or anything that
belongs in a deck. You can measure whether people are able to do the thing.

| | Target | Why |
|---|---|---|
| **Unassisted task completion** (primary) | ≥ 80% | Across the six scripts. Any single task below 60% is a release blocker, not a backlog item. |
| Ease, 1–7 after each task | mean ≥ 5.5 | One question, asked identically. Anything 4 or below gets watched on video before it gets argued about. |
| Forum activation within 48h | ≥ 8 of 12 | Posted or replied without being asked twice. The community is the front door, so a cold start is the biggest risk. |
| Understands the boundary | 10 of 12 | Can say unprompted that CaseMap gives no legal advice and that booking does not share their file. |
| Sessions without crash or dead end | ≥ 95% | From their reports plus the app's own logs, not either alone. |
| Confirmed bugs per tester | track, no target | A target rewards volume over quality. Watch the distribution — if one person files everything, the other eleven are not engaged. |

**Report counts, not percentages.** "Nine of twelve" is honest. "75% of users"
invites everyone to treat twelve paid Nigerian testers as a population estimate
for Canadian claimants. A dozen testers reliably surfaces problems affecting
roughly one user in five; it says nothing dependable about how often anything
happens.

## 7. Payment

Anchor: Nigeria's national minimum wage is ₦70,000 a month, roughly ₦2,700 for a
working day. The ask is about three hours over two weeks.

| Stage | Per tester | ≈ USD | Why it sits here |
|---|---|---|---|
| Data bundle, day 0 | ₦3,000 | $1.95 | Removes the cost of taking part. Testing over mobile data on your own airtime is a real expense. |
| Week one complete | ₦8,000 | $5.15 | Mid-programme money is what stops the week-two drop-off. |
| Week two plus exit interview | ₦9,000 | $5.80 | The larger half at the end, where the honest behaviour is. |
| Confirmed serious bug, max 2 | ₦4,000 | $2.60 | Reproducible, and something you actually fix. Announce each in the group. |
| **Typical total** | **₦20,000** | **≈ $13** | About seven times a day's minimum wage, for three hours. |

Whole programme: ₦240,000 for twelve testers, ₦32,000 budgeted for about eight
bug bonuses, ₦25,000 in two contribution prizes (₦15,000 and ₦10,000), ₦5,000 for
fees and slippage. **Total ₦302,000, about $195.**

**How to send it.** Bank transfer to a NUBAN account is instant, near-free and
what people expect. Paystack or Flutterwave for bulk payout from abroad. Chipper
Cash or Grey for diaspora-to-Nigeria. Airtime/data top-up for the day-0 bundle
only — never the main payment; people want money, not credit. Avoid PayPal, which
handles Nigeria badly, and avoid crypto or gift cards, which push exchange risk
and fees onto the tester.

**The floor.** Do not go below about ₦15,000 all in. Underpaid testers do not
complain — they write "nice app 👍" and disappear, and you pay the same money for
data you cannot use. The cheapest possible beta is the one you have to run twice.

## 8. Where reports go

Two channels, strictly split. **WhatsApp** for conversation, questions and
encouragement — it is where Nigerian testers already are, and a group that feels
alive keeps people in the programme. **The in-app form** at
`/community/feedback` for anything you need to track, because a bug in a group
chat is a bug you will lose by Thursday.

The form asks six things and captures three more (page, browser, screen size)
without asking. Reports land in `beta_reports` and appear in the admin queue at
`/admin/beta`, where a triage note written by an admin is shown back to the
tester who filed it.

**Severity, agreed in advance**

- **Blocker** — data lost, or a core task impossible. Fix inside 24 hours and
  tell the group.
- **Serious** — a task takes a wrong turn, or a safety notice fails to appear.
  Fix at the day-6 triage.
- **Cosmetic** — looks wrong but works. Batch for after the beta.

Post the fix list to the group at day 6 and day 14. Testers who watch reports
turn into changes behave like collaborators; testers reporting into silence stop
by day four.

## 9. The round this one cannot replace

When the fortnight is done you will know whether CaseMap is usable. You will not
know whether it is *right* — whether the document advice, story structure and
consultation flow match Canadian reality.

That gap does not need another twelve people. It needs three or four
conversations with someone who does this work: a settlement-agency caseworker, a
legal-aid clinic, an immigration consultant. An hour each, walking them through
the story sections and the advisor output. Many will do it free because the
product is useful to their clients, and one such conversation corrects more
domain error than the whole Nigerian round can.

Run them in this order. Usability first in Nigeria, because a caseworker's hour
is expensive and should not be spent on a button they cannot find. Domain review
second, once the thing is navigable.

**Gates before real claimants see it**

- Task completion ≥ 80%, no single task below 60%.
- Zero open blockers, and no data-loss bug seen twice.
- 10 of 12 correctly state that booking a lawyer does not share their file.
- At least one Canadian caseworker has reviewed the advisor output.
- A named person is on call for the moderation queue before the forum opens.

---

## 10. How the app supports this

Built in `20260814100000_beta_programme.sql`:

- **`beta_testers`** — the roster, with cohort, persona and invited date. A table
  rather than a new `app_role` value, because the programme needs metadata a role
  cannot carry, and because `ALTER TYPE ... ADD VALUE` cannot be used by a policy
  in the same transaction that adds it. **No self-service INSERT policy**: add
  testers with the service role. The roster is the key to the private room.
- **A private "Beta feedback" category**, `audience = 'beta'`. The flag alone
  does nothing — `community_posts` had a SELECT policy of
  `NOT is_blocked_pair(...)`, so every signed-in person could read every topic
  regardless of category. The posts *and comments* policies now both call
  `can_read_category()`, and that is what actually keeps the room shut. Verified
  against the live project: a non-tester reads zero topics and zero replies from
  it, cannot post or reply into it, and the public forum is unaffected.
- **`beta_reports`** — six typed fields, three captured. A tester reads their own
  and the triage note on them; an admin reads all and is the only one who can
  triage. A reporter cannot mark their own report fixed.

Ending a tester's row (`ended_at`) removes both the private category and the
ability to file, and leaves everything they wrote in place.
