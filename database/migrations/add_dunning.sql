-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS (Dunning) — schema
-- ═══════════════════════════════════════════════════════════════════════
-- Sistema de gestión y trazabilidad de recordatorios de facturas vencidas.
-- Sustituye el flujo de n8n que enviaba avisos los lunes sin registro.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Configuración global (single-row) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_config (
    id                          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    enabled                     boolean NOT NULL DEFAULT false,

    -- Programación del envío. send_days: 0=domingo … 6=sábado
    send_days                   smallint[] NOT NULL DEFAULT ARRAY[1],
    send_hour                   smallint NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 0 AND 23),
    send_minute                 smallint NOT NULL DEFAULT 0 CHECK (send_minute BETWEEN 0 AND 59),
    timezone                    text NOT NULL DEFAULT 'Europe/Madrid',

    -- Rangos de días vencido por nivel (por defecto: 5-9 / 10-14 / 15+)
    level_1_days_min            smallint NOT NULL DEFAULT 5,
    level_1_days_max            smallint NOT NULL DEFAULT 9,
    level_2_days_min            smallint NOT NULL DEFAULT 10,
    level_2_days_max            smallint NOT NULL DEFAULT 14,
    level_3_days_min            smallint NOT NULL DEFAULT 15,

    -- Cada cuántos días se repite el nivel 3 (por defecto: semanal)
    level_3_repeat_every_days   smallint NOT NULL DEFAULT 7,

    -- Filtros: excluir facturas menores a X o de contactos concretos
    min_amount                  numeric(12,2) NOT NULL DEFAULT 0,
    excluded_contact_ids        text[] NOT NULL DEFAULT ARRAY[]::text[],

    -- Copia con visibilidad interna (para pruebas)
    bcc_email                   text,

    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid REFERENCES auth.users(id)
);

INSERT INTO dunning_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- ── Plantillas de email por nivel ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    level           smallint NOT NULL CHECK (level IN (1, 2, 3)),
    name            text NOT NULL,
    subject         text NOT NULL,

    -- Estructura de bloques del editor drag & drop.
    -- Formato: [{ id, type: 'header'|'text'|'cta'|'invoice_table'|'signature'|'spacer',
    --            props: { ... } }]
    blocks          jsonb NOT NULL DEFAULT '[]'::jsonb,

    active          boolean NOT NULL DEFAULT true,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_templates_level_active
    ON dunning_templates(level, active);


-- ── Casos de impago (uno por factura Holded vencida) ────────────────────
CREATE TABLE IF NOT EXISTS dunning_cases (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id          text NOT NULL UNIQUE,
    invoice_number      text,
    contact_id          text,
    contact_name        text,
    contact_email       text,

    amount              numeric(14,2),
    currency            text DEFAULT 'EUR',
    invoice_date        timestamptz,
    due_date            timestamptz,

    -- 'open' | 'paid' | 'cancelled'
    status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paid', 'cancelled')),

    first_reminder_at   timestamptz,
    last_reminder_at    timestamptz,
    last_reminder_level smallint,
    reminders_count     integer NOT NULL DEFAULT 0,

    paid_at             timestamptz,
    days_to_pay         integer,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_cases_status ON dunning_cases(status);
CREATE INDEX IF NOT EXISTS idx_dunning_cases_contact ON dunning_cases(contact_id);
CREATE INDEX IF NOT EXISTS idx_dunning_cases_due_date ON dunning_cases(due_date);


-- ── Recordatorios enviados (uno por email disparado) ────────────────────
CREATE TABLE IF NOT EXISTS dunning_reminders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id             uuid NOT NULL REFERENCES dunning_cases(id) ON DELETE CASCADE,
    invoice_id          text NOT NULL,

    level               smallint NOT NULL CHECK (level IN (1, 2, 3)),
    template_id         uuid REFERENCES dunning_templates(id) ON DELETE SET NULL,

    days_overdue        integer NOT NULL,

    sent_at             timestamptz NOT NULL DEFAULT now(),
    sent_to             text NOT NULL,
    subject             text,
    body_html_snapshot  text,

    smtp_message_id     text,

    -- 'sent' | 'failed' | 'skipped'
    status              text NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'failed', 'skipped')),
    error_message       text,

    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dunning_reminders_case ON dunning_reminders(case_id);
