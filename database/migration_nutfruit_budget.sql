-- Nutfruit Budget: tracking paralelo de ingresos/gastos de budget
-- Separado del P&L principal para no afectar rentabilidad

CREATE TABLE IF NOT EXISTS nutfruit_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  row_type TEXT NOT NULL CHECK (row_type IN ('revenue', 'expense')),
  item_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_fixed BOOLEAN DEFAULT false,  -- filas fijas (no se pueden eliminar)
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

-- Filas por defecto para cada año se crearán desde la app al primer acceso
-- RLS: acceso para todos los autenticados en lectura, write solo superadmin (aplicado en la API)

COMMENT ON TABLE nutfruit_budget IS 'Tracking paralelo del presupuesto Nutfruit (Imcontent). No afecta al P&L principal.';
