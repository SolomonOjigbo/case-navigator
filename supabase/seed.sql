-- =========================================================================
-- Synthetic development seed. THREE fictional cases, authored to exercise the
-- paths that are easy to get wrong.
--
-- SYNTHETIC DATA ONLY. Every name, date, place and document here is invented.
-- Never load real claimant material into a development database — see §6 of
-- the prompt pack: this build is for workflow validation and usability
-- testing, not for a real person's narrative and passport.
--
-- Run with: supabase db reset   (local)
-- Also safe to run against a disposable hosted dev project, as the postgres
-- role, e.g. psql "$SUPABASE_DB_URL" -f supabase/seed.sql
-- Every row is tagged reference_code 'SEED-*' so the app can show the
-- "Synthetic test data" banner and so this data is trivially identifiable.
-- =========================================================================

-- pgcrypto lives in the extensions schema on Supabase and in public on some
-- local stacks; include both so crypt()/gen_salt() resolve either way.
SET search_path = public, extensions;

-- -------------------------------------------------------------------------
-- Fictional users
--
-- Inserted as the connected role, NOT service_role: service_role has no
-- privileges on auth.users, so seeding under it fails with "permission denied
-- for table users" on a hosted project.
--
-- The empty-string token columns are load-bearing. GoTrue scans them into
-- non-nullable Go strings, so leaving them NULL makes every subsequent auth
-- request fail with a 500 "Database error querying schema" — including
-- password sign-in for accounts that look perfectly fine in the table.
-- -------------------------------------------------------------------------
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.amina@example.test',  crypt('seed-password-1', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Amina Testcase"}', '', '', '', '', '', '', '', ''),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.bilal@example.test',  crypt('seed-password-2', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Bilal Fictional"}', '', '', '', '', '', '', '', ''),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.chen@example.test',   crypt('seed-password-3', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Chen Imaginary"}', '', '', '', '', '', '', '', ''),
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.lawyer@example.test', crypt('seed-password-4', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sam Notreal (fictional lawyer)"}', '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Everything below is public schema. The story_responses append-only trigger
-- only guards UPDATE and DELETE (and this seed only INSERTs), so no role
-- switch is needed here either — running the whole file as one role keeps it
-- working on both a local reset and a hosted dev project.

