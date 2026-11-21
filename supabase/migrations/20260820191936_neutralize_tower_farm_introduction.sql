-- Avoid asserting that every referred contact has already purchased equipment.
-- Operators still confirm list membership before starting the sequence, while
-- the introduction remains accurate for planning, installation, and live farms.
update public.lead_email_sequence_steps as step
set subject_template = 'Introducing Sproutify Farm for your Tower Farm project',
    updated_at = now()
from public.lead_email_sequences as sequence
where step.sequence_id = sequence.id
  and sequence.slug = 'sproutify-farm-new-tower'
  and step.step_number = 1
  and step.subject_template is distinct from 'Introducing Sproutify Farm for your Tower Farm project';

update public.lead_email_sequences
set name = 'Tower Farm Introduction',
    updated_at = now()
where slug = 'sproutify-farm-new-tower'
  and name is distinct from 'Tower Farm Introduction';
