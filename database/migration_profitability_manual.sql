-- Rentabilidad por Cuenta: personas manuales y horas manuales
--
-- Para casos donde una persona ha trabajado en una cuenta pero su tiempo no
-- está accesible vía ClickUp (usuario desactivado, freelancer no enlazado al
-- workspace, etc). Permite cargar horas manualmente por (cliente, mes, persona)
-- de modo que aparezcan en el desglose del modal igual que las personas
-- detectadas automáticamente desde ClickUp.

-- Personas manuales: catálogo de personas con su coste/hora configurable
CREATE TABLE IF NOT EXISTS profitability_manual_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cost_per_hour DECIMAL(8,2) NOT NULL DEFAULT 0,
  department TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE profitability_manual_persons IS 'Personas cuyas horas se cargan manualmente (usuarios desactivados, freelancers, etc).';

-- Horas manuales: una fila por (cliente, persona manual, año, mes)
CREATE TABLE IF NOT EXISTS profitability_manual_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  manual_person_id UUID NOT NULL REFERENCES profitability_manual_persons(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, manual_person_id, year, month)
);

COMMENT ON TABLE profitability_manual_hours IS 'Horas cargadas manualmente por (cliente, persona, mes). Se suman al desglose mensual del cliente.';

CREATE INDEX IF NOT EXISTS idx_pmh_client_year ON profitability_manual_hours(client_id, year);
CREATE INDEX IF NOT EXISTS idx_pmh_person ON profitability_manual_hours(manual_person_id);
