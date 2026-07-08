import express from 'express';
import nodemailer from 'nodemailer';
import { buildReleaseEmail } from '../lib/releaseEmail.js';

const router = express.Router();

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

/**
 * POST /release-notifications/scenarios-rows
 * Envía el correo de novedad "Filas en Escenarios" a los destinatarios indicados.
 * Body: { to: string | string[] }
 */
router.post('/scenarios-rows', async (req, res) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.status(500).json({ error: 'SMTP no configurado' });
    }
    const rawTo = req.body?.to || 'administracion@immoral.es';
    const to = Array.isArray(rawTo) ? rawTo : [rawTo];
    if (to.length === 0) return res.status(400).json({ error: 'Falta destinatario' });

    const appUrl = process.env.APP_URL || 'https://app-finance.vercel.app';
    const previewUrl = req.body?.previewUrl || appUrl;
    const { subject, html, text } = buildReleaseEmail({ appUrl, previewUrl });

    try {
        const info = await getTransporter().sendMail({
            from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
            to: to.join(', '),
            subject,
            text,
            html,
        });
        res.json({ ok: true, messageId: info.messageId, sent: to });
    } catch (err) {
        transporter = null;
        console.error('[RELEASE-NOTIFICATIONS] send error:', err);
        res.status(500).json({ error: err.message || 'send-failed' });
    }
});

export default router;
