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
  ('bbbbbbbb-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.lawyer@example.test', crypt('seed-password-4', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sam Notreal (fictional lawyer)"}', '', '', '', '', '', '', '', ''),
  -- A second professional who has NOT been checked. The point of the fixture:
  -- an unverified professional must be invisible in the directory and
  -- unbookable, and that is only provable if one exists.
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.unchecked@example.test', crypt('seed-password-5', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Pat Unchecked (fictional, unverified)"}', '', '', '', '', '', '', '', ''),
  -- A platform admin, so moderation and verification have an owner that is
  -- not also an applicant.
  ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.admin@example.test', crypt('seed-password-6', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sam Admin (synthetic)"}', '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Roles. The handle_new_user trigger gives every account 'applicant'; these
-- two need more.
INSERT INTO public.user_roles (user_id, role)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'professional'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'professional'),
  ('cccccccc-0000-4000-8000-000000000001', 'platform_admin')
ON CONFLICT DO NOTHING;

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

-- Unverified: verified_at IS NULL and active = false. Nothing lists them.
INSERT INTO public.professionals (id, user_id, organization_id, license_number, license_jurisdiction, display_name, verified_at, verified_by, active)
VALUES (
  'd0000000-0000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000002',
  NULL,
  NULL, NULL, 'Pat Unchecked (fictional, unverified)', NULL, NULL, false
) ON CONFLICT (id) DO NOTHING;

-- ...and their submission, sitting in the admin queue.
INSERT INTO public.professional_verifications
  (id, professional_id, submitted_by, license_number, license_jurisdiction, display_name, organization_name, note, status)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'SEED-LIC-0002', 'CA', 'Pat Unchecked (fictional, unverified)',
  'Example Legal Clinic (synthetic)',
  'Synthetic seed submission. Approving this in a real project would list a person who does not exist.',
  'pending'
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

