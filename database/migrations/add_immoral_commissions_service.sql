-- ================================================
-- MIGRATION: Add "Otras Comisiones" service to Immoral department
-- PURPOSE: Enable the "Otras comisiones" row in P&L Matrix to receive
--          data entered in Billing Matrix for the Immoral department.
-- RUN ONCE in Supabase SQL Editor
-- ================================================

-- 1. Insert new service under IMMORAL department
INSERT INTO services (department_id, name, code, service_type, display_order)
VALUES (
    (SELECT id FROM departments WHERE code = 'IMMORAL'),
    'Otras Comisiones',
    'IMMORAL_COMMISSIONS',
    'revenue',
    30
)
ON CONFLICT (department_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 2. Assign to existing fiscal years (2025 and 2026)
INSERT INTO service_year_assignments (service_id, fiscal_year, is_active)
SELECT
    (SELECT id FROM services WHERE code = 'IMMORAL_COMMISSIONS'),
    y.year,
    true
FROM (VALUES (2025), (2026)) AS y(year)
ON CONFLICT (service_id, fiscal_year) DO NOTHING;
