-- Claims are reviewed independently before the script can advance.
-- Keep this additive and idempotent for the Schema Engine stamp.
ALTER TABLE public.promo_approvals
  DROP CONSTRAINT IF EXISTS promo_approvals_gate_check;

ALTER TABLE public.promo_approvals
  ADD CONSTRAINT promo_approvals_gate_check
  CHECK (gate IN ('claims','script','storyboard','voice','music','assets','preview','final','publish'));
