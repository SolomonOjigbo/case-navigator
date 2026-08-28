-- Phase 0 of the beta: seed the forum before any tester arrives.
--
-- The five threads and their sample answers come from the client's own testing
-- guidelines. They were written there as a *test script* — every tester handed
-- the exact words to type — which produces content rather than findings. As
-- content they are good: plausible, in the right register, and free of anything
-- that identifies a person. So they run here instead, and the testers arrive to
-- a forum that already has people in it.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE THE PRODUCT OPENS TO REAL CLAIMANTS
--
-- Three invented accounts post all of this. That is defensible for a closed
-- beta where all twelve participants know they are testing. It is NOT
-- defensible once real asylum seekers arrive and take these for peers — at
-- that point this is three fictional people giving the impression of a
-- community that does not exist yet.
--
-- Removal is one statement, because everything below hangs off three user rows
-- and every foreign key cascades:
--
--   DELETE FROM auth.users WHERE id IN (
--     'dddddddd-0000-4000-8000-000000000001',
--     'dddddddd-0000-4000-8000-000000000002',
--     'dddddddd-0000-4000-8000-000000000003'
--   );
--
-- ---------------------------------------------------------------------------
-- Safe to re-run: every insert is guarded.

SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Three accounts.
--
-- The names span three regions rather than one. Canada's claimants are not
-- from a single country, and a seeded community that happens to look like the
-- Nigerian test panel would teach that panel nothing about how the room reads
-- to anyone else.
--
-- @example.test is a reserved TLD, so these addresses can never receive mail.
-- Their profiles also set email_digest = false, so the nightly digest job never
-- tries to send to an address that cannot exist and never records a failure
-- against the sending domain.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
VALUES
  ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.sara@example.test',
   crypt('seed-community-1', gen_salt('bf')), now() - interval '40 days',
   now() - interval '40 days', now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Sara M."}', '', '', '', '', '', '', '', ''),
  ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.andres@example.test',
   crypt('seed-community-2', gen_salt('bf')), now() - interval '35 days',
   now() - interval '35 days', now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Andrés V."}', '', '', '', '', '', '', '', ''),
  ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.selam@example.test',
   crypt('seed-community-3', gen_salt('bf')), now() - interval '28 days',
   now() - interval '28 days', now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Selam T."}', '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.community_profiles (user_id, handle, display_name, bio, dm_policy, notify_replies, email_digest, notify_messages)
VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'sara_m', 'Sara M.',
   'Went through the process last year. Happy to answer what I can.', 'anyone', true, false, true),
  ('dddddddd-0000-4000-8000-000000000002', 'andres_v', 'Andrés V.',
   'Still waiting. Learning as I go.', 'anyone', true, false, true),
  ('dddddddd-0000-4000-8000-000000000003', 'selam_t', 'Selam T.',
   'Had my hearing in the spring.', 'anyone', true, false, true)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Five topics.
