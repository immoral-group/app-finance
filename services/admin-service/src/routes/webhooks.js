import express from 'express';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { constructWebhookEvent } from '../lib/stripe.js';

const router = express.Router();

const FINANCE_NOTIFY_EMAIL = process.env.FINANCE_EMAIL || 'administracion@immoral.es';

let _transporter = null;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return _transporter;
}

async function notifyPaymentReceived(link, session) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const amount = new Intl.NumberFormat('es-ES', { style: 'currency', currency: link.currency || 'EUR' }).format(link.amount_cents / 100);
    const mode = link.mode === 'from_invoice' ? `Factura ${link.holded_doc_number || link.holded_invoice_id}` : 'Manual';
    const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 16px;color:#059669;">✅ Pago recibido</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
    <tr><td style="padding:8px 0;font-weight:600;width:140px;">Concepto</td><td>${link.concept}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600;">Importe</td><td><strong style="color:#059669;">${amount}</strong></td></tr>
    <tr><td style="padding:8px 0;font-weight:600;">Modo</td><td>${mode}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600;">Creado por</td><td>${link.created_by_email || '—'}</td></tr>
    <tr><td style="padding:8px 0;font-weight:600;">Stripe session</td><td style="font-size:12px;color:#6b7280;">${session.id}</td></tr>
  </table>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Immoral Finance</p>
</div>`;
    try {
        await getTransporter().sendMail({
            from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
            to: FINANCE_NOTIFY_EMAIL,
            subject: `[Pago recibido] ${link.concept} — ${amount}`,
            html,
        });
    } catch (err) {
        _transporter = null;
        console.error('[WEBHOOK] notify-payment error:', err.message);
    }
}

// ── POST /webhooks/stripe ──────────────────────────────────────────────────────
// NOTE: this route receives raw body — must be mounted BEFORE express.json()

router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

    let event;
    try {
        event = constructWebhookEvent(req.body, sig);
    } catch (err) {
        console.error('[WEBHOOK] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
    }

    try {
        if (event.type === 'checkout.session.completed') {
            await handleSessionCompleted(event.data.object);
        } else if (event.type === 'checkout.session.expired') {
            await handleSessionExpired(event.data.object);
        }
    } catch (err) {
        console.error('[WEBHOOK] Handler error:', err);
    }

    res.json({ received: true });
});

async function handleSessionCompleted(session) {
    const { data: link } = await supabase
        .from('payment_links')
        .select('*')
        .eq('stripe_session_id', session.id)
        .single();

    if (!link) {
        console.warn('[WEBHOOK] No payment_link found for session', session.id);
        return;
    }

    await supabase.from('payment_links').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent: session.payment_intent,
    }).eq('id', link.id);

    // Notificar a administración
    await notifyPaymentReceived(link, session);

    if (link.mode === 'from_invoice' && link.holded_invoice_id) {
        try {
            const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';
            const apiKey = process.env.HOLDED_API_KEY;
            if (apiKey) {
                await fetch(`${HOLDED_BASE}/documents/invoice/${link.holded_invoice_id}/pay`, {
                    method: 'POST',
                    headers: { 'key': apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: Math.floor(Date.now() / 1000),
                        total: link.amount_cents / 100,
                        paymentAccountId: process.env.HOLDED_PAYMENT_ACCOUNT_ID || '',
                        notes: `Pago recibido via Stripe — session ${session.id}`,
                    }),
                });
            }
        } catch (err) {
            console.error('[WEBHOOK] Holded pay error:', err);
        }
    }
}

async function handleSessionExpired(session) {
    const { data: link } = await supabase
        .from('payment_links')
        .select('id, status')
        .eq('stripe_session_id', session.id)
        .single();

    if (!link || link.status !== 'active') return;

    await supabase.from('payment_links').update({ status: 'expired' }).eq('id', link.id);
}

export default router;
