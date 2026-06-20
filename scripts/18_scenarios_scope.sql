-- ============================================================
-- Separar escenarios de Forecast y Presupuesto
-- ============================================================

ALTER TABLE forecast_scenarios
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'forecast'
    CHECK (scope IN ('forecast', 'budget'));

CREATE INDEX IF NOT EXISTS idx_forecast_scenarios_scope ON forecast_scenarios(scope);

COMMENT ON COLUMN forecast_scenarios.scope IS 'forecast = Real Estimado · budget = Presupuesto. Bibliotecas independientes.';
