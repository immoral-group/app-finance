-- ============================================================
-- CHANGE LOG TABLE
-- Historial de cambios por módulo (no-invasivo, tabla nueva)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS change_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_name     VARCHAR(50)  NOT NULL,           -- 'media', 'payments', 'billing', 'payroll'
    table_name      VARCHAR(100) NOT NULL,           -- tabla de BD afectada
    record_id       TEXT,                            -- ID del registro (texto para flexibilidad)
    record_label    TEXT,                            -- descripción legible del registro
    operation       VARCHAR(20)  NOT NULL            -- 'create' | 'update' | 'delete'
                    CHECK (operation IN ('create', 'update', 'delete')),
    field_name      TEXT,                            -- campo específico cambiado (si aplica)
    old_value       TEXT,                            -- valor anterior
    new_value       TEXT,                            -- valor nuevo
    changed_by_id   UUID,                            -- Supabase user ID
    changed_by_email TEXT,                           -- email del usuario
    changed_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Índices para consultas rápidas por módulo y fecha
CREATE INDEX IF NOT EXISTS idx_change_log_module    ON change_log(module_name);
CREATE INDEX IF NOT EXISTS idx_change_log_changed_at ON change_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_record    ON change_log(record_id);
CREATE INDEX IF NOT EXISTS idx_change_log_user      ON change_log(changed_by_id);

-- RLS: usuarios autenticados pueden leer, el backend (service_role) puede insertar
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_log_select
    ON change_log FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY change_log_insert
    ON change_log FOR INSERT
    WITH CHECK (true);   -- service_role bypasses RLS de todas formas

COMMENT ON TABLE change_log IS 'Historial de cambios por módulo — quién cambió qué y cuándo.';
