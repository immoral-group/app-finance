import express from 'express';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { createNotifications } from './notifications.js';

const router = express.Router();

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'administracion@immoral.es';

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
        await sendEmail({
            to: ADMIN_EMAIL,
            subject: `[Solicitud Presupuesto] ${dept} — ${item}`,
            html: `
                <p><strong>Departamento:</strong> ${dept}</p>
                <p><strong>Categoría:</strong> ${category}</p>
                <p><strong>Item:</strong> ${item}</p>
                <p><strong>Mes:</strong> ${MONTHS[month_idx]} ${fiscal_year}</p>
                <p><strong>Valor actual:</strong> ${fmtEur(current_value)}</p>
                <p><strong>Valor solicitado:</strong> ${fmtEur(requested_value)}</p>
                ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
                <p><strong>Solicitado por:</strong> ${requested_by_email || 'N/A'}</p>
            `,
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
        const tableRows = rows.map(r => `
            <tr>
                <td>${r.category}</td>
                <td>${r.item}</td>
                <td>${MONTHS[r.month_idx]}</td>
                <td>${fmtEur(r.current_value)}</td>
                <td><strong>${fmtEur(r.requested_value)}</strong></td>
                <td>${r.reason || ''}</td>
            </tr>`).join('');

        await sendEmail({
            to: ADMIN_EMAIL,
            subject: `[Solicitud Presupuesto] ${dept} — ${rows.length} cambio(s) ${fiscal_year}`,
            html: `
                <p>El departamento <strong>${dept}</strong> ha enviado ${rows.length} solicitud(es) de cambio de presupuesto para ${fiscal_year}.</p>
                <p><strong>Solicitado por:</strong> ${requested_by_email || 'N/A'}</p>
                <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px">
                    <thead><tr><th>Categoría</th><th>Item</th><th>Mes</th><th>Actual</th><th>Solicitado</th><th>Motivo</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `,
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
            await sendEmail({
                to: req_data.requested_by_email,
                subject: `[Presupuesto Aprobado] ${req_data.dept} — ${req_data.item}`,
                html: `
                    <p>Tu solicitud de cambio de presupuesto ha sido <strong style="color:green">aprobada</strong>.</p>
                    <p><strong>Item:</strong> ${req_data.item}</p>
                    <p><strong>Mes:</strong> ${MONTHS[req_data.month_idx]} ${req_data.fiscal_year}</p>
                    <p><strong>Nuevo valor:</strong> ${fmtEur(req_data.requested_value)}</p>
                    ${review_notes ? `<p><strong>Nota:</strong> ${review_notes}</p>` : ''}
                `,
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
            await sendEmail({
                to: req_data.requested_by_email,
                subject: `[Presupuesto Rechazado] ${req_data.dept} — ${req_data.item}`,
                html: `
                    <p>Tu solicitud de cambio de presupuesto ha sido <strong style="color:red">rechazada</strong>.</p>
                    <p><strong>Item:</strong> ${req_data.item}</p>
                    <p><strong>Mes:</strong> ${MONTHS[req_data.month_idx]} ${req_data.fiscal_year}</p>
                    <p><strong>Valor solicitado:</strong> ${fmtEur(req_data.requested_value)}</p>
                    ${review_notes ? `<p><strong>Motivo:</strong> ${review_notes}</p>` : ''}
                `,
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
