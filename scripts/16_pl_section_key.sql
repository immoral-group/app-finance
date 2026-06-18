-- ============================================================
-- Migration 16: section_key en budget_lines y estimated_lines
-- Diferencia same-name items en distintas secciones del P&L
-- (ej. David en Immoralia: una linea en Sueldos y otra en Comisiones)
-- ============================================================

ALTER TABLE budget_lines    ADD COLUMN IF NOT EXISTS section_key VARCHAR(50);
ALTER TABLE estimated_lines ADD COLUMN IF NOT EXISTS section_key VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_budget_section_key    ON budget_lines(section_key);
CREATE INDEX IF NOT EXISTS idx_estimated_section_key ON estimated_lines(section_key);

-- ----------------------------------------------------------------
-- Mapeo (dept, item) -> section_key (estructura hardcodeada del front)
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS _pl_section_mapping;
CREATE TEMP TABLE _pl_section_mapping (
    dept_name TEXT,
    item_name TEXT,
    section_key TEXT
);

INSERT INTO _pl_section_mapping (dept_name, item_name, section_key) VALUES
-- personal
('Immedia','Alba','personal'),('Immedia','Andrés','personal'),('Immedia','Leidy','personal'),('Immedia','Externos','personal'),
('Imcontent','Flor','personal'),('Imcontent','Bruno','personal'),('Imcontent','Grego','personal'),('Imcontent','Silvia','personal'),('Imcontent','Angie','personal'),('Imcontent','Externos','personal'),
('Immoralia','David','personal'),('Immoralia','Manel','personal'),('Immoralia','Julian','personal'),('Immoralia','Externos','personal'),
('Immoral','Daniel','personal'),('Immoral','Mery','personal'),('Immoral','Yure','personal'),('Immoral','Marco','personal'),('Immoral','Externos puntuales','personal'),
('Imsales','Jorge Orts','personal'),
('Imfilms','Olga Garasym','personal'),
-- comisiones
('Imfilms','The connector','comisiones'),
('Imcontent','Marc','comisiones'),
('Imseo','Christian','comisiones'),
('Imfashion','Gemelos','comisiones'),
('Imsales','Jorge','comisiones'),
('Imfilms','Olga','comisiones'),
('Immoralia','David','comisiones'),  -- OVERLAP con personal
-- marketing
('Imfilms','Marketing','marketing'),('Imcontent','Marketing','marketing'),('Immedia','Marketing','marketing'),
('Immoralia','Marketing','marketing'),('Imsales','Marketing','marketing'),('Immoral','Marketing','marketing'),('Imfashion','Marketing','marketing'),
-- formacion
('Imcontent','Formación','formacion'),('Immedia','Formación','formacion'),('Immoralia','Formación','formacion'),
('Imsales','Formación','formacion'),('Immoral','Formación','formacion'),('Imfashion','Formación','formacion'),
-- software
('Immoral','Software','software'),('Immedia','Software','software'),('Imcontent','Software','software'),
('Immoralia','Software','software'),('Imsales','Software','software'),
-- gastosOp
('Immoral','Alquiler','gastosOp'),('Immoral','Asesoría','gastosOp'),('Immoral','Suministros','gastosOp'),
('Immoral','Viajes y reuniones','gastosOp'),('Immoral','Coche de empresa','gastosOp'),
('Immoral','Otras compras','gastosOp'),('Immoral','Financiamiento (Línea de crédito)','gastosOp'),
-- adspent
('Immedia','Adspent','adspent'),('Imcontent','Adspent Nutfruit','adspent'),('Imcontent','Influencers','adspent');

-- Mapeo combinado base + custom rows
DROP TABLE IF EXISTS _pl_combined_mapping;
CREATE TEMP TABLE _pl_combined_mapping AS
SELECT dept_name, item_name, section_key FROM _pl_section_mapping
UNION
SELECT dept AS dept_name, item_name, section_key
FROM pl_custom_rows
WHERE block_type = 'expense';

-- ----------------------------------------------------------------
-- BUDGET_LINES backfill
-- ----------------------------------------------------------------
-- 1) Para filas con UNA sola sección posible, asignar directamente
UPDATE budget_lines bl
SET section_key = sub.section_key
FROM (
    SELECT d.id AS dept_id, ec.id AS cat_id, MIN(cm.section_key) AS section_key,
           COUNT(DISTINCT cm.section_key) AS section_count
    FROM _pl_combined_mapping cm
    JOIN departments d ON d.name = cm.dept_name
    JOIN expense_categories ec ON ec.name = cm.item_name
    GROUP BY d.id, ec.id
) sub
WHERE bl.section_key IS NULL
  AND bl.line_type = 'expense'
  AND bl.department_id = sub.dept_id
  AND bl.expense_category_id = sub.cat_id
  AND sub.section_count = 1;

