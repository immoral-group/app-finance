-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v10: días de envío de la alerta + historial de impagos
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo. Añade dos cosas:
--   1. Días de la semana en los que puede enviarse el email de alerta
--      (0=domingo … 6=sábado). Default: lunes.
--   2. Tabla de historial que guarda un snapshot diario por cliente que
--      supere el umbral. Sirve para métricas de cierre mensual:
--      "cliente X tuvo 3 facturas vencidas en marzo, 2 en abril, etc."
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS multi_alert_send_days smallint[] NOT NULL DEFAULT ARRAY[1];

-- ── Historial: un snapshot por cliente y día en el que estuvo por encima
-- del umbral. Único por (contact_id, ran_date) para no duplicar si el
-- cron corre dos veces el mismo día.
CREATE TABLE IF NOT EXISTS dunning_multi_alert_history (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ran_at              timestamptz NOT NULL DEFAULT now(),
    ran_date            date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Madrid')::date,

    contact_id          text,
    contact_name        text,
    contact_email       text,

    invoice_count       integer NOT NULL,
    max_days_overdue    integer NOT NULL,
    total_amount        numeric(14,2) NOT NULL DEFAULT 0,
    currency            text NOT NULL DEFAULT 'EUR',

    invoices            jsonb NOT NULL DEFAULT '[]'::jsonb,

    email_sent          boolean NOT NULL DEFAULT false,

    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dunning_multi_alert_history_unique
    ON dunning_multi_alert_history(contact_id, ran_date);
CREATE INDEX IF NOT EXISTS idx_dunning_multi_alert_history_contact
    ON dunning_multi_alert_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_dunning_multi_alert_history_ran_date
    ON dunning_multi_alert_history(ran_date DESC);

ALTER TABLE dunning_multi_alert_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'dunning_multi_alert_history'
          AND policyname = 'dunning_multi_alert_history_superadmin_all'
    ) THEN
        CREATE POLICY dunning_multi_alert_history_superadmin_all ON dunning_multi_alert_history
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;
END$$;
