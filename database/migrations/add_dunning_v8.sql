-- ═══════════════════════════════════════════════════════════════════════
-- IMPAGOS — v8: CC (carbon copy) en recordatorios
-- ═══════════════════════════════════════════════════════════════════════
-- Aditivo. Añade soporte para que cada recordatorio incluya una o varias
-- direcciones en CC — tanto globales (config) como por cliente (override).
--
-- Diferencia respecto al BCC ya existente:
--   • bcc_email  → copia oculta única, para visibilidad interna (admin).
--   • cc_emails  → copia visible, para que los interlocutores del cliente
--                  (gestor, financiero, comercial) vean el email.
-- ═══════════════════════════════════════════════════════════════════════

-- Lista global de emails que van SIEMPRE en CC de todos los recordatorios.
ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Lista de emails en CC específicos por contacto Holded. Se suman a los
-- globales del config (no los reemplazan) — así puedes tener administracion@
-- siempre y añadir a mayores el CFO del cliente concreto.
ALTER TABLE dunning_email_overrides
    ADD COLUMN IF NOT EXISTS override_cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Snapshot del CC realmente enviado en cada recordatorio — auditable a
-- posteriori aunque la config global cambie después.
ALTER TABLE dunning_reminders
    ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[];
