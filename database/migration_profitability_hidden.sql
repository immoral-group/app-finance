-- Rentabilidad por Cuenta: items ocultos
--
-- Tabla genérica para ocultar elementos del módulo (clientes, usuarios ClickUp,
-- personas manuales). La presencia de la fila significa "oculto"; borrar la
-- fila reactiva el item. Sin estado intermedio.

CREATE TABLE IF NOT EXISTS profitability_hidden_items (
  scope TEXT NOT NULL,   -- 'client' | 'clickup_user' | 'manual_person'
  ref_id TEXT NOT NULL,  -- UUID del cliente / clickup user_id / UUID persona manual
  hidden_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (scope, ref_id)
);

COMMENT ON TABLE profitability_hidden_items IS 'Items ocultados del módulo Rentabilidad por cuenta. Genérico por scope.';
