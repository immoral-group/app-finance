import Stripe from 'stripe';

let stripeClient = null;

function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
        stripeClient = new Stripe(key, { apiVersion: '2025-05-28.basil' });
    }
    return stripeClient;
}

const APP_URL = process.env.APP_URL || 'https://imfinance.immoral.es';

export async function createCheckoutSession({
    amountCents,
    currency = 'eur',
    concept,
    customerEmail,
    expiresInDays = 7,
    metadata = {},
}) {
    const stripe = getStripe();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;

    const description = metadata.holded_doc_number
        ? `Factura ${metadata.holded_doc_number}`
        : concept;

    return stripe.checkout.sessions.create({
        mode: 'payment',
        currency: currency.toLowerCase(),
        line_items: [{
            price_data: {
                currency: currency.toLowerCase(),
                unit_amount: amountCents,
                product_data: { name: concept },
            },
            quantity: 1,
        }],
        customer_email: customerEmail || undefined,
        expires_at: expiresAt,
        success_url: `${APP_URL}/payments?payment=success`,
        cancel_url: `${APP_URL}/payments?payment=cancelled`,
        locale: 'es',
        payment_intent_data: {
            description,
            metadata,
        },
        metadata,
    });
}

export async function expireCheckoutSession(sessionId) {
    const stripe = getStripe();
    return stripe.checkout.sessions.expire(sessionId);
}

export function constructWebhookEvent(payload, sig) {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    return stripe.webhooks.constructEvent(payload, sig, secret);
}

export function isConfigured() {
    return !!process.env.STRIPE_SECRET_KEY;
}
