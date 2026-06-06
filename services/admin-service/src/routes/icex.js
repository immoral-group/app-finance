import express from 'express';
import supabase from '../config/supabase.js';
import { logChange, extractUser } from '../utils/changeLogger.js';

const router = express.Router();

const MONTH_COLS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const DEFAULT_ROWS = [
    { row_type: 'revenue', item_name: 'Campañas ICEX', sort_order: 0, is_fixed: true },
    { row_type: 'expense', item_name: 'Adspent ICEX',  sort_order: 0, is_fixed: true },
];

async function requireSuperAdmin(req, res) {
    const { userId } = extractUser(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return false; }
    const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'superadmin') { res.status(403).json({ error: 'Superadmin only' }); return false; }
    return true;
}

async function ensureDefaultRows(year) {
    for (const row of DEFAULT_ROWS) {
        await supabase
            .from('icex_budget')
            .upsert({ fiscal_year: year, ...row }, { onConflict: 'fiscal_year,row_type,item_name', ignoreDuplicates: true });
    }
}

// GET /icex/:year
router.get('/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        if (!year) return res.status(400).json({ error: 'Invalid year' });
        await ensureDefaultRows(year);
        const { data, error } = await supabase
            .from('icex_budget').select('*').eq('fiscal_year', year)
            .order('row_type').order('sort_order').order('item_name');
        if (error) throw error;
        res.json({ rows: data || [] });
    } catch (err) {
        console.error('[icex] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /icex/save
router.post('/save', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;
    try {
        const { year, row_id, month_idx, value } = req.body;
        if (!row_id || month_idx === undefined || value === undefined)
            return res.status(400).json({ error: 'Missing fields' });
        const col = MONTH_COLS[month_idx];
        if (!col) return res.status(400).json({ error: 'Invalid month_idx' });
        const { error } = await supabase
            .from('icex_budget')
            .update({ [col]: Number(value), updated_at: new Date().toISOString() })
            .eq('id', row_id).eq('fiscal_year', year);
        if (error) throw error;
        const { userId, userEmail } = extractUser(req);
        logChange({ userId, userEmail, module: 'icex_budget', action: 'edit_cell', year, details: { row_id, month: col, value } });
        res.json({ success: true });
    } catch (err) {
        console.error('[icex] save error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /icex/rows
router.post('/rows', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;
    try {
        const { year, item_name } = req.body;
        if (!year || !item_name?.trim()) return res.status(400).json({ error: 'Missing year or item_name' });
        const { data, error } = await supabase
            .from('icex_budget')
            .insert({ fiscal_year: year, row_type: 'revenue', item_name: item_name.trim(), sort_order: 99, is_fixed: false })
            .select().single();
        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Row already exists' });
            throw error;
        }
        res.json({ success: true, row: data });
    } catch (err) {
        console.error('[icex] add row error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /icex/rows/:id
router.delete('/rows/:id', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;
    try {
        const { data: row } = await supabase.from('icex_budget').select('is_fixed').eq('id', req.params.id).single();
        if (row?.is_fixed) return res.status(400).json({ error: 'Cannot delete a fixed row' });
        const { error } = await supabase.from('icex_budget').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[icex] delete row error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
