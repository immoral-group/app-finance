import express from 'express';
import supabase from '../config/supabase.js';
import { renderDunningEmail, SAMPLE_VARS } from '../lib/dunningRenderer.js';

const router = express.Router();

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';

async function holdedFetch(path) {
    const apiKey = process.env.HOLDED_API_KEY;
    if (!apiKey) throw new Error('HOLDED_API_KEY not configured');
    const res = await fetch(`${HOLDED_BASE}${path}`, {
        headers: { key: apiKey, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Holded API error ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
// El módulo de impagos es sensible: solo superadmins pueden leer/escribir.
async function requireSuperAdmin(req, res, next) {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: 'no-auth' });
    const token = authorization.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'invalid-token' });
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'superadmin') {
        return res.status(403).json({ error: 'forbidden' });
    }
    req.userId = user.id;
    next();
}

router.use(requireSuperAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(fromMs, toMs) {
    return Math.floor((toMs - fromMs) / 86_400_000);
}

// Holded devuelve fechas como timestamps unix (segundos) en varios campos.
// dueDate es normalmente segundos, pero por seguridad detectamos milisegundos.
function normalizeTimestamp(ts) {
    if (!ts && ts !== 0) return null;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? n : n * 1000;
}

function classifyLevel(daysOverdue, config) {
    if (daysOverdue < config.level_1_days_min) return 0;
    if (daysOverdue <= config.level_1_days_max) return 1;
    if (daysOverdue <= config.level_2_days_max) return 2;
    return 3;
}

async function getConfig() {
    const { data, error } = await supabase
        .from('dunning_config')
        .select('*')
        .eq('id', 1)
        .single();
    if (error) throw new Error(error.message);
    return data;
}

// ── GET /dunning/config ───────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
    try {
        res.json({ config: await getConfig() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /dunning/config ───────────────────────────────────────────────────────
router.put('/config', async (req, res) => {
    try {
        const allowed = [
            'enabled', 'send_days', 'send_hour', 'send_minute', 'timezone',
            'level_1_days_min', 'level_1_days_max',
            'level_2_days_min', 'level_2_days_max', 'level_3_days_min',
            'level_3_repeat_every_days',
            'min_amount', 'excluded_contact_ids', 'bcc_email',
        ];
        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
        patch.updated_at = new Date().toISOString();
        patch.updated_by = req.userId;

        const { data, error } = await supabase
            .from('dunning_config')
            .update(patch)
            .eq('id', 1)
            .select()
            .single();
        if (error) throw new Error(error.message);
        res.json({ config: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/templates ────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
    try {
        let q = supabase.from('dunning_templates').select('*').order('level').order('created_at');
        if (req.query.level) q = q.eq('level', Number(req.query.level));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ templates: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /dunning/templates/:id ────────────────────────────────────────────────
router.put('/templates/:id', async (req, res) => {
    try {
        const allowed = ['name', 'subject', 'blocks', 'active'];
        const patch = {};
        for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
        patch.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('dunning_templates')
            .update(patch)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        res.json({ template: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /dunning/preview ─────────────────────────────────────────────────────
// Renderiza HTML a partir de bloques + subject con SAMPLE_VARS. Usado por el
// editor para la previsualización en vivo.
router.post('/preview', (req, res) => {
    try {
        const { blocks = [], subject = '', vars } = req.body || {};
        const rendered = renderDunningEmail({
            blocks,
            subject,
            vars: { ...SAMPLE_VARS, ...(vars || {}) },
        });
        res.json({ ...rendered, sample_vars: SAMPLE_VARS });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/overdue-invoices ─────────────────────────────────────────────
// Lee facturas pendientes en Holded, filtra las vencidas, calcula días vencidos
// y nivel sugerido. Cruza con dunning_cases para saber cuántos recordatorios ya
// se han enviado.
router.get('/overdue-invoices', async (_req, res) => {
    try {
        const config = await getConfig();
        const holded = await holdedFetch('/documents/invoice?paid=0');
        const invoices = Array.isArray(holded) ? holded : [];
        const now = Date.now();

        // Cargar casos existentes en un solo query para cruzar.
        const ids = invoices.map(i => i.id).filter(Boolean);
        const { data: cases } = ids.length
            ? await supabase.from('dunning_cases').select('*').in('invoice_id', ids)
            : { data: [] };
        const caseByInvoice = new Map((cases || []).map(c => [c.invoice_id, c]));

        const overdue = [];
        for (const inv of invoices) {
            const dueMs = normalizeTimestamp(inv.dueDate);
            if (!dueMs) continue;
            const daysOverdue = daysBetween(dueMs, now);
            if (daysOverdue < config.level_1_days_min) continue;

            // Filtros de configuración
            const total = Number(inv.total || 0);
            if (total < Number(config.min_amount || 0)) continue;
            if ((config.excluded_contact_ids || []).includes(inv.contact)) continue;

            const level = classifyLevel(daysOverdue, config);
            const existingCase = caseByInvoice.get(inv.id);

            overdue.push({
                invoice_id: inv.id,
                invoice_number: inv.docNumber || inv.num || '',
                contact_id: inv.contact || '',
                contact_name: inv.contactName || '',
                contact_email: inv.contactEmail || inv.email || '',
                amount: total,
                currency: inv.currency || 'EUR',
                invoice_date: normalizeTimestamp(inv.date),
                due_date: dueMs,
                days_overdue: daysOverdue,
                suggested_level: level,
                reminders_count: existingCase?.reminders_count || 0,
                last_reminder_at: existingCase?.last_reminder_at || null,
                last_reminder_level: existingCase?.last_reminder_level || null,
                case_status: existingCase?.status || 'open',
            });
        }

        overdue.sort((a, b) => b.days_overdue - a.days_overdue);
        res.json({ invoices: overdue, total_count: overdue.length });
    } catch (err) {
        console.error('[dunning] overdue-invoices error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/cases ────────────────────────────────────────────────────────
router.get('/cases', async (req, res) => {
    try {
        const status = req.query.status;
        let q = supabase
            .from('dunning_cases')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(req.query.limit) || 200);
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        res.json({ cases: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/cases/:id ────────────────────────────────────────────────────
router.get('/cases/:id', async (req, res) => {
    try {
        const [{ data: caseRow, error: caseErr }, { data: reminders, error: remErr }] = await Promise.all([
            supabase.from('dunning_cases').select('*').eq('id', req.params.id).single(),
            supabase.from('dunning_reminders').select('*').eq('case_id', req.params.id).order('sent_at', { ascending: false }),
        ]);
        if (caseErr) throw new Error(caseErr.message);
        if (remErr) throw new Error(remErr.message);
        res.json({ case: caseRow, reminders: reminders || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /dunning/stats ────────────────────────────────────────────────────────
// KPIs para el dashboard. Se calcula sobre lo que hay en Supabase — el conteo
// de facturas vencidas actuales viene de /overdue-invoices (Holded live).
router.get('/stats', async (_req, res) => {
    try {
        const [
            { count: openCases },
            { count: paidCases },
            { data: paidWithDays },
            { count: totalReminders },
            { data: remindersByLevel },
        ] = await Promise.all([
            supabase.from('dunning_cases').select('*', { count: 'exact', head: true }).eq('status', 'open'),
            supabase.from('dunning_cases').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
            supabase.from('dunning_cases').select('days_to_pay').eq('status', 'paid').not('days_to_pay', 'is', null),
            supabase.from('dunning_reminders').select('*', { count: 'exact', head: true }),
            supabase.from('dunning_reminders').select('level').eq('status', 'sent'),
        ]);

        const daysArr = (paidWithDays || []).map(r => r.days_to_pay).filter(n => n != null);
        const avgDaysToPay = daysArr.length
            ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
            : null;

        const perLevel = { 1: 0, 2: 0, 3: 0 };
        for (const r of remindersByLevel || []) {
            if (perLevel[r.level] !== undefined) perLevel[r.level] += 1;
        }

        res.json({
            open_cases: openCases || 0,
            paid_cases: paidCases || 0,
            total_reminders: totalReminders || 0,
            avg_days_to_pay: avgDaysToPay,
            reminders_by_level: perLevel,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
