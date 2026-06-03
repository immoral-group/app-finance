-- Add "Diseño de Landing" service to Imcontent department
-- Uses ON CONFLICT DO NOTHING so it's safe to run even if created via UI custom row

DO $$
DECLARE
    v_dept_id UUID;
    v_service_id UUID;
BEGIN
    SELECT id INTO v_dept_id FROM departments WHERE code = 'IMCONT';

    IF v_dept_id IS NULL THEN
        RAISE EXCEPTION 'Department IMCONT not found';
    END IF;

    -- Insert service (safe if already exists)
    INSERT INTO services (department_id, name, code, service_type, display_order)
    VALUES (v_dept_id, 'Diseño de Landing', 'DISENO_LANDING', 'revenue', 70)
    ON CONFLICT (department_id, code) DO NOTHING;

    SELECT id INTO v_service_id FROM services WHERE code = 'DISENO_LANDING' AND department_id = v_dept_id;

    -- Assign to 2025 and 2026 (safe if already exists)
    INSERT INTO service_year_assignments (service_id, fiscal_year, is_active)
    VALUES
        (v_service_id, 2025, true),
        (v_service_id, 2026, true)
    ON CONFLICT (service_id, fiscal_year) DO UPDATE SET is_active = true;
END $$;
