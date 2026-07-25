
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS section_key text,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_supersedes_idx ON public.events(supersedes_id);
CREATE INDEX IF NOT EXISTS events_section_idx ON public.events(case_id, section_key);

DROP VIEW IF EXISTS public.timeline_view;
CREATE VIEW public.timeline_view
WITH (security_invoker = true) AS
SELECT
  e.id, e.case_id, e.reference_code, e.title,
  e.date_start, e.date_end, e.date_certainty, e.date_calendar,
  e.location_name, e.user_description, e.neutral_summary, e.consequences,
  e.provenance, e.unsupported, e.possible_divergence, e.feared_future_event,
  e.user_confirmed, e.professional_review_status, e.private_hold, e.stale,
  e.version, e.created_at,
  e.section_key, e.supersedes_id,
  COALESCE(src.source_count, 0)   AS source_count,
  COALESCE(evl.evidence_count, 0) AS evidence_count
FROM public.events e
LEFT JOIN (
  SELECT event_id, COUNT(DISTINCT source_id) AS source_count
  FROM public.event_sources GROUP BY event_id
) src ON src.event_id = e.id
LEFT JOIN (
  SELECT event_id, COUNT(*) AS evidence_count
  FROM public.evidence_event_links GROUP BY event_id
) evl ON evl.event_id = e.id
ORDER BY
  e.date_start ASC NULLS LAST,
  CASE e.date_certainty
    WHEN 'exact' THEN 1 WHEN 'approximate' THEN 2 WHEN 'range' THEN 3
    WHEN 'season' THEN 4 WHEN 'inferred' THEN 5 WHEN 'unknown' THEN 6
  END,
  e.created_at ASC;

GRANT SELECT ON public.timeline_view TO authenticated;
