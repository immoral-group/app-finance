import express from 'express';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { buildReleaseEmail as buildScenariosRowsEmail } from '../lib/releaseEmail.js';

const router = express.Router();

// ── SMTP ──────────────────────────────────────────────────────────────────────

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

// ── Templates ─────────────────────────────────────────────────────────────────

// Cada template tiene: key (id), title (para UI), summary (una línea) y build({ appUrl, previewUrl }) → { subject, html, text }.
// Añadir aquí nuevas novedades para que aparezcan automáticamente en la UI.
const TEMPLATES = {
    'scenarios-rows': {
        key: 'scenarios-rows',
        title: 'Filas en Escenarios',
        summary: 'Añadir y eliminar filas dentro de los escenarios (bajas, altas, paga doble).',
        build: buildScenariosRowsEmail,
    },
};

function listTemplates() {
    return Object.values(TEMPLATES).map(t => ({
        key: t.key,
        title: t.title,
        summary: t.summary,
    }));
}

// ── Auth helper — solo superadmin puede usar estos endpoints ─────────────────

async function requireSuperAdmin(req, res, next) {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: 'no-auth' });
    const token = authorization.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'invalid-token' });
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (profile?.role !== 'superadmin') return res.status(403).json({ error: 'forbidden' });
    req.superAdmin = { id: user.id, email: user.email };
    next();
}

// ── GET /release-notifications/templates ─────────────────────────────────────
// Lista los templates disponibles para elegir en la UI.
router.get('/templates', requireSuperAdmin, (_req, res) => {
    res.json({ templates: listTemplates() });
});

// ── GET /release-notifications/preview/:key ──────────────────────────────────
// Devuelve el subject y el HTML del template para pintarlo con iframe srcDoc.
router.get('/preview/:key', requireSuperAdmin, (req, res) => {
    const tpl = TEMPLATES[req.params.key];
    if (!tpl) return res.status(404).json({ error: 'template-not-found' });
    const appUrl = process.env.APP_URL || 'https://app-finance.vercel.app';
    const previewUrl = req.query.previewUrl || appUrl;
    const { subject, html, text } = tpl.build({ appUrl, previewUrl });
    res.json({ subject, html, text, template: { key: tpl.key, title: tpl.title, summary: tpl.summary } });
});

async function handleSend(req, res) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.status(500).json({ error: 'smtp-not-configured' });
    }
    const { templateKey, to, previewUrl } = req.body || {};
    const tpl = TEMPLATES[templateKey];
    if (!tpl) return res.status(400).json({ error: 'template-not-found' });

    const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);
    if (recipients.length === 0) return res.status(400).json({ error: 'no-recipients' });

    const appUrl = process.env.APP_URL || 'https://app-finance.vercel.app';
    const { subject, html, text } = tpl.build({ appUrl, previewUrl: previewUrl || appUrl });

    const t = getTransporter();
    // Enviamos uno por uno para que cada usuario reciba un correo dedicado sin exponer la lista,
    // y para poder reportar fallos por destinatario.
    const results = [];
    for (const addr of recipients) {
        try {
            const info = await t.sendMail({
                from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
                to: addr,
                subject,
                text,
                html,
            });
            results.push({ to: addr, ok: true, messageId: info.messageId });
        } catch (err) {
            transporter = null;
            console.error('[RELEASE-NOTIFICATIONS] send error to', addr, err.message);
            results.push({ to: addr, ok: false, error: err.message || 'send-failed' });
        }
    }

    const okCount = results.filter(r => r.ok).length;
    res.json({
        ok: okCount > 0,
        sent: okCount,
        failed: results.length - okCount,
        results,
        template: { key: tpl.key, title: tpl.title, subject },
        sentBy: req.superAdmin.email,
    });
}

// ── POST /release-notifications/send ─────────────────────────────────────────
// Body: { templateKey: string, to: string[], previewUrl?: string }
router.post('/send', requireSuperAdmin, handleSend);

// ── POST /release-notifications/scenarios-rows (atajo directo) ───────────────
router.post('/scenarios-rows', requireSuperAdmin, (req, res) => {
    req.body = { ...(req.body || {}), templateKey: 'scenarios-rows' };
    return handleSend(req, res);
});

export default router;
