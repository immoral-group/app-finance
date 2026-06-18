-- ============================================================
-- Forecast Scenarios — biblioteca persistente de escenarios
-- Compartido entre superadmin; se puede compartir con depto(s)
-- ============================================================

CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  scenario JSONB NOT NULL,
  shared_with_depts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_created_at  ON forecast_scenarios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_shared      ON forecast_scenarios USING GIN (shared_with_depts);

COMMENT ON TABLE forecast_scenarios IS 'Escenarios hipotéticos guardados para Forecast y Presupuesto';
COMMENT ON COLUMN forecast_scenarios.scenario IS 'JSON con range, revenue.globalPct/byDept y expenses.globalPct/bySection/byDept';
COMMENT ON COLUMN forecast_scenarios.shared_with_depts IS 'Lista de nombres de depto que pueden ver el escenario en su vista. Vacío = solo admins.';