-- -------------------------------------------------------------------------
-- Fictional organisation and professional
-- -------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, kind, jurisdiction_code)
VALUES ('c0000000-0000-4000-8000-000000000001', 'Example Legal Clinic (synthetic)', 'clinic', 'CA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.professionals (id, user_id, organization_id, license_number, license_jurisdiction, display_name, verified_at, verified_by, active)
VALUES (
  'd0000000-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'SEED-LIC-0001', 'CA', 'Sam Notreal (fictional lawyer)', now(), NULL, true
) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- CASE A — straightforward: 6 events, 5 documents, nothing unusual.
-- -------------------------------------------------------------------------
INSERT INTO public.cases (id, applicant_id, jurisdiction, reference_code, status, preferred_language)
VALUES ('e0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'CA', 'SEED-CASE-A', 'in_progress', 'en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.story_responses (id, case_id, section_key, prompt_code, reference_code, body_text, language, value)
VALUES
  ('e1000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', 'personal_information', 'full_name',        'SEED-S-A1', 'My name is Amina Testcase.', 'en', '{}'),
  ('e1000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000a', 'significant_incidents', 'main_incident',   'SEED-S-A2', 'On 12 March 2022 I was stopped at a checkpoint outside Riverton and held for two days.', 'en', '{"provenance_kind":"happened_to_me"}'),
  ('e1000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000a', 'travel_history', 'departure',             'SEED-S-A3', 'I left the country on 2 August 2022 and arrived in Canada on 4 August 2022.', 'en', '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, case_id, reference_code, uploaded_by, original_filename, mime_type, size_bytes, storage_path, sha256, doc_type, document_date, primary_language, readability, processing_status)
SELECT
  ('e2000000-0000-4000-8000-00000000000' || n)::uuid,
  'e0000000-0000-4000-8000-00000000000a',
  'SEED-D-A' || n,
  'aaaaaaaa-0000-4000-8000-000000000001',
  'synthetic-document-a' || n || '.pdf',
  'application/pdf', 120000,
  'e0000000-0000-4000-8000-00000000000a/seed/a' || n || '.pdf',
  repeat('a', 63) || n,
  (ARRAY['identity_document','police_report','medical_note','letter','travel_ticket'])[n],
  (ARRAY['2019-05-01','2022-03-15','2022-03-20','2022-06-01','2022-08-02'])[n]::date,
  'en', 'good', 'ready'
FROM generate_series(1, 5) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.events (id, case_id, reference_code, title, date_start, date_certainty, location_name, user_description, provenance, unsupported, user_confirmed)
SELECT
  ('e3000000-0000-4000-8000-00000000000' || n)::uuid,
  'e0000000-0000-4000-8000-00000000000a',
  'SEED-E-A' || n,
  (ARRAY['Identity document issued','Stopped at checkpoint','Released from detention','Medical appointment','Letter received','Left the country'])[n],
  (ARRAY['2019-05-01','2022-03-12','2022-03-14','2022-03-20','2022-06-01','2022-08-02'])[n]::date,
  'exact',
  (ARRAY['Riverton','Outside Riverton','Riverton','Riverton','Riverton','Riverton airport'])[n],
  'Described by the applicant during intake.',
  'user_confirmed', false, true
FROM generate_series(1, 6) AS n
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- CASE B — the awkward one:
--   * a Hijri date alongside Gregorian dates
--   * two spellings of one name ("Mohammed Ali" / "Muhammad Ali")
--   * a document dated AFTER the event it describes
--   * a poor-quality scan
--   * a document with a possible missing page
--   * an event with no evidence connected
-- -------------------------------------------------------------------------
INSERT INTO public.cases (id, applicant_id, jurisdiction, reference_code, status, preferred_language)
VALUES ('e0000000-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000002', 'CA', 'SEED-CASE-B', 'in_progress', 'en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.story_responses (id, case_id, section_key, prompt_code, reference_code, body_text, language, value)
VALUES
  ('e1100000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b', 'personal_information', 'full_name',       'SEED-S-B1', 'My name is Bilal Fictional. My uncle Mohammed Ali travelled with me.', 'en', '{}'),
  -- Same person, different transliteration. The consistency rules must treat
  -- this as a transliteration variant, never as a contradiction.
  ('e1100000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'witnesses', 'witness_name',               'SEED-S-B2', 'Muhammad Ali saw what happened and can confirm it.', 'en', '{}'),
  -- A Hijri date the applicant stated in their own calendar.
  ('e1100000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000b', 'important_dates', 'incident_date',        'SEED-S-B3', 'It happened on 15 Ramadan 1443.', 'en',
   '{"date_as_stated":"15 Ramadan 1443","date_calendar":"hijri","date_certainty":"approximate","date_normalized_start":"2022-04-16"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, case_id, reference_code, uploaded_by, original_filename, mime_type, size_bytes, storage_path, sha256, doc_type, document_date, primary_language, readability, possible_missing_pages, processing_status)
VALUES
  -- Dated 2022-09-01 but describes an event on 2022-04-16: a date difference,
  -- which must surface as date_needs_clarification, never potential_conflict.
  ('e2100000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b', 'SEED-D-B1', 'aaaaaaaa-0000-4000-8000-000000000002', 'synthetic-report-late.pdf',   'application/pdf', 90000,  'e0000000-0000-4000-8000-00000000000b/seed/b1.pdf', repeat('b', 63) || '1', 'police_report', '2022-09-01', 'en', 'good',       false, 'ready'),
  ('e2100000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'SEED-D-B2', 'aaaaaaaa-0000-4000-8000-000000000002', 'synthetic-blurry-photo.jpg',  'image/jpeg',      450000, 'e0000000-0000-4000-8000-00000000000b/seed/b2.jpg', repeat('b', 63) || '2', 'letter',        '2022-05-10', 'en', 'poor',       false, 'awaiting_user_review'),
  ('e2100000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000b', 'SEED-D-B3', 'aaaaaaaa-0000-4000-8000-000000000002', 'synthetic-partial-scan.pdf',  'application/pdf', 60000,  'e0000000-0000-4000-8000-00000000000b/seed/b3.pdf', repeat('b', 63) || '3', 'medical_note',  '2022-04-20', 'en', 'acceptable', true,  'ready')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.events (id, case_id, reference_code, title, date_start, date_certainty, date_calendar, location_name, user_description, provenance, unsupported, user_confirmed)
VALUES
  ('e3100000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b', 'SEED-E-B1', 'Incident described in the report', '2022-04-16', 'approximate', 'hijri', 'Northtown', 'The applicant gave this date as 15 Ramadan 1443.', 'user_confirmed', false, true),
  -- No evidence connected: must show as a neutral status, never a deficiency.
  ('e3100000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', 'SEED-E-B2', 'Meeting with a community leader', '2022-05-02', 'exact', 'gregorian', 'Northtown', 'No document has been connected to this yet.', 'user_confirmed', true, true)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- CASE C — language and transcription:
--   * an Arabic document with a machine (uncertified) translation
--   * a screenshot
--   * a transcript containing an ASR error
--   * an event whose date the applicant marked unknown
-- -------------------------------------------------------------------------
INSERT INTO public.cases (id, applicant_id, jurisdiction, reference_code, status, preferred_language)
VALUES ('e0000000-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-000000000003', 'CA', 'SEED-CASE-C', 'in_progress', 'ar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, case_id, reference_code, uploaded_by, original_filename, mime_type, size_bytes, storage_path, sha256, doc_type, document_date, primary_language, readability, translation_status, processing_status)
VALUES
  ('e2200000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'SEED-D-C1', 'aaaaaaaa-0000-4000-8000-000000000003', 'synthetic-arabic-letter.pdf', 'application/pdf', 80000,  'e0000000-0000-4000-8000-00000000000c/seed/c1.pdf', repeat('c', 63) || '1', 'letter',     '2021-11-02', 'ar', 'good',       'machine_available',  'ready'),
  ('e2200000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000c', 'SEED-D-C2', 'aaaaaaaa-0000-4000-8000-000000000003', 'synthetic-screenshot.png',    'image/png',       220000, 'e0000000-0000-4000-8000-00000000000c/seed/c2.png', repeat('c', 63) || '2', 'screenshot', NULL,         'ar', 'acceptable', 'certified_required', 'ready')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.document_versions (id, document_id, version, storage_path, sha256, byte_size, page_count, is_original)
VALUES
  ('e4200000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 1, 'e0000000-0000-4000-8000-00000000000c/seed/c1.pdf', repeat('c', 63) || '1', 80000, 1, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ocr_outputs (id, document_version_id, page_number, engine, engine_version, text, mean_confidence, had_native_text_layer)
VALUES
  -- Deliberate ASR/OCR error: "Northtown" was read as "North Town".
  ('e5200000-0000-4000-8000-00000000000a', 'e4200000-0000-4000-8000-00000000000a', 1, 'seed-fixture', 'v0',
   'The meeting took place in North Town in the autumn.', 0.62, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sources (id, case_id, source_type, reference_id, reference_code)
VALUES
  ('e6200000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'document', 'e5200000-0000-4000-8000-00000000000a', 'SEED-PAGE-C1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.translations (id, source_id, source_language, target_language, translated_text, engine, certified)
VALUES
  -- certified = false: must always render as "Working translation — not
  -- certified" and stay out of the main body of any export.
  ('e7200000-0000-4000-8000-00000000000a', 'e6200000-0000-4000-8000-00000000000a', 'ar', 'en',
   'The meeting took place in North Town in the autumn.', 'seed-machine-translate', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.events (id, case_id, reference_code, title, date_start, date_certainty, location_name, user_description, provenance, unsupported, user_confirmed)
VALUES
  -- Date unknown: must sort to the "date not established" group, never be
  -- guessed into position.
  ('e3200000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'SEED-E-C1', 'Meeting referred to in the letter', NULL, 'unknown', 'Northtown',
   'The applicant said they do not remember the date.', 'user_confirmed', false, true)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- One active sharing grant: CASE A, shared with the fictional lawyer.
--
-- Without this the professional side of the seed has nothing to open, and the
-- revocation test in rls.integration.test.ts has no grant to revoke. CASE B
-- and CASE C are deliberately left unshared, so "a professional with no grant
-- sees nothing" has something real to prove.
-- -------------------------------------------------------------------------
INSERT INTO public.sharing_grants (id, case_id, professional_id, scopes, purpose_note, starts_at, expires_at, created_by)
VALUES (
  'f0000000-0000-4000-8000-00000000000a',
  'e0000000-0000-4000-8000-00000000000a',
  'd0000000-0000-4000-8000-000000000001',
  ARRAY['story','documents','timeline','evidence_map','questions'],
  'Seed data. Fictional review of a fictional case.',
  now(), now() + interval '365 days',
  'aaaaaaaa-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- Consultation availability, so the booking screens have something to show.
--
-- Times are relative to when the seed runs, and far enough ahead to clear the
-- one-hour lead time in consultation-service.
-- -------------------------------------------------------------------------
UPDATE public.professionals
SET languages = ARRAY['en', 'ar'],
    consultation_blurb = 'Refugee and asylum matters. First consultations are 30 minutes.'
WHERE id = 'd0000000-0000-4000-8000-000000000001';

INSERT INTO public.consultation_slots (id, professional_id, starts_at, duration_minutes, mode)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '2 days' + interval '9 hours', 30, 'video'),
  ('f1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '2 days' + interval '10 hours', 30, 'phone'),
  ('f1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '3 days' + interval '9 hours', 45, 'video'),
  ('f1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '3 days' + interval '14 hours', 30, 'in_person'),
  ('f1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '4 days' + interval '11 hours', 60, 'video')
ON CONFLICT (id) DO NOTHING;

RESET search_path;
