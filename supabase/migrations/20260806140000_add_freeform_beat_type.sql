-- Allow the 'freeform' beat type — an AI-designed scene card (rendered by the
-- worker's FreeformScene) alongside the 7 fixed templates. The scene spec lives
-- in the beat's existing template_params JSONB, so no new column is needed.
ALTER TABLE trellis_clip_broll_beats DROP CONSTRAINT IF EXISTS trellis_clip_broll_beats_beat_type_check;
ALTER TABLE trellis_clip_broll_beats ADD CONSTRAINT trellis_clip_broll_beats_beat_type_check
  CHECK (beat_type = ANY (ARRAY[
    'motion_graphic','kinetic_quote_card','animation','ui_callout',
    'timeline','source_receipt_card','text_highlight','freeform'
  ]));
