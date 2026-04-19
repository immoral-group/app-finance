-- Migration: add visible_from_yyyymm to clients
-- Fixes the hide/unhide history: unhiding in a future month no longer
-- wipes the hidden state for past months.
--
-- A client is hidden in period X when:
--   hidden_from_yyyymm IS NOT NULL
--   AND hidden_from_yyyymm <= X
--   AND (visible_from_yyyymm IS NULL OR visible_from_yyyymm > X)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS visible_from_yyyymm integer DEFAULT NULL;
