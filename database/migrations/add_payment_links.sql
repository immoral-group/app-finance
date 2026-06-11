-- ============================================================
-- Stripe Payment Links
-- ============================================================

CREATE TYPE payment_link_mode AS ENUM ('from_invoice', 'manual');
CREATE TYPE payment_link_status AS ENUM ('active', 'paid', 'expired', 'cancelled', 'failed');

CREATE TABLE IF NOT EXISTS payment_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID REFERENCES auth.users(id),
    created_by_email        TEXT,
    mode                    payment_link_mode NOT NULL,

    -- Stripe data
    stripe_session_id       TEXT NOT NULL,
    stripe_payment_url      TEXT NOT NULL,
    amount_cents            INTEGER NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'EUR',
    concept                 TEXT NOT NULL,
    expires_at              TIMESTAMPTZ,

    -- Holded reference (only for from_invoice mode)
    holded_invoice_id       TEXT,
    holded_doc_number       TEXT,

    -- Client info
    vertical                TEXT,
    client_name             TEXT,
    client_tax_id           TEXT,
    customer_email          TEXT,
    internal_note           TEXT,

    -- Status
    status                  payment_link_status NOT NULL DEFAULT 'active',
    paid_at                 TIMESTAMPTZ,
    stripe_payment_intent   TEXT,

    -- Email tracking
    last_email_sent_at      TIMESTAMPTZ,
    email_send_count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_link_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    link_id         UUID NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
    to_email        TEXT NOT NULL,
    subject         TEXT NOT NULL,
    sent_by         UUID REFERENCES auth.users(id),
    sent_by_email   TEXT
);

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS payment_links_stripe_session_id ON payment_links(stripe_session_id);
CREATE INDEX IF NOT EXISTS payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS payment_links_created_at ON payment_links(created_at DESC);

-- RLS: all authenticated users can read, only the service role can write (via backend)
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_link_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_links_read" ON payment_links
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "payment_links_service_write" ON payment_links
    FOR ALL TO service_role USING (true);

CREATE POLICY "payment_link_emails_read" ON payment_link_emails
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "payment_link_emails_service_write" ON payment_link_emails
    FOR ALL TO service_role USING (true);
