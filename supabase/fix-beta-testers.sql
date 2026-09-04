-- Fix: insert the seven real beta testers into beta_testers so they can
-- access the Beta feedback category and file reports.
--
-- Root cause: is_beta_tester() reads this table, which contained only a
-- placeholder UUID (aaaaaaaa-0000-4000-8000-000000000001) that matched no
-- real account. All seven testers got false, the Beta category was filtered
-- out, and report submissions were refused by RLS.
--
-- Run this against the linked Supabase project:
--   supabase db execute --file supabase/fix-beta-testers.sql
-- Or paste into the Supabase SQL editor on the dashboard.

-- Step 1: remove the placeholder row so it doesn't linger.
delete from beta_testers
where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Step 2: insert all seven signed-up testers.
-- Uses a sub-select on auth.users so this is idempotent and safe to re-run
-- (ON CONFLICT DO NOTHING). If a tester hasn't signed up yet, their row is
-- simply skipped with no error.

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'jollynate231'
from auth.users where email = 'jollynate231@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'krixx85'
from auth.users where email = 'lawrencechristopher254@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'jinx'
from auth.users where email = 'o54611626@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'dejavu_91'
from auth.users where email = 'olayiwolaayodeji5@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'kolawole_4'
from auth.users where email = 'jkaygabriel@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'kevin'
from auth.users where email = 'dangyangishaya247@gmail.com'
on conflict (user_id) do nothing;

insert into beta_testers (user_id, cohort, persona)
select id, 'forum-round-1', 'mbuzz101'
from auth.users where email = 'switchbenson50@gmail.com'
on conflict (user_id) do nothing;

-- Step 3: verify — should return 7 rows.
select bt.user_id, bt.persona, u.email, bt.cohort
from beta_testers bt
join auth.users u on u.id = bt.user_id
where bt.cohort = 'forum-round-1'
order by bt.persona;
