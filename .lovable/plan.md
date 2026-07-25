# Professional Workspace at /pro/*

Building the lawyer review dashboard with the anti-automation-bias guardrails baked in — collapsed AI panels by default, no "accept all" control anywhere, mandatory reasons on rejected rules-based flags, and a per-item transition history.

## Database (one migration)

Add tables and helpers. All under RLS scoped through `has_case_access(case_id, scope)` for shared reads plus `professionals.organization_id` checks for org-private data.

- `professional_reviews` — one row per (professional, target_type, target_id) action. Columns: `case_id`, `professional_id`, `target_type` (extracted_fact | event | evidence_event_link | clarification_item | missing_info_item | attention_flag | applicant_question | ai_summary), `target_id`, `action` (accept | edit | reject), `edited_text`, `reason`, `ai_original_text` (snapshot for Audit tab). Append-only.
- `review_status` — current status + transition history per target. Columns: `case_id`, `target_type`, `target_id`, `status` (not_reviewed | user_confirmation_required | under_review | resolved | not_relevant | escalated), `previous_status`, `changed_by`, `changed_at`. Insert-only; latest row wins per (target_type, target_id).
- `professional_notes` — already exists; verify org scoping and add a table comment noting production needs org-scoped encryption.
- `pro_tasks` — assigned follow-ups to the applicant. Columns: `case_id`, `assigned_by`, `body_plain`, `status` (draft | sent | acknowledged | done), `sent_at`. Applicant-readable when `status != 'draft'`.
- `pro_notices_seen` — dismissible weekly notice tracker: `professional_id`, `notice_key`, `seen_at`.
- Grant blocks for each; SELECT via `has_case_access(case_id, 'timeline'|'story'|…)`; org-private rows via a `has_org_access(case_id, professional_id)` security-definer helper.

## Routes

```
src/routes/
  pro.tsx                          (existing shell; extend nav)
  pro.cases.tsx                    (case list, with grant-derived columns)
  pro.cases.$caseId.tsx            (workspace shell + tabs + source viewer slide-over)
  pro.cases.$caseId.words.tsx      (Applicant's own words — DEFAULT tab)
  pro.cases.$caseId.documents.tsx
  pro.cases.$caseId.timeline.tsx
  pro.cases.$caseId.evidence.tsx
  pro.cases.$caseId.clarify.tsx
  pro.cases.$caseId.missing.tsx
  pro.cases.$caseId.attention.tsx
  pro.cases.$caseId.summaries.tsx
  pro.cases.$caseId.notes.tsx
  pro.cases.$caseId.tasks.tsx
  pro.cases.$caseId.audit.tsx
  pro.calibration.tsx              (own override rate + avg review time)
```

The case workspace uses a sub-layout: left tab rail, main content, right slide-over `SourceViewer` triggered by any `<SourceLink>`. On mount, AI summary panels render `<details>` **closed**; applicant's own words render expanded. A comment in the file explains why — do not flip.

## Components

- `src/components/pro/ReviewActionBar.tsx` — Accept / Edit / Reject buttons. Reject on a rules-based flag (attention_flags where `origin='rule'`) requires a non-empty reason. No "accept all" prop, no bulk action. If asked to add one later, refuse.
- `src/components/pro/StatusPill.tsx` + `StatusMenu.tsx` — status transitions writing to `review_status`; hover reveals transition history.
- `src/components/pro/SourceViewer.tsx` — slide-over (`Sheet`) reused across tabs; opens documents at page + highlight range or story answers at char range. Wired via a `SourceViewerContext` provider at the workspace root.
- `src/components/pro/WeeklyNotice.tsx` — dismissible banner: "AI findings are proposals. Rejecting them is normal and useful." Persisted in `pro_notices_seen` keyed by ISO week.
- `src/components/pro/TaskPreview.tsx` — shows the task exactly as the applicant will see it before "Send".

## Services / server fns

- `src/lib/pro-service.ts` — grant-scoped queries: case list with `items_needing_review` counts, per-tab lists, professional_reviews CRUD, status transitions, notes CRUD (org-scoped), tasks CRUD, calibration stats.
- `src/lib/pro-calibration.ts` — computes this professional's override rate (`reject+edit / total reviews`) and average time from item creation to first review.

## Copy / i18n

All strings go into `src/i18n/locales/en.json` under `pro.*`; Arabic mirrored. Includes: tab labels, status labels, reject-reason placeholder, weekly notice, task preview scaffold, calibration explainer ("for your own calibration; never shared or ranked").

## Explicit refusals encoded in code

- No `AcceptAllButton` — a comment in `ReviewActionBar.tsx` says so.
- No leaderboard / ranking view — calibration page shows only `useSession().user`'s own numbers, with a header note.
- Reject-reason validation on rules-based flags at both the form and the server fn.

## Out of scope for this pass

- Realtime updates between pro and applicant (poll on tab focus).
- Full-text search within a case.
- Encryption at rest for privileged notes (comment placed; production TODO).
