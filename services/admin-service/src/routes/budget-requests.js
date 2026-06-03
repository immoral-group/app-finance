import express from 'express';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { createNotifications } from './notifications.js';

const router = express.Router();

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'administracion@immoral.es';
const APP_URL = process.env.APP_URL || 'https://app-finance.vercel.app';

function solicitudesUrl(deptCode) {
    return `${APP_URL}/departamentos/${deptCode}?tab=Solicitudes`;
}

function deptCodeFromLabel(dept) {
    const map = { Immedia: 'immedia', Imcontent: 'imcontent', Immoralia: 'immoralia', Imsales: 'imsales' };
    return map[dept] || dept.toLowerCase();
}

function emailBase(title, content) {
    return `
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 24px; }
        .card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px 28px; }
        .header h1 { color: white; margin: 0; font-size: 18px; font-weight: 700; }
        .header p { color: #c7d2fe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 24px 28px; }
        .kv { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .kv:last-child { border-bottom: none; }
        .kv .label { color: #64748b; }
        .kv .value { font-weight: 600; color: #1e293b; }
        .diff-up { color: #16a34a; }
        .diff-down { color: #dc2626; }
        table.changes { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
        table.changes th { background: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; }
        table.changes td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        table.changes tr:last-child td { border-bottom: none; }
        .btn { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-top: 20px; }
        .footer { padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    </style></head><body>
    <div class="card">
        <div class="header"><h1>${title}</h1>${content.subtitle ? `<p>${content.subtitle}</p>` : ''}</div>
        <div class="body">${content.body}</div>
        <div class="footer">App Finance · Immoral Marketing Group</div>
    </div></body></html>`;
}

// ── Email ─────────────────────────────────────────────────────────────────────

let transporter = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            pool: true,
            maxConnections: 3,
        });
    }
    return transporter;
}

async function sendEmail({ to, subject, html }) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    try {
        const t = getTransporter();
        await t.sendMail({ from: `"App Finance" <${process.env.SMTP_USER}>`, to, subject, html });
    } catch (err) {
        console.error('[EMAIL] Error sending:', err.message);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(val) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val ?? 0);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /budget-requests?year=&dept=&status=
 */
