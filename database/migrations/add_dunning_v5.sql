-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — Fase 3.2: marcar envíos en modo prueba para no ensuciar KPIs
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE dunning_reminders
    ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_dunning_reminders_is_test ON dunning_reminders(is_test);

-- Marcar los recordatorios YA existentes como test si su sent_to coincide con
-- el test_mode_email actual O si el asunto lleva [PRUEBA]/[REDIRIGIDO].
-- (Convierte automáticamente los envíos de QA anteriores en no-KPI.)
UPDATE dunning_reminders SET is_test = true
    WHERE (subject LIKE '[PRUEBA]%' OR subject LIKE '[REDIRIGIDO]%')
    AND is_test = false;

-- También marcar como test los casos cuyos TODOS sus reminders son test.
ALTER TABLE dunning_cases
    ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

UPDATE dunning_cases SET is_test = true
    WHERE id IN (
        SELECT dc.id FROM dunning_cases dc
        WHERE NOT EXISTS (
            SELECT 1 FROM dunning_reminders dr
            WHERE dr.case_id = dc.id AND dr.is_test = false
        )
        AND EXISTS (
            SELECT 1 FROM dunning_reminders dr WHERE dr.case_id = dc.id
        )
    );

CREATE INDEX IF NOT EXISTS idx_dunning_cases_is_test ON dunning_cases(is_test);
