-- ============================================================
-- MIGRATION 2: Add fiscal_year to pl_custom_rows
-- This is ADDITIVE and safely re-runnable.
-- ============================================================

-- 1. Add fiscal_year column (nullable first for migration)
ALTER TABLE pl_custom_rows ADD COLUMN IF NOT EXISTS fiscal_year int;

-- 2. Duplicate existing rows for 2026 (current year)
-- First, set all existing rows without a fiscal_year to 2026
UPDATE pl_custom_rows SET fiscal_year = 2026 WHERE fiscal_year IS NULL;

-- 3. Duplicate all rows for 2025 (so both years have the same structure)
INSERT INTO pl_custom_rows (block_type, section_key, dept, item_name, fiscal_year)
SELECT block_type, section_key, dept, item_name, 2025
FROM pl_custom_rows
WHERE fiscal_year = 2026
ON CONFLICT DO NOTHING;

-- 4. Make fiscal_year NOT NULL and drop old unique constraint, add new one
ALTER TABLE pl_custom_rows ALTER COLUMN fiscal_year SET NOT NULL;

-- 5. Drop the old unique constraint (block_type, section_key, dept, item_name)
-- and add new one including fiscal_year
-- First check if it exists — we use DO block for safety
DO $$
BEGIN
    -- Try to drop old constraints (common naming patterns)
    BEGIN
        ALTER TABLE pl_custom_rows DROP CONSTRAINT IF EXISTS pl_custom_rows_block_type_section_key_dept_item_name_key;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER TABLE pl_custom_rows DROP CONSTRAINT IF EXISTS unique_custom_row;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- Add new unique constraint including fiscal_year
ALTER TABLE pl_custom_rows ADD CONSTRAINT unique_custom_row_per_year
    UNIQUE (block_type, section_key, dept, item_name, fiscal_year);