router.get('/', async (req, res) => {
    const { year, dept, status } = req.query;
    try {
        let q = supabase.from('budget_requests').select('*');
        if (year) q = q.eq('fiscal_year', parseInt(year));
        if (dept) q = q.eq('dept', dept);
        if (status) q = q.eq('status', status);
        q = q.order('created_at', { ascending: false });

        const { data, error } = await q;
        if (error) throw error;
        res.json({ requests: data || [] });
    } catch (err) {
        console.error('[BUDGET-REQ] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /budget-requests
 * Body: { fiscal_year, dept, section, category, item, month_idx, current_value, requested_value, reason, requested_by, requested_by_email }
 */
router.post('/', async (req, res) => {
    const { fiscal_year, dept, section, category, item, month_idx, current_value, requested_value, reason, requested_by, requested_by_email } = req.body;

    if (!fiscal_year || !dept || !section || !item || month_idx === undefined || requested_value === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const { data, error } = await supabase
            .from('budget_requests')
            .insert({
                fiscal_year,
                dept,
                section,
                category: category || section,
                item,
                month_idx,
                current_value: current_value ?? 0,
                requested_value,
                reason: reason || null,
                requested_by: requested_by || null,
                requested_by_email: requested_by_email || null,
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;

        // In-app notification to superadmins
        try {
            const { data: admins } = await supabase
                .from('user_profiles')
                .select('user_id')
                .eq('role', 'superadmin');

            if (admins?.length) {
                await createNotifications(
                    admins.map(a => a.user_id),
                    'budget_request',
                    `${dept} solicita cambio presupuesto: ${item} (${MONTHS[month_idx]}) → ${fmtEur(requested_value)}`,
                    { request_id: data.id }
                );
            }
        } catch (notifErr) {
            console.warn('[BUDGET-REQ] Notification error:', notifErr.message);
        }

        // Email to admin
        const diff = requested_value - (current_value ?? 0);
        const diffStr = `${diff > 0 ? '+' : ''}${fmtEur(diff)}`;
        const link = solicitudesUrl(deptCodeFromLabel(dept));
        await sendEmail({
            to: ADMIN_EMAIL,
            subject: `[Solicitud Presupuesto] ${dept} — ${item} (${MONTHS[month_idx]} ${fiscal_year})`,
            html: emailBase(`Solicitud de cambio de presupuesto`, {
                subtitle: `${dept} · ${fiscal_year}`,
                body: `
                    <div class="kv"><span class="label">Departamento</span><span class="value">${dept}</span></div>
                    <div class="kv"><span class="label">Categoría</span><span class="value">${category}</span></div>
                    <div class="kv"><span class="label">Item</span><span class="value">${item}</span></div>
                    <div class="kv"><span class="label">Mes</span><span class="value">${MONTHS[month_idx]} ${fiscal_year}</span></div>
                    <div class="kv"><span class="label">Presupuesto actual</span><span class="value">${fmtEur(current_value)}</span></div>
                    <div class="kv"><span class="label">Valor solicitado</span><span class="value">${fmtEur(requested_value)}</span></div>
                    <div class="kv"><span class="label">Diferencia</span><span class="value ${diff >= 0 ? 'diff-up' : 'diff-down'}">${diffStr}</span></div>
                    ${reason ? `<div class="kv"><span class="label">Motivo</span><span class="value">${reason}</span></div>` : ''}
                    <div class="kv"><span class="label">Solicitado por</span><span class="value">${requested_by_email || 'N/A'}</span></div>
                    <a href="${link}" class="btn">Revisar solicitud →</a>
                `,
            }),
        });

        res.json({ request: data });
    } catch (err) {
        console.error('[BUDGET-REQ] POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /budget-requests/bulk
 * Body: { requests: [...], requested_by, requested_by_email }
 */
router.post('/bulk', async (req, res) => {
    const { requests, requested_by, requested_by_email } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({ error: 'requests array required' });
    }

    try {
        const rows = requests.map(r => ({
            fiscal_year: r.fiscal_year,
            dept: r.dept,
            section: r.section,
            category: r.category || r.section,
            item: r.item,
            month_idx: r.month_idx,
            current_value: r.current_value ?? 0,
            requested_value: r.requested_value,
            reason: r.reason || null,
            requested_by: requested_by || null,
            requested_by_email: requested_by_email || null,
            status: 'pending',
        }));

        const { data, error } = await supabase
            .from('budget_requests')
            .insert(rows)
            .select();

        if (error) throw error;

        // Group by dept for notification summary
        const dept = rows[0]?.dept;
        const fiscal_year = rows[0]?.fiscal_year;

        try {
            const { data: admins } = await supabase
                .from('user_profiles')
                .select('user_id')
                .eq('role', 'superadmin');

            if (admins?.length) {
                await createNotifications(
                    admins.map(a => a.user_id),
                    'budget_request',
                    `${dept} solicita ${rows.length} cambio(s) de presupuesto ${fiscal_year}`,
                    { count: rows.length, dept }
                );
            }
        } catch (notifErr) {
            console.warn('[BUDGET-REQ] Notification error:', notifErr.message);
        }

        // Summary email to admin
        const link = solicitudesUrl(deptCodeFromLabel(dept));
        const tableRows = rows.map(r => {
            const d = r.requested_value - (r.current_value ?? 0);
            return `<tr>
                <td>${r.category}</td>
                <td><strong>${r.item}</strong></td>
                <td>${MONTHS[r.month_idx]}</td>
                <td style="text-align:right;color:#94a3b8">${fmtEur(r.current_value)}</td>
                <td style="text-align:right;font-weight:700;color:#4f46e5">${fmtEur(r.requested_value)}</td>
                <td style="text-align:right;color:${d >= 0 ? '#16a34a' : '#dc2626'};font-weight:600">${d > 0 ? '+' : ''}${fmtEur(d)}</td>
                <td style="color:#64748b;font-style:italic">${r.reason ? `"${r.reason}"` : '—'}</td>
            </tr>`;
        }).join('');

        await sendEmail({
            to: ADMIN_EMAIL,
            subject: `[Solicitud Presupuesto] ${dept} — ${rows.length} cambio(s) · ${fiscal_year}`,
            html: emailBase(`${rows.length} solicitud${rows.length !== 1 ? 'es' : ''} de cambio de presupuesto`, {
                subtitle: `${dept} · ${fiscal_year} · Solicitado por ${requested_by_email || 'N/A'}`,
                body: `
                    <table class="changes">
                        <thead><tr>
                            <th>Categoría</th><th>Item</th><th>Mes</th>
                            <th style="text-align:right">Actual</th>
                            <th style="text-align:right">Solicitado</th>
                            <th style="text-align:right">Diferencia</th>
                            <th>Motivo</th>
                        </tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                    <a href="${link}" class="btn">Revisar y aprobar →</a>
                `,
            }),
        });

        res.json({ requests: data, count: data.length });
    } catch (err) {
        console.error('[BUDGET-REQ] BULK POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /budget-requests/:id/approve
 * Body: { reviewed_by, reviewed_by_email }
 * Auto-updates budget_lines on approval
 */
router.patch('/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { reviewed_by, reviewed_by_email, review_notes } = req.body;

    try {
        const { data: req_data, error: fetchErr } = await supabase
            .from('budget_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr || !req_data) return res.status(404).json({ error: 'Request not found' });
        if (req_data.status !== 'pending') return res.status(400).json({ error: 'Already resolved' });

        // Update status
        const { error: updateErr } = await supabase
            .from('budget_requests')
            .update({
                status: 'approved',
                reviewed_by: reviewed_by || null,
                reviewed_by_email: reviewed_by_email || null,
                review_notes: review_notes || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (updateErr) throw updateErr;

        // Apply to budget_lines
        const monthCol = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][req_data.month_idx];
        const { data: existingLine } = await supabase
            .from('budget_lines')
            .select('id')
            .eq('fiscal_year', req_data.fiscal_year)
            .eq('section', req_data.section)
            .eq('dept', req_data.dept)
            .eq('item', req_data.item)
            .single();

        if (existingLine) {
            await supabase
                .from('budget_lines')
                .update({ [monthCol]: req_data.requested_value, updated_at: new Date().toISOString() })
                .eq('id', existingLine.id);
        } else {
            await supabase
                .from('budget_lines')
                .insert({
                    fiscal_year: req_data.fiscal_year,
                    section: req_data.section,
                    dept: req_data.dept,
                    item: req_data.item,
                    [monthCol]: req_data.requested_value,
                });
        }

        // Notify requester
        if (req_data.requested_by) {
            try {
                await createNotifications(
                    [req_data.requested_by],
                    'budget_approved',
                    `Presupuesto aprobado: ${req_data.item} (${MONTHS[req_data.month_idx]}) → ${fmtEur(req_data.requested_value)}`,
                    { request_id: id }
                );
            } catch (notifErr) {
                console.warn('[BUDGET-REQ] Notification error:', notifErr.message);
            }
        }

        if (req_data.requested_by_email) {
            const link = solicitudesUrl(deptCodeFromLabel(req_data.dept));
            await sendEmail({
                to: req_data.requested_by_email,
                subject: `✅ Presupuesto aprobado — ${req_data.item} (${MONTHS[req_data.month_idx]} ${req_data.fiscal_year})`,
                html: emailBase('Solicitud de presupuesto aprobada ✅', {
                    subtitle: `${req_data.dept} · ${req_data.fiscal_year}`,
                    body: `
                        <p style="color:#16a34a;font-weight:600;font-size:14px;margin-bottom:16px">Tu solicitud ha sido aprobada y el presupuesto actualizado.</p>
                        <div class="kv"><span class="label">Item</span><span class="value">${req_data.item}</span></div>
                        <div class="kv"><span class="label">Mes</span><span class="value">${MONTHS[req_data.month_idx]} ${req_data.fiscal_year}</span></div>
                        <div class="kv"><span class="label">Nuevo valor</span><span class="value diff-up">${fmtEur(req_data.requested_value)}</span></div>
                        ${review_notes ? `<div class="kv"><span class="label">Nota del revisor</span><span class="value">${review_notes}</span></div>` : ''}
                        <a href="${link}" class="btn">Ver en la app →</a>
                    `,
                }),
            });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[BUDGET-REQ] APPROVE error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /budget-requests/:id/reject
 */
router.patch('/:id/reject', async (req, res) => {
    const { id } = req.params;
    const { reviewed_by, reviewed_by_email, review_notes } = req.body;

    try {
        const { data: req_data, error: fetchErr } = await supabase
            .from('budget_requests')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchErr || !req_data) return res.status(404).json({ error: 'Request not found' });
        if (req_data.status !== 'pending') return res.status(400).json({ error: 'Already resolved' });

        const { error: updateErr } = await supabase
            .from('budget_requests')
            .update({
                status: 'rejected',
                reviewed_by: reviewed_by || null,
                reviewed_by_email: reviewed_by_email || null,
                review_notes: review_notes || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (updateErr) throw updateErr;

        if (req_data.requested_by) {
            try {
                await createNotifications(
                    [req_data.requested_by],
                    'budget_rejected',
                    `Presupuesto rechazado: ${req_data.item} (${MONTHS[req_data.month_idx]})${review_notes ? ' — ' + review_notes : ''}`,
                    { request_id: id }
                );
            } catch (notifErr) {
                console.warn('[BUDGET-REQ] Notification error:', notifErr.message);
            }
        }

        if (req_data.requested_by_email) {
            const link = solicitudesUrl(deptCodeFromLabel(req_data.dept));
            await sendEmail({
                to: req_data.requested_by_email,
                subject: `❌ Solicitud rechazada — ${req_data.item} (${MONTHS[req_data.month_idx]} ${req_data.fiscal_year})`,
                html: emailBase('Solicitud de presupuesto rechazada', {
                    subtitle: `${req_data.dept} · ${req_data.fiscal_year}`,
                    body: `
                        <p style="color:#dc2626;font-weight:600;font-size:14px;margin-bottom:16px">Tu solicitud no ha sido aprobada.</p>
                        <div class="kv"><span class="label">Item</span><span class="value">${req_data.item}</span></div>
                        <div class="kv"><span class="label">Mes</span><span class="value">${MONTHS[req_data.month_idx]} ${req_data.fiscal_year}</span></div>
                        <div class="kv"><span class="label">Valor solicitado</span><span class="value">${fmtEur(req_data.requested_value)}</span></div>
                        ${review_notes ? `<div class="kv"><span class="label">Motivo del rechazo</span><span class="value" style="color:#dc2626">${review_notes}</span></div>` : ''}
                        <a href="${link}" class="btn" style="background:#64748b">Ver en la app →</a>
                    `,
                }),
            });
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[BUDGET-REQ] REJECT error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /budget-requests/approve-dept
 * Approve all pending requests for a dept/year at once
 */
router.patch('/approve-dept', async (req, res) => {
    const { fiscal_year, dept, reviewed_by, reviewed_by_email } = req.body;

    if (!fiscal_year || !dept) return res.status(400).json({ error: 'fiscal_year and dept required' });

    try {
        const { data: pending, error: fetchErr } = await supabase
            .from('budget_requests')
            .select('*')
            .eq('fiscal_year', fiscal_year)
            .eq('dept', dept)
            .eq('status', 'pending');

        if (fetchErr) throw fetchErr;
        if (!pending?.length) return res.json({ ok: true, approved: 0 });

        for (const req_data of pending) {
            const monthCol = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][req_data.month_idx];

            await supabase
                .from('budget_requests')
                .update({ status: 'approved', reviewed_by, reviewed_by_email, updated_at: new Date().toISOString() })
                .eq('id', req_data.id);

            const { data: existingLine } = await supabase
                .from('budget_lines')
                .select('id')
                .eq('fiscal_year', req_data.fiscal_year)
                .eq('section', req_data.section)
                .eq('dept', req_data.dept)
                .eq('item', req_data.item)
                .single();

            if (existingLine) {
                await supabase
                    .from('budget_lines')
                    .update({ [monthCol]: req_data.requested_value, updated_at: new Date().toISOString() })
                    .eq('id', existingLine.id);
            } else {
                await supabase
                    .from('budget_lines')
                    .insert({
                        fiscal_year: req_data.fiscal_year,
                        section: req_data.section,
                        dept: req_data.dept,
                        item: req_data.item,
                        [monthCol]: req_data.requested_value,
                    });
            }

            if (req_data.requested_by) {
                try {
                    await createNotifications(
                        [req_data.requested_by],
                        'budget_approved',
                        `Presupuesto aprobado: ${req_data.item} (${MONTHS[req_data.month_idx]})`,
                        { request_id: req_data.id }
                    );
                } catch (_) {}
            }
        }

        res.json({ ok: true, approved: pending.length });
    } catch (err) {
        console.error('[BUDGET-REQ] APPROVE-DEPT error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /budget-requests/:id  (cancel own pending request)
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('budget_requests')
            .delete()
            .eq('id', id)
            .eq('status', 'pending');

        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        console.error('[BUDGET-REQ] DELETE error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
