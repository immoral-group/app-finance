/**
 * changeLogger.js
 * ──────────────────────────────────────────────────────────────
 * Utilidad fire-and-forget para registrar cambios en change_log.
 * NUNCA lanza excepciones — si el log falla, la operación sigue.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * Extrae userId y userEmail del JWT que viene en Authorization header.
 * No hace llamada a Supabase — solo decodifica el payload (el usuario
 * ya está autenticado en este punto, esto es solo para display).
 *
 * @param {import('express').Request} req
 * @returns {{ userId: string|null, userEmail: string|null }}
 */
export function extractUser(req) {
    try {
        const authHeader = req?.headers?.authorization;
        if (!authHeader) return { userId: null, userEmail: null };
        const token = authHeader.split(' ')[1];
        if (!token) return { userId: null, userEmail: null };
        // Decode base64url payload (middle segment of JWT)
        const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
        );
        return {
            userId: payload.sub || null,
            userEmail: payload.email || null,
        };
    } catch {
        return { userId: null, userEmail: null };
    }
}

/**
 * Registra un cambio en la tabla change_log.
 * Siempre usar con .catch(() => {}) o sin await para que sea fire-and-forget.
 *
 * @param {object} supabase - Cliente Supabase (service role)
 * @param {object} opts
 * @param {string} opts.module       - Módulo: 'media' | 'payments' | 'billing' | 'payroll'
 * @param {string} opts.table        - Tabla de BD afectada
 * @param {string} [opts.recordId]   - ID del registro
 * @param {string} [opts.recordLabel]- Descripción legible
 * @param {string} opts.operation    - 'create' | 'update' | 'delete'
 * @param {string} [opts.fieldName]  - Campo específico modificado
 * @param {*}      [opts.oldValue]   - Valor anterior
 * @param {*}      [opts.newValue]   - Valor nuevo
 * @param {string} [opts.userId]     - ID del usuario (de extractUser)
 * @param {string} [opts.userEmail]  - Email del usuario (de extractUser)
 */
export async function logChange(supabase, {
    module,
    table,
    recordId,
    recordLabel,
    operation,
    fieldName,
    oldValue,
    newValue,
    userId,
    userEmail,
}) {
    try {
        await supabase.from('change_log').insert({
            module_name:      module,
            table_name:       table,
            record_id:        recordId  != null ? String(recordId)  : null,
            record_label:     recordLabel || null,
            operation,
            field_name:       fieldName  || null,
            old_value:        oldValue   != null ? String(oldValue)  : null,
            new_value:        newValue   != null ? String(newValue)  : null,
            changed_by_id:    userId     || null,
            changed_by_email: userEmail  || null,
        });
    } catch (err) {
        // Fallo silencioso — nunca interrumpe la operación principal
        console.warn('[ChangeLog] Failed to write log entry:', err?.message);
    }
}
