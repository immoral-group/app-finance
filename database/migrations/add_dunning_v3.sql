-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — Fase 3.1: logo, modo prueba dirigido y overrides por cliente
-- ═══════════════════════════════════════════════════════════════════════

-- Logo del hero (URL pública).
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS brand_logo_url text NOT NULL DEFAULT 'https://imfinance.immoral.es/logo.png';

-- Modo prueba dirigido: todos los envíos van a test_mode_email en vez de al cliente.
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS test_mode        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS test_mode_email  text;


-- ── Overrides de email por contacto ────────────────────────────────────
-- Si un contacto de Holded tiene una entrada aquí, sus recordatorios van
-- a `override_email` en lugar del email configurado en Holded.
CREATE TABLE IF NOT EXISTS dunning_email_overrides (
    contact_id      text PRIMARY KEY,
    contact_name    text,
    override_email  text NOT NULL,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dunning_email_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_email_overrides' AND policyname = 'dunning_overrides_superadmin_all') THEN
        CREATE POLICY dunning_overrides_superadmin_all ON dunning_email_overrides
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;
END$$;
