-- ============================================================
-- Migration: add_proveedor_cop_payments
-- Fecha: 2026-04-17
-- Descripción: Agrega el tipo de beneficiario 'proveedor' y
--              permite la moneda COP en el módulo de Payments.
-- ============================================================

-- Actualizar CHECK constraint de beneficiaries.type
-- para incluir 'proveedor'
ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_type_check;
ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_type_check
    CHECK (type IN ('equipo', 'influencer', 'comisiones', 'transfer', 'piso_yure', 'proveedor'));

-- Nota: la columna payments.currency es VARCHAR(3) sin CHECK constraint,
-- por lo que acepta COP sin ningún cambio adicional en la BD.
-- El cambio de COP es únicamente en el frontend (payments.ts y Payments.tsx).

-- Verificación (opcional, ejecutar para confirmar):
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'beneficiaries_type_check';