-- =========================================================================
-- COMMUNITY DEMO CONTENT (Sprint 6)
--
-- SYNTHETIC. Every member, topic and reply below is invented, and the fixed
-- UUID prefixes (f2/f3/f4) make the whole set removable in three statements.
--
-- Written with some care, because seed content in a forum is not filler: it
-- is the first thing a new member reads, and people match the register of
-- what is already there. So these posts model the behaviour the composer
-- notice asks for — no names, no places, no dates, no case numbers — and they
-- answer each other rather than each ending in a question nobody took up.
-- =========================================================================

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('f2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.maryam@example.test', crypt('seed-password-7', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Maryam K."}', '', '', '', '', '', '', '', ''),
  ('f2000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.samuel@example.test', crypt('seed-password-8', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Samuel O."}', '', '', '', '', '', '', '', ''),
  ('f2000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.farida@example.test', crypt('seed-password-9', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Farida N."}', '', '', '', '', '', '', '', ''),
  ('f2000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.tomas@example.test', crypt('seed-password-10', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Tomas B."}', '', '', '', '', '', '', '', ''),
  ('f2000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed.ayaan@example.test', crypt('seed-password-11', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Ayaan H."}', '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Handles. A community identity is a handle and a chosen display name; the
-- real name on the account never appears in the forum.
INSERT INTO public.community_profiles (id, user_id, handle, display_name, bio)
VALUES
  ('f3000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', 'chen_i',  'Chen I.',   'Waiting. Happy to answer questions about the early steps.'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'maryam_k','Maryam K.', 'Two years in. Ask me about interpreters.'),
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'samuel_o','Samuel O.', NULL),
  ('f3000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000003', 'farida_n','Farida N.', 'Here mostly to read.'),
  ('f3000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000004', 'tomas_b', 'Tomas B.',  NULL),
  ('f3000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000005', 'ayaan_h', 'Ayaan H.',  'Got my decision last year.'),
  ('f3000000-0000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000001', 'casemap_team', 'CaseMap team', 'We keep this place running.')
ON CONFLICT (user_id) DO NOTHING;

-- -------------------------------------------------------------------------
-- Topics
-- -------------------------------------------------------------------------
INSERT INTO public.community_posts (id, author_id, category_id, title, body, created_at, last_activity_at, pinned_at)
VALUES
  ('f4000000-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug='introductions'),
   'Welcome — how this place works',
   E'This is a space for people going through asylum and immigration processes to share what they have been through and what they learned.\n\nA few things worth knowing:\n\nNobody here is a lawyer, and nothing written here is legal advice. What people can give you is experience, which is often the thing that is hardest to find.\n\nPlease leave out anything that identifies you or anyone else — full names, addresses, the town you are from, dates of birth, file numbers. Not because anyone here would misuse it, but because this is a public space and you cannot know who is reading.\n\nIf someone is unkind, use the report button. A moderator reads every report.\n\nYou are welcome to just read for a while. Plenty of people do.',
   now() - interval '40 days', now() - interval '40 days', now() - interval '40 days'),

  ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug='introductions'),
   'Hello from someone two years in',
   E'I have been in this process for about two years now. When I started I did not know a single person who had done it, and I made every mistake there is to make.\n\nHappy to answer anything, especially about interpreters — I went through four before I found one I could actually talk to.',
   now() - interval '31 days', now() - interval '31 days', NULL),

  ('f4000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003',
   (SELECT id FROM public.community_categories WHERE slug='asylum-process'),
   'What actually happens at the first interview?',
   E'I have my first interview coming up and I do not really know what to expect. Is it one long conversation? Do they stop you and ask things again? I keep imagining it going badly.\n\nIf anyone can describe what the room was actually like I would be grateful.',
   now() - interval '24 days', now() - interval '24 days', NULL),

  ('f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000002',
   (SELECT id FROM public.community_categories WHERE slug='asylum-process'),
   'The waiting is the part nobody prepares you for',
   E'I was ready for the questions. I was not ready for eleven months of nothing.\n\nWhat helped me was giving the waiting a shape — one small thing each week that was mine, not the process. Language class, a walk, cooking something properly. It sounds thin written down but it was the difference between the months passing and the months sitting on me.\n\nHow is everyone else handling it?',
   now() - interval '18 days', now() - interval '18 days', NULL),

  ('f4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug='hearings-and-interviews'),
   'Things I wish I had known before my hearing',
   E'Written down while it is still fresh, in case it is useful.\n\nYou can ask for a break. I did not know this and I sat there for three hours getting worse.\n\nIf you do not understand a question, say so. Answering the question you think was asked is worse than asking for it again.\n\n"I do not remember" is a real answer. I spent weeks afraid of it and it turned out to be fine to say.\n\nTake water. Nobody tells you that either.',
   now() - interval '15 days', now() - interval '15 days', NULL),

  ('f4000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000003',
   (SELECT id FROM public.community_categories WHERE slug='hearings-and-interviews'),
   'Is it normal to be asked the same thing twice?',
   E'In my interview I was asked about the same period twice, quite far apart, and worded differently both times. I answered the same both times as far as I know but it left me shaken — like I had been caught at something.\n\nDoes this happen to everyone?',
   now() - interval '11 days', now() - interval '11 days', NULL),

  ('f4000000-0000-4000-8000-000000000007', 'f2000000-0000-4000-8000-000000000004',
   (SELECT id FROM public.community_categories WHERE slug='documents-and-evidence'),
   'What do you do when a document simply does not exist?',
   E'I was asked for something that I have no way of getting. The office that issued it does not function any more, and the people who could confirm it are not people I can contact safely.\n\nI have been treating this as a failure on my part. Is that how it is seen, or is there a normal way this is handled?',
   now() - interval '9 days', now() - interval '9 days', NULL),

  ('f4000000-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000002',
   (SELECT id FROM public.community_categories WHERE slug='documents-and-evidence'),
   'Keeping track of what you have already sent',
   E'Small practical thing that saved me a lot of panic: keep one list of every document, when you sent it, and who to. I did not do this for the first year and spent an entire weekend trying to work out whether I had already sent something.\n\nA notebook is enough. It does not have to be clever.',
   now() - interval '7 days', now() - interval '7 days', NULL),

  ('f4000000-0000-4000-8000-000000000009', 'f2000000-0000-4000-8000-000000000005',
   (SELECT id FROM public.community_categories WHERE slug='finding-a-lawyer'),
   'How did you find someone you could trust?',
   E'I am trying to find representation and I have no way of telling who is good. I have had two conversations that left me feeling like a number.\n\nWhat did you ask people, in the first meeting, that told you something real?',
   now() - interval '6 days', now() - interval '6 days', NULL),

  ('f4000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug='language-and-translation'),
   'On interpreters, and asking for a different one',
   E'It took me four interpreters to find one I could speak in front of. The first three were competent — that was not the problem. The problem was dialect with one, and with another I simply could not say certain things in front of him.\n\nYou are allowed to ask for someone else. I did not know that for a long time and I lost a year being half-understood.',
   now() - interval '5 days', now() - interval '5 days', NULL),

  ('f4000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-000000000002',
   (SELECT id FROM public.community_categories WHERE slug='daily-life'),
   'Small things that made the first months easier',
   E'Not paperwork. The rest of it.\n\nA library card, because it is warm and free and nobody asks you anything. A cheap phone plan with enough data for the calls. One place where you are a regular — for me a market stall where after a month they knew my face.\n\nWhat were yours?',
   now() - interval '4 days', now() - interval '4 days', NULL),

  ('f4000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-000000000003',
   (SELECT id FROM public.community_categories WHERE slug='family-and-children'),
   'How much do you tell your children?',
   E'Mine are eight and thirteen. The older one has worked out most of it and asks questions I do not know how to answer honestly without frightening her.\n\nI would like to hear from people who have been through this with children — what you said, and what you wish you had said.',
   now() - interval '3 days', now() - interval '3 days', NULL),

  ('f4000000-0000-4000-8000-00000000000d', 'f2000000-0000-4000-8000-000000000005',
   (SELECT id FROM public.community_categories WHERE slug='after-a-decision'),
   'It is not the ending you imagine',
   E'I got my decision last year, and the thing nobody told me is that the day itself was strange rather than joyful. I had built it up for so long that when it came I mostly felt tired.\n\nIt got better. But if you are expecting fireworks and you get flatness instead, there is nothing wrong with you.',
   now() - interval '2 days', now() - interval '2 days', NULL),

  ('f4000000-0000-4000-8000-00000000000e', 'aaaaaaaa-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug='anything-else'),
   'Does anyone else find the forms harder than the story?',
   E'I can talk about what happened. I have had to do it enough times.\n\nWhat I cannot do is the boxes. Something about the small print and the exact dates makes me freeze in a way that talking never does. I have sat in front of the same page for two hours.\n\nIs this just me?',
   now() - interval '1 day', now() - interval '1 day', NULL)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- Replies
-- -------------------------------------------------------------------------
INSERT INTO public.community_comments (id, post_id, author_id, body, created_at)
VALUES
  ('f5000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003', 'Welcome. I am at the beginning and reading everything you write.', now() - interval '30 days'),
  ('f5000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004', 'Four interpreters. That is reassuring to read, honestly — I assumed I was being difficult.', now() - interval '29 days'),

  ('f5000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', E'It was a long conversation, and yes, they go back over things. It is not a trap — they are building a picture and they check it from more than one side.\n\nThe room was ordinary. A table, a recorder, water. That surprised me most: I had imagined something much more frightening than what it was.', now() - interval '23 days'),
  ('f5000000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'Mine stopped twice for breaks. Both times because I asked. Nobody minded.', now() - interval '23 days'),
  ('f5000000-0000-4000-8000-000000000005', 'f4000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003', 'Thank you both. Genuinely. I have been imagining it much worse than this.', now() - interval '22 days'),

  ('f5000000-0000-4000-8000-000000000006', 'f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000003', 'The shape thing is right. I started swimming once a week and it is the only hour where I am not waiting.', now() - interval '17 days'),
  ('f5000000-0000-4000-8000-000000000007', 'f4000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', 'I volunteer two mornings. It does not make it shorter but it makes it mine.', now() - interval '16 days'),
  ('f5000000-0000-4000-8000-000000000008', 'f4000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000005', 'Eleven months for me too. It ends. That is all I can usefully say, but it does end.', now() - interval '12 days'),

  ('f5000000-0000-4000-8000-000000000009', 'f4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000003', 'Saving this. The "I do not remember" one especially — I have been rehearsing answers I do not actually have.', now() - interval '14 days'),
  ('f5000000-0000-4000-8000-00000000000a', 'f4000000-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001', 'Adding one: eat something first. I did not, and by the second hour I was not thinking straight.', now() - interval '13 days'),
  ('f5000000-0000-4000-8000-00000000000b', 'f4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000004', 'Thank you for writing it down while it was fresh. Most people do not.', now() - interval '10 days'),

  ('f5000000-0000-4000-8000-00000000000c', 'f4000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000001', 'Completely normal. It happened to me and to everyone I have spoken to. Answering consistently is the whole point of it.', now() - interval '10 days'),
  ('f5000000-0000-4000-8000-00000000000d', 'f4000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000005', 'Yes. And the shaken feeling afterwards is normal too. It is not evidence that you did badly.', now() - interval '9 days'),

  ('f5000000-0000-4000-8000-00000000000e', 'f4000000-0000-4000-8000-000000000007', 'f2000000-0000-4000-8000-000000000001', E'It is not a failure on your part. Documents being unobtainable is an ordinary situation, not a rare one.\n\nWhat I was told to do was write down exactly what I had tried and why it could not be done — who I approached, what happened. The attempt itself is worth something.', now() - interval '8 days'),
  ('f5000000-0000-4000-8000-00000000000f', 'f4000000-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000002', 'Please do put this to a lawyer rather than only to us. It is exactly the kind of thing they deal with often.', now() - interval '8 days'),
  ('f5000000-0000-4000-8000-000000000010', 'f4000000-0000-4000-8000-000000000007', 'f2000000-0000-4000-8000-000000000004', 'Thank you. I have been carrying this one around for weeks.', now() - interval '6 days'),

  ('f5000000-0000-4000-8000-000000000011', 'f4000000-0000-4000-8000-000000000008', 'f2000000-0000-4000-8000-000000000002', 'I use a photo of every page before it goes. Costs nothing and I have needed it twice.', now() - interval '6 days'),
  ('f5000000-0000-4000-8000-000000000012', 'f4000000-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000003', 'Starting this today.', now() - interval '5 days'),

  ('f5000000-0000-4000-8000-000000000013', 'f4000000-0000-4000-8000-000000000009', 'f2000000-0000-4000-8000-000000000001', E'I asked two things. How many cases like mine have you handled, and what would you need from me in the first month.\n\nThe answers mattered less than whether they answered plainly. The one I chose said "I do not know yet" to something, and that is when I trusted her.', now() - interval '5 days'),
  ('f5000000-0000-4000-8000-000000000014', 'f4000000-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000001', 'Ask who you actually speak to day to day. Mine was one person in the meeting and a different one for a year afterwards.', now() - interval '4 days'),
  ('f5000000-0000-4000-8000-000000000015', 'f4000000-0000-4000-8000-000000000009', 'f2000000-0000-4000-8000-000000000003', 'Feeling like a number in the first meeting is worth listening to. I ignored it once and regretted the year.', now() - interval '3 days'),

  ('f5000000-0000-4000-8000-000000000016', 'f4000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-000000000003', 'I did not know you could ask either. I have been nodding along for months.', now() - interval '4 days'),
  ('f5000000-0000-4000-8000-000000000017', 'f4000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000003', 'This is the most useful thing I have read here.', now() - interval '2 days'),

  ('f5000000-0000-4000-8000-000000000018', 'f4000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-000000000004', 'The library one. I sat in one every afternoon for a winter.', now() - interval '3 days'),
  ('f5000000-0000-4000-8000-000000000019', 'f4000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-000000000005', 'Finding one food from home that I could actually buy here. It sounds small. It was not.', now() - interval '2 days'),

  ('f5000000-0000-4000-8000-00000000001a', 'f4000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-000000000001', E'Mine were similar ages. What worked was answering the question actually asked rather than the whole thing.\n\nChildren notice being managed. Mine coped much better once I stopped pretending everything was ordinary.', now() - interval '2 days'),
  ('f5000000-0000-4000-8000-00000000001b', 'f4000000-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-000000000002', 'I told mine what was happening and that I did not know how it would end. She was relieved. She had assumed worse.', now() - interval '1 day'),

  ('f5000000-0000-4000-8000-00000000001c', 'f4000000-0000-4000-8000-00000000000d', 'f2000000-0000-4000-8000-000000000001', 'Thank you for saying this. Everyone talks about the decision and nobody talks about the day after it.', now() - interval '1 day'),
  ('f5000000-0000-4000-8000-00000000001d', 'f4000000-0000-4000-8000-00000000000d', 'f2000000-0000-4000-8000-000000000003', 'Flatness. That is the word I could not find.', now() - interval '18 hours'),

  ('f5000000-0000-4000-8000-00000000001e', 'f4000000-0000-4000-8000-00000000000e', 'f2000000-0000-4000-8000-000000000002', 'Not just you. Talking is a story; forms are an exam. They are not the same skill and nobody says so.', now() - interval '20 hours'),
  ('f5000000-0000-4000-8000-00000000001f', 'f4000000-0000-4000-8000-00000000000e', 'f2000000-0000-4000-8000-000000000001', 'One box at a time, and leave the ones that stop you. Going back to three hard boxes is easier than facing forty.', now() - interval '8 hours')
ON CONFLICT (id) DO NOTHING;

-- The trigger sets last_activity_at from whichever reply was inserted last;
-- recompute it from the data so ordering does not depend on insert order.
UPDATE public.community_posts p
SET last_activity_at = GREATEST(
      p.created_at,
      COALESCE((SELECT max(c.created_at) FROM public.community_comments c WHERE c.post_id = p.id), p.created_at)
    ),
    reply_count = COALESCE((SELECT count(*) FROM public.community_comments c WHERE c.post_id = p.id), 0);

-- A few likes, so the counts are not all zero.
INSERT INTO public.community_likes (post_id, user_id)
SELECT p.id, u.id
FROM public.community_posts p
CROSS JOIN (VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001'::uuid),
  ('aaaaaaaa-0000-4000-8000-000000000002'::uuid),
  ('f2000000-0000-4000-8000-000000000001'::uuid),
  ('f2000000-0000-4000-8000-000000000003'::uuid)
) AS u(id)
WHERE p.id IN (
  'f4000000-0000-4000-8000-000000000005',
  'f4000000-0000-4000-8000-000000000007',
  'f4000000-0000-4000-8000-00000000000a',
  'f4000000-0000-4000-8000-00000000000d'
)
AND p.author_id <> u.id
ON CONFLICT DO NOTHING;

RESET search_path;
