import express from 'express';
import nodemailer from 'nodemailer';
import supabase from '../config/supabase.js';
import { createCheckoutSession, expireCheckoutSession } from '../lib/stripe.js';
import { extractUser } from '../utils/changeLogger.js';

const router = express.Router();

// ── Email ──────────────────────────────────────────────────────────────────────

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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[STRIPE-EMAIL] SMTP not configured, skipping email');
        return;
    }
    try {
        const t = getTransporter();
        await t.sendMail({
            from: `"Immoral Finance" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });
    } catch (err) {
        transporter = null;
        throw err;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatEuros(cents) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function defaultEmailBody(link) {
    const amount = formatEuros(link.amount_cents);
    return `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
    <h1 style="color: white; margin: 0 0 8px; font-size: 24px;">Link de pago</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 15px;">${link.concept}</p>
  </div>
  <p style="color: #374151; font-size: 15px; line-height: 1.6;">
    Se ha generado un link de pago por <strong>${amount}</strong>.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${link.stripe_payment_url}"
       style="background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; text-decoration: none;
              padding: 14px 36px; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
      Pagar ${amount}
    </a>
  </div>
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
    Este link expira en 7 días · Immoral Growth Group
  </p>
</div>`;
}

// ── POST /payment-links/from-invoice ──────────────────────────────────────────

router.post('/from-invoice', async (req, res) => {
    const { userId, userEmail } = extractUser(req);
    const {
        holded_invoice_id,
        holded_doc_number,
        concept,
        amount_cents,
        currency = 'EUR',
        customer_email,
        client_name,
        client_tax_id,
        vertical,
        internal_note,
        expires_in_days = 7,
    } = req.body;

    if (!holded_invoice_id || !amount_cents || !concept) {
        return res.status(400).json({ error: 'holded_invoice_id, amount_cents y concept son obligatorios' });
    }

    try {
        const linkMeta = {
            mode: 'from_invoice',
            vertical: vertical || '',
            holded_invoice_id: holded_invoice_id || '',
            holded_doc_number: holded_doc_number || '',
            created_by_email: userEmail || '',
        };

        const session = await createCheckoutSession({
            amountCents: amount_cents,
            currency,
            concept,
            customerEmail: customer_email,
            expiresInDays: expires_in_days,
            metadata: linkMeta,
        });

        const { data, error } = await supabase.from('payment_links').insert({
            created_by: userId,
            created_by_email: userEmail,
            mode: 'from_invoice',
            stripe_session_id: session.id,
            stripe_payment_url: session.url,
            amount_cents,
            currency: currency.toUpperCase(),
            concept,
            expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
            holded_invoice_id,
            holded_doc_number,
            vertical,
            client_name,
            client_tax_id,
            customer_email,
            internal_note,
            status: 'active',
        }).select().single();

        if (error) throw error;

        res.json({ success: true, link: data });
    } catch (err) {
        console.error('[PAYMENT-LINKS] from-invoice error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /payment-links/manual ─────────────────────────────────────────────────

router.post('/manual', async (req, res) => {
    const { userId, userEmail } = extractUser(req);
    const {
        concept,
        amount_cents,
        currency = 'EUR',
        vertical,
        client_name,
        client_tax_id,
        customer_email,
        internal_note,
        expires_in_days = 7,
    } = req.body;

    if (!concept || !amount_cents) {
        return res.status(400).json({ error: 'concept y amount_cents son obligatorios' });
    }
    if (amount_cents <= 0) {
        return res.status(400).json({ error: 'amount_cents debe ser mayor que 0' });
    }

    try {
        const linkMeta = {
            mode: 'manual',
            vertical: vertical || '',
            holded_invoice_id: '',
            holded_doc_number: '',
            created_by_email: userEmail || '',
        };

        const session = await createCheckoutSession({
            amountCents: amount_cents,
            currency,
            concept,
            customerEmail: customer_email,
            expiresInDays: expires_in_days,
            metadata: linkMeta,
        });

        const { data, error } = await supabase.from('payment_links').insert({
            created_by: userId,
            created_by_email: userEmail,
            mode: 'manual',
            stripe_session_id: session.id,
            stripe_payment_url: session.url,
            amount_cents,
            currency: currency.toUpperCase(),
            concept,
            expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
            vertical,
            client_name,
            client_tax_id,
            customer_email,
            internal_note,
            status: 'active',
        }).select().single();

        if (error) throw error;

        res.json({ success: true, link: data });
    } catch (err) {
        console.error('[PAYMENT-LINKS] manual error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /payment-links ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    const { status, vertical, from, to, limit = 50 } = req.query;

    let query = supabase
        .from('payment_links')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));

    if (status) query = query.eq('status', status);
    if (vertical) query = query.eq('vertical', vertical);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ links: data });
});

// ── GET /payment-links/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('payment_links')
        .select('*, payment_link_emails(*)')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(404).json({ error: 'Not found' });
    res.json({ link: data });
});

// ── POST /payment-links/:id/send-email ────────────────────────────────────────

router.post('/:id/send-email', async (req, res) => {
    const { userId, userEmail } = extractUser(req);
    const { to, subject, body_html } = req.body;

    if (!to) return res.status(400).json({ error: 'to es obligatorio' });

    const { data: link, error: fetchErr } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (fetchErr || !link) return res.status(404).json({ error: 'Link no encontrado' });

    const emailSubject = subject || `Link de pago: ${link.concept}`;
    const emailHtml = body_html || defaultEmailBody(link);

    try {
        await sendEmail({ to, subject: emailSubject, html: emailHtml });

        await supabase.from('payment_link_emails').insert({
            link_id: link.id,
            to_email: to,
            subject: emailSubject,
            sent_by: userId,
            sent_by_email: userEmail,
        });

        await supabase.from('payment_links').update({
            last_email_sent_at: new Date().toISOString(),
            email_send_count: (link.email_send_count || 0) + 1,
        }).eq('id', link.id);

        res.json({ success: true });
    } catch (err) {
        console.error('[PAYMENT-LINKS] send-email error:', err);
        res.status(500).json({ error: 'Error enviando email: ' + err.message });
    }
});

// ── POST /payment-links/:id/cancel ────────────────────────────────────────────

router.post('/:id/cancel', async (req, res) => {
    const { data: link, error: fetchErr } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (fetchErr || !link) return res.status(404).json({ error: 'Link no encontrado' });
    if (link.status !== 'active') {
        return res.status(400).json({ error: 'Solo se pueden cancelar links activos' });
    }

    try {
        await expireCheckoutSession(link.stripe_session_id);
        await supabase.from('payment_links').update({ status: 'cancelled' }).eq('id', link.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[PAYMENT-LINKS] cancel error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
