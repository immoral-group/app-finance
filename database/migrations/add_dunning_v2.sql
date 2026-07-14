-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — Fase 3: diseño premium + integración Stripe + bancos
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo: no borra ni renombra columnas. Todo lo anterior sigue funcionando.
-- ═══════════════════════════════════════════════════════════════════════

-- ── dunning_config: marca + bancos + labels globales ──────────────────

ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS brand_logo_text        text NOT NULL DEFAULT 'immoral',
    ADD COLUMN IF NOT EXISTS brand_primary_color    text NOT NULL DEFAULT '#0ea5e9',
    ADD COLUMN IF NOT EXISTS brand_secondary_color  text NOT NULL DEFAULT '#1e40af',
    ADD COLUMN IF NOT EXISTS signature_html         text NOT NULL DEFAULT 'Un saludo,<br><strong>Equipo Immoral</strong>',
    ADD COLUMN IF NOT EXISTS cta_stripe_label       text NOT NULL DEFAULT 'Pagar ahora con tarjeta',
    ADD COLUMN IF NOT EXISTS cta_bank_prefix        text NOT NULL DEFAULT '¿Prefieres pagar por transferencia? Selecciona tu banco:',
    ADD COLUMN IF NOT EXISTS status_label           text NOT NULL DEFAULT 'Pendiente de pago',
    ADD COLUMN IF NOT EXISTS banks                  jsonb NOT NULL DEFAULT '[
      {"name":"BBVA","url":"https://www.bbva.es","color":"#004481"},
      {"name":"Santander","url":"https://www.bancosantander.es","color":"#EC0000"},
      {"name":"CaixaBank","url":"https://www.caixabank.es","color":"#1973B8"}
    ]'::jsonb;


-- ── dunning_reminders: link Stripe generado en el envío ─────────────

ALTER TABLE dunning_reminders
    ADD COLUMN IF NOT EXISTS stripe_session_id text,
    ADD COLUMN IF NOT EXISTS stripe_payment_url text;


-- ── dunning_templates: hero + copies estructurados por nivel ─────────

ALTER TABLE dunning_templates
    ADD COLUMN IF NOT EXISTS hero_title    text,
    ADD COLUMN IF NOT EXISTS hero_subtitle text,
    ADD COLUMN IF NOT EXISTS intro_copy    text,
    ADD COLUMN IF NOT EXISTS outro_copy    text;

-- Rellenar defaults para las 3 plantillas activas (una por nivel) si están vacíos.
UPDATE dunning_templates SET
    hero_title = COALESCE(hero_title, 'Primer recordatorio de pago'),
    hero_subtitle = COALESCE(hero_subtitle, 'Seguimiento automático de factura pendiente'),
    intro_copy = COALESCE(intro_copy,
        'Hola {{contact_name}},\n\nEspero que este correo os encuentre bien.\n\nQueremos recordaros que la factura {{invoice_number}} continúa pendiente de pago desde hace {{days_overdue}} días.'),
    outro_copy = COALESCE(outro_copy,
        'Si ya habéis realizado el pago, agradeceríamos que nos enviaseis el comprobante o nos informarais sobre la fecha estimada.\n\nSi necesitáis algún dato o proceso adicional, no dudéis en contactarnos.')
    WHERE level = 1 AND active = true;

UPDATE dunning_templates SET
    hero_title = COALESCE(hero_title, 'Segundo recordatorio de pago'),
    hero_subtitle = COALESCE(hero_subtitle, 'Seguimiento automático de factura pendiente'),
    intro_copy = COALESCE(intro_copy,
        'Hola,\n\nEspero que este correo os encuentre bien.\n\nQueremos agradeceros por vuestra colaboración continua y la confianza que habéis depositado en Immoral durante todo este tiempo; lamentablemente, debemos abordar nuevamente el tema de las facturas pendientes.\n\nComo mencionamos en el correo anterior, la siguiente factura continúa pendiente de pago:'),
    outro_copy = COALESCE(outro_copy,
        'Comprendemos que pueden surgir desafíos financieros, y estamos aquí para trabajar con vosotros en la búsqueda de soluciones adecuadas.\n\nSi necesitáis algún dato o proceso adicional, no dudéis en contactarnos.\n\nSi ya habéis realizado el pago, agradeceríamos que nos enviaseis el comprobante o nos informarais sobre la fecha estimada.')
    WHERE level = 2 AND active = true;

UPDATE dunning_templates SET
    hero_title = COALESCE(hero_title, 'Aviso final de impago'),
    hero_subtitle = COALESCE(hero_subtitle, 'Factura vencida — requiere acción inmediata'),
    intro_copy = COALESCE(intro_copy,
        'Hola,\n\nEste es el aviso final sobre la factura {{invoice_number}}, vencida hace {{days_overdue}} días.\n\nHemos enviado recordatorios previos sin recibir respuesta ni el pago correspondiente. Necesitamos que se regularice la situación de forma urgente.'),
    outro_copy = COALESCE(outro_copy,
        'Si en los próximos días no recibimos noticias vuestras, nos veremos obligados a escalar el caso al departamento correspondiente.\n\nContactadnos hoy mismo para acordar una solución. Estamos disponibles para negociar plazos si es necesario.')
    WHERE level = 3 AND active = true;
