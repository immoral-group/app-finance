-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v9: alerta de clientes con múltiples facturas vencidas
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo. Configura una alerta que salta cuando el mismo cliente tiene
-- N o más facturas vencidas a la vez.
--   • En la app: banner visible para superadmins.
--   • Por email: resumen a un destinatario + CC configurables, con
--     anti-spam de 24h controlado por multi_alert_last_sent_at.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_enabled       boolean       NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS multi_alert_threshold     smallint      NOT NULL DEFAULT 2
        CHECK (multi_alert_threshold >= 2),
    ADD COLUMN IF NOT EXISTS multi_alert_to            text,
    ADD COLUMN IF NOT EXISTS multi_alert_cc_emails     text[]        NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS multi_alert_last_sent_at  timestamptz,
    ADD COLUMN IF NOT EXISTS multi_alert_last_summary  jsonb         NOT NULL DEFAULT '{}'::jsonb;
