-- Run this AFTER the initial payments_module.sql migration
-- Adds the incentives_amount column to the payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS incentives_amount NUMERIC(12,2) DEFAULT 0;
