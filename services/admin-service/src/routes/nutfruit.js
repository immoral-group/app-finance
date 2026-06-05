import express from 'express';
import supabase from '../config/supabase.js';
import { logChange, extractUser } from '../utils/changeLogger.js';

const router = express.Router();

const MONTH_COLS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const DEFAULT_ROWS = [
    { row_type: 'revenue', item_name: 'Budget Nutfruit', sort_order: 0, is_fixed: true },
    { row_type: 'expense', item_name: 'Influencers',     sort_order: 0, is_fixed: true },
    { row_type: 'expense', item_name: 'Ads Nutfruit',    sort_order: 1, is_fixed: true },
    { row_type: 'expense', item_name: 'Content',         sort_order: 2, is_fixed: true },
];

// Helper: check superadmin
async function requireSuperAdmin(req, res) {
    const { userId } = extractUser(req);
    if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return false;
    }
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .single();
    if (profile?.role !== 'superadmin') {
        res.status(403).json({ error: 'Superadmin only' });
        return false;
    }
    return true;
}

// Ensure default rows exist for a given year
async function ensureDefaultRows(year) {
    for (const row of DEFAULT_ROWS) {
        await supabase
            .from('nutfruit_budget')
            .upsert(
                { fiscal_year: year, ...row },
                { onConflict: 'fiscal_year,row_type,item_name', ignoreDuplicates: true }
            );
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /nutfruit/:year  — all rows for the year
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        if (!year) return res.status(400).json({ error: 'Invalid year' });

        await ensureDefaultRows(year);

        const { data, error } = await supabase
            .from('nutfruit_budget')
            .select('*')
            .eq('fiscal_year', year)
            .order('row_type')
            .order('sort_order')
            .order('item_name');

        if (error) throw error;
        res.json({ rows: data || [] });
    } catch (err) {
        console.error('[nutfruit] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /nutfruit/save  — save a single cell (superadmin only)
// body: { year, row_id, month_idx (0-11), value }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/save', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;

    try {
        const { year, row_id, month_idx, value } = req.body;
        if (!row_id || month_idx === undefined || value === undefined) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const col = MONTH_COLS[month_idx];
        if (!col) return res.status(400).json({ error: 'Invalid month_idx' });

        const { error } = await supabase
            .from('nutfruit_budget')
            .update({ [col]: Number(value), updated_at: new Date().toISOString() })
            .eq('id', row_id)
            .eq('fiscal_year', year);

        if (error) throw error;

        const { userId, userEmail } = extractUser(req);
        logChange({
            userId, userEmail, module: 'nutfruit_budget',
            action: 'edit_cell', year,
            details: { row_id, month: col, value }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[nutfruit] save error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /nutfruit/rows  — add a custom revenue row (superadmin only)
// body: { year, item_name }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/rows', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;

    try {
        const { year, item_name } = req.body;
        if (!year || !item_name?.trim()) {
            return res.status(400).json({ error: 'Missing year or item_name' });
        }

        const { data, error } = await supabase
            .from('nutfruit_budget')
            .insert({
                fiscal_year: year,
                row_type: 'revenue',
                item_name: item_name.trim(),
                sort_order: 99,
                is_fixed: false,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Row already exists' });
            throw error;
        }

        res.json({ success: true, row: data });
    } catch (err) {
        console.error('[nutfruit] add row error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /nutfruit/rows/:id  — remove a custom revenue row (superadmin only)
// ──────────────────────────────────────────────────────────────────────────────
router.delete('/rows/:id', async (req, res) => {
    const ok = await requireSuperAdmin(req, res);
    if (!ok) return;

    try {
        // Only allow deleting non-fixed rows
        const { data: row } = await supabase
            .from('nutfruit_budget')
            .select('is_fixed')
            .eq('id', req.params.id)
            .single();

        if (row?.is_fixed) {
            return res.status(400).json({ error: 'Cannot delete a fixed row' });
        }

        const { error } = await supabase
            .from('nutfruit_budget')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('[nutfruit] delete row error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
