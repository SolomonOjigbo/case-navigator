
-- Gate 1: an extracted fact cannot be attached to an event unless the user
-- confirmed it OR the model was reasonably confident. Enforced in the DB so
-- no client path can bypass the human-authority rule.
CREATE OR REPLACE FUNCTION public.enforce_gate1_on_event_sources()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  f public.extracted_facts%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.extracted_facts WHERE id = NEW.fact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gate1: fact % not found', NEW.fact_id;
  END IF;
  IF f.superseded_by_id IS NOT NULL OR f.stale = true THEN
    RAISE EXCEPTION 'gate1: fact % is superseded or stale', NEW.fact_id;
  END IF;
  IF f.user_marked_unsure = true AND f.user_confirmed = false THEN
    RAISE EXCEPTION 'gate1: fact % is marked unsure by the applicant', NEW.fact_id;
  END IF;
  IF f.user_confirmed = false AND f.extraction_confidence < 0.75 THEN
    RAISE EXCEPTION 'gate1: fact % below confidence threshold and not confirmed', NEW.fact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_sources_gate1 ON public.event_sources;
CREATE TRIGGER event_sources_gate1
  BEFORE INSERT ON public.event_sources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gate1_on_event_sources();
