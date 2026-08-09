-- One case per applicant, enforced (S5-1).
--
-- The bug: a new user could end up with two cases, and Clarify — which reads
-- the case with `.maybeSingle()` — would then fail with "No case yet." on a
-- case that plainly existed. It was reported in an earlier sprint and the
-- cause was not found at the time.
--
-- The cause is a read-then-insert race with two writers:
--
--   * `handle_new_user` creates a draft case on signup (reference CASE-nnnnnn)
--   * `getOrCreateOwnCase` in the client reads, finds nothing, and inserts
--     (reference C-XXXXXXXX)
--
-- and the client function is called from two places that do NOT share React
-- Query's cache — `audit-service` on sign-in, and `consent.tsx` — so two
-- copies can be in flight at once. Reproduced in this project's own data:
-- the seed professional had C-92FB3101 and C-FFBE0DA4, created 279ms apart.
--
-- Nothing in the schema forbade it. Every read in the application assumes one
-- case per person, so this makes that assumption true rather than hoped-for.

-- -------------------------------------------------------------------------
-- 1. Merge existing duplicates.
--
-- Keep the oldest case, move audit history onto it, delete the rest — but
-- only when the extras carry no case material. If any duplicate holds a
-- person's actual work, this stops and says so rather than choosing for them.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  dup record;
  keep_id uuid;
  content_count bigint;
BEGIN
  FOR dup IN
    SELECT applicant_id FROM public.cases GROUP BY applicant_id HAVING count(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM public.cases
    WHERE applicant_id = dup.applicant_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    SELECT
      (SELECT count(*) FROM public.story_responses  WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.documents        WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.events           WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.extracted_facts  WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.consent_records  WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.sharing_grants   WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    + (SELECT count(*) FROM public.export_packages  WHERE case_id <> keep_id AND case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id))
    INTO content_count;

    IF content_count > 0 THEN
      RAISE EXCEPTION
        'applicant % has more than one case and the extra holds % rows of case material — merge by hand before applying this migration',
        dup.applicant_id, content_count;
    END IF;

    -- Audit history is append-only and belongs to the person, not the row.
    -- Move it rather than lose it.
    UPDATE public.audit_events
    SET case_id = keep_id
    WHERE case_id IN (SELECT id FROM public.cases WHERE applicant_id = dup.applicant_id)
      AND case_id <> keep_id;

    DELETE FROM public.cases
    WHERE applicant_id = dup.applicant_id AND id <> keep_id;

    RAISE NOTICE 'merged duplicate cases for applicant %, kept %', dup.applicant_id, keep_id;
  END LOOP;
END;
$$;

-- -------------------------------------------------------------------------
-- 2. Make it impossible.
-- -------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS cases_one_per_applicant
  ON public.cases (applicant_id);

COMMENT ON INDEX public.cases_one_per_applicant IS
  'One case per applicant. The whole application reads "the case" with maybeSingle(); this is what makes that safe. If multi-case support is ever wanted, this index and every maybeSingle() read have to change together.';

-- -------------------------------------------------------------------------
-- 3. One atomic call instead of read-then-insert.
--
-- With the index above, a losing racer gets a unique violation rather than a
-- second case — but a raised error in the client is still a broken screen.
-- This does the whole thing in one statement and returns the same row to
-- every caller, whichever of them arrives first.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_own_case()
RETURNS public.cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.cases;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO result FROM public.cases WHERE applicant_id = uid;
  IF FOUND THEN
    RETURN result;
  END IF;

  INSERT INTO public.cases (applicant_id, reference_code, status)
  VALUES (uid, 'CASE-' || lpad(nextval('public.case_ref_seq')::text, 6, '0'), 'draft')
  ON CONFLICT (applicant_id) DO NOTHING
  RETURNING * INTO result;

  -- ON CONFLICT DO NOTHING returns no row when someone else won the race;
  -- read theirs.
  IF result.id IS NULL THEN
    SELECT * INTO result FROM public.cases WHERE applicant_id = uid;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_own_case() FROM public;
GRANT EXECUTE ON FUNCTION public.get_or_create_own_case() TO authenticated;

COMMENT ON FUNCTION public.get_or_create_own_case() IS
  'The one way to reach an applicant''s case. Atomic, so the two client call sites that do not share a query cache cannot create two cases between them.';
