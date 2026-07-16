-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v7: historial de ejecuciones del cron + tracking de aperturas
-- ═══════════════════════════════════════════════════════════════════════
-- Todo aditivo. Sin borrar nada existente.

-- ── Histórico completo de ejecuciones del cron ──────────────────────────
-- Antes solo guardábamos "last_cron_run_at" en dunning_config. Ahora
-- registramos CADA llamada del cron (Vercel o manual), con motivo si se
-- saltó y summary si envió, para poder ver en la UI por qué no salieron
-- correos y cuándo pegó el cron por última vez.
CREATE TABLE IF NOT EXISTS dunning_cron_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ran_at          timestamptz NOT NULL DEFAULT now(),

    -- 'vercel-cron' | 'manual' (curl / botón "ejecutar ahora")
    source          text NOT NULL DEFAULT 'vercel-cron',
    -- endpoint: 'run' | 'sync-paid'
    endpoint        text NOT NULL,

    -- 'ok' | 'skipped' | 'error'
    status          text NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
    -- Motivo cuando status='skipped' o 'error'
    -- p.ej. 'system-disabled' | 'not-scheduled' | 'ran-recently' | 'error: <msg>'
    reason          text,

    -- Detalle: para status='ok' guardamos { sent, failed, skipped, summary, executed[] }
    -- para skipped guardamos { schedule, last_cron_run_at, ... }
    summary         jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Marca si el envío fue en modo prueba (respetando is_test de config)
    is_test         boolean NOT NULL DEFAULT false,

    duration_ms     integer
);

CREATE INDEX IF NOT EXISTS idx_dunning_cron_runs_ran_at
    ON dunning_cron_runs(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_cron_runs_status
    ON dunning_cron_runs(status);
CREATE INDEX IF NOT EXISTS idx_dunning_cron_runs_endpoint
    ON dunning_cron_runs(endpoint);

ALTER TABLE dunning_cron_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'dunning_cron_runs'
          AND policyname = 'dunning_cron_runs_superadmin_all'
    ) THEN
        CREATE POLICY dunning_cron_runs_superadmin_all ON dunning_cron_runs
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;
END$$;


-- ── Tracking de aperturas de email ──────────────────────────────────────
-- Un pixel 1x1 invisible embebido en el email carga /dunning/track/open/:id.gif
-- cuando el cliente abre el correo. Nada bulletproof (Apple Mail Privacy
-- Protection pre-carga siempre; Gmail y Outlook web sí funcionan bien).
ALTER TABLE dunning_reminders
    ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_opened_at  timestamptz,
    ADD COLUMN IF NOT EXISTS open_count      integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dunning_reminders_opened
    ON dunning_reminders(first_opened_at) WHERE first_opened_at IS NOT NULL;
