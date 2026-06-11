import express from 'express';
import supabase from '../config/supabase.js';
import { constructWebhookEvent } from '../lib/stripe.js';

const router = express.Router();

const FINANCE_NOTIFY_EMAIL = process.env.FINANCE_EMAIL || 'finanzas@immoral.es';

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

    if (link.mode === 'manual') {
        console.log(`[WEBHOOK] Manual payment received: ${link.amount_cents / 100}€ — ${link.concept} — ${FINANCE_NOTIFY_EMAIL}`);
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