-- 2) Para filas en MÚLTIPLES secciones (David Immoralia): asignar 'personal'
-- y duplicar la fila para 'comisiones'.
UPDATE budget_lines bl
SET section_key = 'personal'
FROM departments d, expense_categories ec
WHERE bl.section_key IS NULL
  AND bl.line_type = 'expense'
  AND bl.department_id = d.id
  AND bl.expense_category_id = ec.id
  AND d.name = 'Immoralia'
  AND ec.name = 'David';

INSERT INTO budget_lines (
    fiscal_year, department_id, line_type, service_id, expense_category_id,
    jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, notes, cell_metadata, section_key
)
SELECT
    bl.fiscal_year, bl.department_id, bl.line_type, bl.service_id, bl.expense_category_id,
    bl.jan, bl.feb, bl.mar, bl.apr, bl.may, bl.jun, bl.jul, bl.aug, bl.sep, bl.oct, bl.nov, bl.dec,
    bl.notes, COALESCE(bl.cell_metadata, '{}'::jsonb), 'comisiones'
FROM budget_lines bl
JOIN departments d ON d.id = bl.department_id
JOIN expense_categories ec ON ec.id = bl.expense_category_id
WHERE d.name = 'Immoralia'
  AND ec.name = 'David'
  AND bl.line_type = 'expense'
  AND bl.section_key = 'personal'
  AND NOT EXISTS (
      SELECT 1 FROM budget_lines bl2
      WHERE bl2.fiscal_year = bl.fiscal_year
        AND bl2.department_id = bl.department_id
        AND bl2.expense_category_id = bl.expense_category_id
        AND bl2.section_key = 'comisiones'
  );

-- ----------------------------------------------------------------
-- ESTIMATED_LINES backfill (mismo procedimiento)
-- ----------------------------------------------------------------
UPDATE estimated_lines el
SET section_key = sub.section_key
FROM (
    SELECT d.id AS dept_id, ec.id AS cat_id, MIN(cm.section_key) AS section_key,
           COUNT(DISTINCT cm.section_key) AS section_count
    FROM _pl_combined_mapping cm
    JOIN departments d ON d.name = cm.dept_name
    JOIN expense_categories ec ON ec.name = cm.item_name
    GROUP BY d.id, ec.id
) sub
WHERE el.section_key IS NULL
  AND el.line_type = 'expense'
  AND el.department_id = sub.dept_id
  AND el.expense_category_id = sub.cat_id
  AND sub.section_count = 1;

UPDATE estimated_lines el
SET section_key = 'personal'
FROM departments d, expense_categories ec
WHERE el.section_key IS NULL
  AND el.line_type = 'expense'
  AND el.department_id = d.id
  AND el.expense_category_id = ec.id
  AND d.name = 'Immoralia'
  AND ec.name = 'David';

INSERT INTO estimated_lines (
    fiscal_year, department_id, line_type, service_id, expense_category_id,
    jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, notes, cell_metadata, section_key
)
SELECT
    el.fiscal_year, el.department_id, el.line_type, el.service_id, el.expense_category_id,
    el.jan, el.feb, el.mar, el.apr, el.may, el.jun, el.jul, el.aug, el.sep, el.oct, el.nov, el.dec,
    el.notes, COALESCE(el.cell_metadata, '{}'::jsonb), 'comisiones'
FROM estimated_lines el
JOIN departments d ON d.id = el.department_id
JOIN expense_categories ec ON ec.id = el.expense_category_id
WHERE d.name = 'Immoralia'
  AND ec.name = 'David'
  AND el.line_type = 'expense'
  AND el.section_key = 'personal'
  AND NOT EXISTS (
      SELECT 1 FROM estimated_lines el2
      WHERE el2.fiscal_year = el.fiscal_year
        AND el2.department_id = el.department_id
        AND el2.expense_category_id = el.expense_category_id
        AND el2.section_key = 'comisiones'
  );

DROP TABLE IF EXISTS _pl_section_mapping;
DROP TABLE IF EXISTS _pl_combined_mapping;
