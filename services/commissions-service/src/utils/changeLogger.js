/**
 * changeLogger.js — commissions-service
 * ──────────────────────────────────────────────────────────────
 * Misma utilidad fire-and-forget que en admin-service.
 * Escribe en la tabla change_log (misma base Supabase).
 * NUNCA lanza excepciones — si el log falla, la operación sigue.
 * ──────────────────────────────────────────────────────────────
 */

export function extractUser(req) {
    try {
        const authHeader = req?.headers?.authorization;
        if (!authHeader) return { userId: null, userEmail: null };
        const token = authHeader.split(' ')[1];
        if (!token) return { userId: null, userEmail: null };
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
        console.warn('[ChangeLog] Failed to write log entry:', err?.message);
    }
}
