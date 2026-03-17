-- ============================================================
-- MIGRATION: Year Isolation — Junction Tables
-- This migration is 100% ADDITIVE. It does NOT modify,
-- delete, or alter any existing table or data.
-- ============================================================

-- 1. Client Year Assignments
CREATE TABLE IF NOT EXISTS client_year_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  is_active boolean DEFAULT true,
  fee_config_override jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, fiscal_year)
);

-- 2. Service Year Assignments
CREATE TABLE IF NOT EXISTS service_year_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_id, fiscal_year)
);

-- 3. Category Year Assignments
CREATE TABLE IF NOT EXISTS category_year_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(category_id, fiscal_year)
);

-- ============================================================
-- POPULATE: Assign all existing active entities to 2025 & 2026
-- Uses ON CONFLICT to be safely re-runnable
-- ============================================================

-- Clients → 2025
INSERT INTO client_year_assignments (client_id, fiscal_year, is_active)
SELECT id, 2025, true FROM clients WHERE is_active = true
ON CONFLICT (client_id, fiscal_year) DO NOTHING;

-- Clients → 2026
INSERT INTO client_year_assignments (client_id, fiscal_year, is_active)
SELECT id, 2026, true FROM clients WHERE is_active = true
ON CONFLICT (client_id, fiscal_year) DO NOTHING;

-- Services → 2025
INSERT INTO service_year_assignments (service_id, fiscal_year, is_active)
SELECT id, 2025, true FROM services WHERE is_active = true
ON CONFLICT (service_id, fiscal_year) DO NOTHING;

-- Services → 2026
INSERT INTO service_year_assignments (service_id, fiscal_year, is_active)
SELECT id, 2026, true FROM services WHERE is_active = true
ON CONFLICT (service_id, fiscal_year) DO NOTHING;

-- Categories → 2025
INSERT INTO category_year_assignments (category_id, fiscal_year, is_active)
SELECT id, 2025, true FROM expense_categories WHERE is_active = true
ON CONFLICT (category_id, fiscal_year) DO NOTHING;

-- Categories → 2026
INSERT INTO category_year_assignments (category_id, fiscal_year, is_active)
SELECT id, 2026, true FROM expense_categories WHERE is_active = true
ON CONFLICT (category_id, fiscal_year) DO NOTHING;

-- ============================================================
-- ENABLE RLS (Row Level Security) — Allow service role full access
-- ============================================================
ALTER TABLE client_year_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_year_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_year_assignments ENABLE ROW LEVEL SECURITY;

-- Policies: Allow service_role full access (used by backend)
CREATE POLICY "service_role_full_access" ON client_year_assignments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON service_year_assignments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON category_year_assignments
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_client_year_fiscal ON client_year_assignments(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_service_year_fiscal ON service_year_assignments(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_category_year_fiscal ON category_year_assignments(fiscal_year);