CREATE INDEX IF NOT EXISTS idx_dunning_reminders_sent_at ON dunning_reminders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_reminders_level_status ON dunning_reminders(level, status);


-- ── Seed inicial de plantillas (nivel 1, 2, 3) ──────────────────────────
-- Bloques por defecto en formato compatible con el editor drag&drop del frontend.
INSERT INTO dunning_templates (level, name, subject, blocks, active) VALUES
(1, 'Recordatorio nivel 1 (5-9 días)',
    'Recordatorio de pago — factura {{invoice_number}}',
    '[
      {"id":"b1","type":"header","props":{"text":"Recordatorio de pago"}},
      {"id":"b2","type":"text","props":{"text":"Hola {{contact_name}},\n\nEste es un recordatorio amistoso de que la factura {{invoice_number}} por un importe de {{amount}} venció hace {{days_overdue}} días. Si ya la has pagado, por favor, ignora este mensaje."}},
      {"id":"b3","type":"invoice_table","props":{}},
      {"id":"b4","type":"cta","props":{"label":"Ver factura","url":"{{invoice_url}}"}},
      {"id":"b5","type":"signature","props":{"text":"Un saludo,\nEquipo Immoral"}}
    ]'::jsonb,
    true),
(2, 'Recordatorio nivel 2 (10-14 días)',
    'Factura vencida — {{invoice_number}} ({{days_overdue}} días)',
    '[
      {"id":"b1","type":"header","props":{"text":"Factura pendiente de pago"}},
      {"id":"b2","type":"text","props":{"text":"Hola {{contact_name}},\n\nLa factura {{invoice_number}} lleva ya {{days_overdue}} días vencida. Te agradeceríamos que procedas con el pago cuanto antes."}},
      {"id":"b3","type":"invoice_table","props":{}},
      {"id":"b4","type":"cta","props":{"label":"Pagar ahora","url":"{{invoice_url}}"}},
      {"id":"b5","type":"signature","props":{"text":"Un saludo,\nEquipo Immoral"}}
    ]'::jsonb,
    true),
(3, 'Recordatorio nivel 3 (+15 días)',
    'URGENTE: factura {{invoice_number}} vencida hace {{days_overdue}} días',
    '[
      {"id":"b1","type":"header","props":{"text":"Aviso urgente de impago"}},
      {"id":"b2","type":"text","props":{"text":"Hola {{contact_name}},\n\nLa factura {{invoice_number}} lleva {{days_overdue}} días vencida y aún no hemos recibido el pago. Por favor, ponte en contacto con nosotros lo antes posible para regularizar la situación."}},
      {"id":"b3","type":"invoice_table","props":{}},
      {"id":"b4","type":"cta","props":{"label":"Pagar ahora","url":"{{invoice_url}}"}},
      {"id":"b5","type":"signature","props":{"text":"Un saludo,\nEquipo Immoral"}}
    ]'::jsonb,
    true)
ON CONFLICT DO NOTHING;


-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE dunning_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_reminders ENABLE ROW LEVEL SECURITY;

-- Service role (backend) bypassa RLS.
-- Solo superadmins pueden leer/escribir directamente desde el frontend.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_config' AND policyname = 'dunning_config_superadmin_all') THEN
        CREATE POLICY dunning_config_superadmin_all ON dunning_config
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_templates' AND policyname = 'dunning_templates_superadmin_all') THEN
        CREATE POLICY dunning_templates_superadmin_all ON dunning_templates
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_cases' AND policyname = 'dunning_cases_superadmin_all') THEN
        CREATE POLICY dunning_cases_superadmin_all ON dunning_cases
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dunning_reminders' AND policyname = 'dunning_reminders_superadmin_all') THEN
        CREATE POLICY dunning_reminders_superadmin_all ON dunning_reminders
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
            WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));
    END IF;
END$$;
