-- Atomically reserve each voice take number while generation is active or has
-- succeeded. The Edge Function also reads these reservations when choosing the
-- next number; this index closes the concurrent-read race at insertion time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_voice_generation_take_reservation
  ON public.promo_jobs (revision_id, (input->>'take_number'))
  WHERE job_type = 'voice_generate'
    AND status IN ('queued','running','succeeded')
    AND input ? 'take_number';
