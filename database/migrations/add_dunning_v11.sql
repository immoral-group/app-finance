-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v11: hora configurable del email de alerta multi-vencida
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo. Añade la hora del día a la que se lanza el email de alerta.
-- El disparo se hace desde el cron horario 'run' (que ya se ejecuta a cada
-- hora en punto), verificando día + hora + anti-spam de 20h.
-- Por defecto: 9 h (mañana temprano, para poder actuar durante el día).
-- Zona horaria: la misma configurada en dunning_config.timezone.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_send_hour smallint NOT NULL DEFAULT 9
        CHECK (multi_alert_send_hour BETWEEN 0 AND 23);
