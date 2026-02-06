-- Migration: Add spoke_connection_id to branches table
-- This links Supabase branch records to localStorage spoke connections
-- Run this in the Supabase SQL Editor

ALTER TABLE branches
ADD COLUMN IF NOT EXISTS spoke_connection_id TEXT DEFAULT NULL;

-- Optional: Add an index for lookups by spoke_connection_id
CREATE INDEX IF NOT EXISTS idx_branches_spoke_connection_id
ON branches (spoke_connection_id)
WHERE spoke_connection_id IS NOT NULL;
