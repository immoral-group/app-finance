-- Rentabilidad por Cuenta: tablas de configuración
-- user mappings: ClickUp user → coste/hora real
CREATE TABLE IF NOT EXISTS profitability_user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clickup_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  cost_per_hour DECIMAL(8,2) NOT NULL DEFAULT 0,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE profitability_user_mappings IS 'Mapeo de usuarios ClickUp con su coste/hora para cálculo de rentabilidad.';

-- client lists: cliente Finance → lista(s) ClickUp donde se registran sus horas
CREATE TABLE IF NOT EXISTS profitability_client_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clickup_list_id TEXT NOT NULL,
  clickup_list_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, clickup_list_id)
);

COMMENT ON TABLE profitability_client_lists IS 'Mapeo de clientes de Finance con sus listas de ClickUp donde se rastrean horas.';
