-- ICEX Budget: tracking paralelo de campañas ICEX para Immedia
-- Totalmente independiente de Nutfruit/Imcontent

CREATE TABLE IF NOT EXISTS icex_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  row_type TEXT NOT NULL CHECK (row_type IN ('revenue', 'expense')),
  item_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_fixed BOOLEAN DEFAULT false,
  jan  DECIMAL(12,2) DEFAULT 0,
  feb  DECIMAL(12,2) DEFAULT 0,
  mar  DECIMAL(12,2) DEFAULT 0,
  apr  DECIMAL(12,2) DEFAULT 0,
  may  DECIMAL(12,2) DEFAULT 0,
  jun  DECIMAL(12,2) DEFAULT 0,
  jul  DECIMAL(12,2) DEFAULT 0,
  aug  DECIMAL(12,2) DEFAULT 0,
  sep  DECIMAL(12,2) DEFAULT 0,
  oct  DECIMAL(12,2) DEFAULT 0,
  nov  DECIMAL(12,2) DEFAULT 0,
  "dec" DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fiscal_year, row_type, item_name)
);

COMMENT ON TABLE icex_budget IS 'Tracking paralelo de campañas ICEX (Immedia). Independiente del P&L principal.';
