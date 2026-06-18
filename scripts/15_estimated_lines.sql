-- ============================================================
-- Migration 15: Real Estimado tab — independent from Budget
-- Creates estimated_lines (mirror of budget_lines) and expands
-- pl_cell_notes view_type to include 'estimated' and 'dept-estimated'.
-- ============================================================

CREATE TABLE IF NOT EXISTS estimated_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fiscal_year INTEGER NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  line_type VARCHAR(20) NOT NULL CHECK (line_type IN ('revenue', 'expense')),

  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  expense_category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,

  jan DECIMAL(12, 2) DEFAULT 0,
  feb DECIMAL(12, 2) DEFAULT 0,
  mar DECIMAL(12, 2) DEFAULT 0,
  apr DECIMAL(12, 2) DEFAULT 0,
  may DECIMAL(12, 2) DEFAULT 0,
  jun DECIMAL(12, 2) DEFAULT 0,
  jul DECIMAL(12, 2) DEFAULT 0,
  aug DECIMAL(12, 2) DEFAULT 0,
  sep DECIMAL(12, 2) DEFAULT 0,
  oct DECIMAL(12, 2) DEFAULT 0,
  nov DECIMAL(12, 2) DEFAULT 0,
  dec DECIMAL(12, 2) DEFAULT 0,

  annual_total DECIMAL(12, 2) GENERATED ALWAYS AS (
    jan + feb + mar + apr + may + jun + jul + aug + sep + oct + nov + dec
  ) STORED,

  notes TEXT,
  cell_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT estimated_line_reference CHECK (
    (line_type = 'revenue' AND service_id IS NOT NULL) OR
    (line_type = 'expense' AND expense_category_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_estimated_year ON estimated_lines(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_estimated_department ON estimated_lines(department_id);
CREATE INDEX IF NOT EXISTS idx_estimated_type ON estimated_lines(line_type);

COMMENT ON TABLE estimated_lines IS 'Real Estimado — proyección independiente del Presupuesto';

-- Expand view_type constraint on pl_cell_notes
ALTER TABLE pl_cell_notes
    DROP CONSTRAINT IF EXISTS pl_cell_notes_view_type_check;

ALTER TABLE pl_cell_notes
    ADD CONSTRAINT pl_cell_notes_view_type_check
    CHECK (view_type IN (
      'real', 'budget', 'comparison', 'estimated',
      'dept-real', 'dept-budget', 'dept-comparison', 'dept-estimated'
    ));
