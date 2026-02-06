ALTER TABLE spoke_connections ADD COLUMN IF NOT EXISTS branch_skipped BOOLEAN DEFAULT false;
