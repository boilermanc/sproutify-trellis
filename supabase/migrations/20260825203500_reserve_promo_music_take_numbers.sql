CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_music_generation_take_reservation
  ON public.promo_jobs (revision_id, (input->>'take_number'))
  WHERE job_type = 'music_generate'
    AND status IN ('queued','running','succeeded')
    AND input ? 'take_number';
