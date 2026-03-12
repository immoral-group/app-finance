-- Migration: Add currency column to employees table
-- Run this on Supabase SQL Editor

ALTER TABLE employees ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR';

COMMENT ON COLUMN employees.currency IS 'Payment currency: EUR or USD';
