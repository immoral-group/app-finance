-- ================================================
-- MIGRATION: Add "Budget Influencer y Paid" service to Imcontent department
-- PURPOSE: Enable the "Budget Nutfruit" row in P&L Matrix to receive
--          data entered in Billing Matrix for the Imcontent department.
-- RUN ONCE in Supabase SQL Editor
-- ================================================

-- 1. Insert new service under IMCONT department (after INFLUENCER_UGC which is display_order=50)
INSERT INTO services (department_id, name, code, service_type, display_order)
VALUES (
    (SELECT id FROM departments WHERE code = 'IMCONT'),
    'Budget Influencer y Paid',
    'BUDGET_INFLUENCER_PAID',
    'revenue',
    55
)
ON CONFLICT (department_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 2. Assign to existing fiscal years (2025 and 2026)
INSERT INTO service_year_assignments (service_id, fiscal_year, is_active)
SELECT
    (SELECT id FROM services WHERE code = 'BUDGET_INFLUENCER_PAID'),
    y.year,
    true
FROM (VALUES (2025), (2026)) AS y(year)
ON CONFLICT (service_id, fiscal_year) DO NOTHING;
