-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — Fase 2b: metadatos de ejecución del cron
-- ═══════════════════════════════════════════════════════════════════════
-- Idempotencia y trazabilidad del cron. Todo aditivo.

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS last_cron_run_at    timestamptz,
    ADD COLUMN IF NOT EXISTS last_cron_status    text,
    ADD COLUMN IF NOT EXISTS last_cron_summary   jsonb,
    ADD COLUMN IF NOT EXISTS last_sync_paid_at   timestamptz;
