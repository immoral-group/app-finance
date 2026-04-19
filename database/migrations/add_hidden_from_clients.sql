-- ============================================================
-- Migration: add_hidden_from_clients
-- Fecha: 2026-04-17
-- Descripción: Agrega la columna hidden_from_yyyymm a la tabla
--              clients para permitir ocultar visualmente filas
--              de clientes inactivos a partir de un mes/año
--              específico, sin eliminar sus datos históricos.
-- ============================================================

-- Agregar columna de ocultamiento por período
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS hidden_from_yyyymm INT NULL;

-- Formato del valor: YYYYMM como entero
-- Ejemplos:
--   202604 = oculto desde Abril 2026 en adelante
--   202601 = oculto desde Enero 2026 en adelante
--   NULL   = visible en todos los períodos (valor por defecto)
--
-- Lógica de filtrado en el backend:
--   Mostrar cliente si: hidden_from_yyyymm IS NULL
--                       OR hidden_from_yyyymm > (year * 100 + month)
--
-- Afecta a: Media Investment (ya implementado)
--           Billing Matrix (pendiente de replicar)
--
-- Para reactivar un cliente desde SQL (sin usar la UI):
--   UPDATE clients SET hidden_from_yyyymm = NULL WHERE id = 'uuid-del-cliente';
--
-- Para ver todos los clientes actualmente ocultos:
--   SELECT id, name, hidden_from_yyyymm FROM clients
--   WHERE hidden_from_yyyymm IS NOT NULL AND is_active = true
--   ORDER BY hidden_from_yyyymm, name;

-- Verificación (opcional):
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'clients' AND column_name = 'hidden_from_yyyymm';