--
-- Each question from the guidelines becomes the title — it is the line people
-- scan in the list, so it has to stand alone — with two or three sentences of
-- context underneath. A title with an empty body reads as a survey question
-- rather than as a person asking something.
--
-- Timestamps are spread over three weeks on purpose. A forum where every
-- thread says "today" reads as staged, which defeats the point of seeding it.
-- ---------------------------------------------------------------------------
INSERT INTO public.community_posts (id, author_id, category_id, title, body, created_at, last_activity_at)
VALUES
  ('f5000000-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug = 'asylum-process'),
   'What was the hardest part of organizing your asylum story before your hearing or legal review?',
   'I am trying to get everything written down before I see my representative and I keep going in circles. I know what happened, but putting it in an order that someone else can follow is harder than I expected. Curious what other people struggled with most.',
   now() - interval '18 days', now() - interval '18 days'),

  ('f5000000-0000-4000-8000-000000000002',
   'dddddddd-0000-4000-8000-000000000002',
   (SELECT id FROM public.community_categories WHERE slug = 'documents-and-evidence'),
   'What types of documents did you find most useful when preparing your asylum application or hearing?',
   'I have a folder of things I brought with me and a few papers people sent afterwards, and I honestly do not know which of them matter. I would rather ask here first than take a pile of paper to an appointment and waste the time.',
   now() - interval '14 days', now() - interval '14 days'),

  ('f5000000-0000-4000-8000-000000000003',
   'dddddddd-0000-4000-8000-000000000003',
   (SELECT id FROM public.community_categories WHERE slug = 'hearings-and-interviews'),
   'How did you prepare yourself to answer difficult or unexpected questions during the asylum process?',
   'The part I am most afraid of is being asked something I have not thought about and freezing, or saying it badly. If you have already done this, how did you get ready for that part?',
   now() - interval '9 days', now() - interval '9 days'),

  ('f5000000-0000-4000-8000-000000000004',
   'dddddddd-0000-4000-8000-000000000001',
   (SELECT id FROM public.community_categories WHERE slug = 'asylum-process'),
   'Looking back, what is one thing you wish you had done earlier in your asylum preparation?',
   'Writing this partly for people who are at the beginning. There are things I would do differently if I could start again, and I think some of them would have saved me weeks. What would yours be?',
   now() - interval '5 days', now() - interval '5 days'),

  ('f5000000-0000-4000-8000-000000000005',
   'dddddddd-0000-4000-8000-000000000002',
   (SELECT id FROM public.community_categories WHERE slug = 'hearings-and-interviews'),
   'What helped you feel more prepared and confident before an asylum interview or hearing?',
   'Not the paperwork side so much as the rest of it. I am sleeping badly and I would like to hear what actually helped people, practically or otherwise, in the days before.',
   now() - interval '2 days', now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The replies, and a follow-up question on each.
--
-- Nobody replies to their own thread. The follow-ups matter more than they
-- look: a thread with one answer reads as finished, and a thread with a
-- question still open reads as somewhere a newcomer could join in.
--
-- The trigger on this table sets last_activity_at and reply_count on the
-- parent, so ordering on the forum index falls out of these timestamps.
-- ---------------------------------------------------------------------------
INSERT INTO public.community_comments (id, post_id, author_id, body, created_at)
VALUES
  -- Thread 1
  ('f6000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000002',
   'For me, the hardest part was putting everything in chronological order and making sure the important events were clear. I found it helpful to create a timeline with dates, places, people involved, and what happened. I also noted where I was unsure about exact dates instead of guessing.',
   now() - interval '17 days'),
  ('f6000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000002',
   'How did you organize your timeline? Did you use paper or an app? I started on paper and it became a mess very quickly.',
   now() - interval '16 days'),

  -- Thread 2
  ('f6000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000002',
   'dddddddd-0000-4000-8000-000000000003',
   'Documents that supported parts of my story were the most useful, such as identification records, messages, letters, medical or police documents where relevant, and evidence showing conditions connected to my situation. I learned that it was important to organize everything clearly and explain why each document mattered.',
   now() - interval '13 days'),
  ('f6000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000002',
   'dddddddd-0000-4000-8000-000000000003',
   'Did you explain documents that were missing? I have gaps I cannot fill and I do not know whether to raise that myself or wait to be asked.',
   now() - interval '12 days'),

  -- Thread 3
  ('f6000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000003',
   'dddddddd-0000-4000-8000-000000000001',
   'I practiced explaining my story in my own words instead of memorizing answers. I focused on being truthful and consistent, and I reviewed my application so I understood what had already been submitted. When I did not remember something exactly, I practiced saying that clearly rather than trying to invent an answer.',
   now() - interval '8 days'),
  ('f6000000-0000-4000-8000-000000000006', 'f5000000-0000-4000-8000-000000000003',
   'dddddddd-0000-4000-8000-000000000001',
   'What helped you stay consistent when you were nervous? That is the part I am least sure about.',
   now() - interval '7 days'),

  -- Thread 4
  ('f6000000-0000-4000-8000-000000000007', 'f5000000-0000-4000-8000-000000000004',
   'dddddddd-0000-4000-8000-000000000003',
   'I wish I had started organizing my documents and timeline much earlier. I had information in different places, so preparing everything became stressful. Starting early would have given me more time to identify missing documents, speak with my legal representative, and understand the process better.',
   now() - interval '4 days'),
  ('f6000000-0000-4000-8000-000000000008', 'f5000000-0000-4000-8000-000000000004',
   'dddddddd-0000-4000-8000-000000000003',
   'How early did you start speaking to a legal representative? I keep putting it off because I feel like I should have everything ready first, and I am not sure that is right.',
   now() - interval '3 days'),

  -- Thread 5
  ('f6000000-0000-4000-8000-000000000009', 'f5000000-0000-4000-8000-000000000005',
   'dddddddd-0000-4000-8000-000000000001',
   'Understanding the process helped me a lot. I reviewed my documents, practiced answering questions calmly, wrote down areas I needed to clarify with my lawyer or representative, and made sure I knew the date, time, and practical arrangements. Hearing other people''s experiences also helped, but I treated them as personal experiences rather than legal advice.',
   now() - interval '1 day'),
  ('f6000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-000000000005',
   'dddddddd-0000-4000-8000-000000000001',
   'How did you find people to share experiences with? That was the hardest part for me at the beginning.',
   now() - interval '20 hours')
ON CONFLICT (id) DO NOTHING;

-- A few likes, so the counters are not all zero. Nobody likes their own post.
INSERT INTO public.community_likes (post_id, user_id)
VALUES
  ('f5000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003'),
  ('f5000000-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002'),
  ('f5000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000002'),
  ('f5000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003'),
  ('f5000000-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

-- The reply trigger raised a notification for each seed author. They are real
-- rows for accounts nobody signs into, so clear them rather than leaving a
-- permanent unread count on three fictional people.
DELETE FROM public.community_notifications
WHERE recipient_id IN (
  'dddddddd-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000003'
);

RESET search_path;
