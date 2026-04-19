import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

/**
 * GET /changelog
 * Devuelve entradas del historial de cambios.
 *
 * Query params:
 *   module    string  - Filtrar por módulo ('media', 'payments', 'billing', 'payroll')
 *   record_id string  - Filtrar por ID de registro específico
 *   limit     number  - Máx. registros a devolver (default 50, máx 200)
 *   offset    number  - Paginación (default 0)
 */
router.get('/', async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50,  200);
        const offset = Math.max(parseInt(req.query.offset) || 0,   0);
        const { module, record_id } = req.query;

        let query = supabase
            .from('change_log')
            .select('*', { count: 'exact' })
            .order('changed_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (module)    query = query.eq('module_name', module);
        if (record_id) query = query.eq('record_id', record_id);

        const { data, error, count } = await query;
        if (error) return res.status(500).json({ error: error.message });

        res.json({ changes: data || [], total: count ?? 0 });
    } catch (err) {
        console.error('[ChangeLog] Error fetching change log:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
