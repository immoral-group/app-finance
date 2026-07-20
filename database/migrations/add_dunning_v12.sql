-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v12: reporte periódico de facturas vencidas por email
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo. Reemplaza al envío manual que se hacía por n8n. Se dispara
-- desde el cron horario 'run' DESPUÉS del envío de recordatorios, para
-- que la columna "Recordatorio enviado" refleje el estado del día.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS overdue_report_enabled        boolean       NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS overdue_report_to             text,
    ADD COLUMN IF NOT EXISTS overdue_report_cc_emails      text[]        NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS overdue_report_send_days      smallint[]    NOT NULL DEFAULT ARRAY[1],
    ADD COLUMN IF NOT EXISTS overdue_report_send_hour      smallint      NOT NULL DEFAULT 10
        CHECK (overdue_report_send_hour BETWEEN 0 AND 23),
    ADD COLUMN IF NOT EXISTS overdue_report_last_sent_at   timestamptz,
    ADD COLUMN IF NOT EXISTS overdue_report_last_summary   jsonb         NOT NULL DEFAULT '{}'::jsonb;
