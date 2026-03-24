-- Script: 13_commission_payment_requests.sql
-- Tabla para solicitudes de pago de comisiones con factura adjunta

CREATE TABLE IF NOT EXISTS commission_payment_requests (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id      uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    partner_email   text NOT NULL,                    -- email del partner para notificarle
    fiscal_year     integer NOT NULL,
    fiscal_month    integer NOT NULL CHECK (fiscal_month BETWEEN 0 AND 12),
    total_amount    numeric(12,2) NOT NULL DEFAULT 0, -- monto total solicitado
    invoice_path    text NOT NULL,                    -- ruta del archivo en Supabase Storage (bucket: invoices)
    invoice_filename text,                            -- nombre original del archivo
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes           text,                             -- notas del partner al solicitar
    admin_notes     text,                             -- notas del admin al aprobar/rechazar
    requested_at    timestamptz DEFAULT now(),
    reviewed_at     timestamptz,
    reviewed_by     uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cpr_partner    ON commission_payment_requests(partner_id);
CREATE INDEX IF NOT EXISTS idx_cpr_status     ON commission_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_cpr_period     ON commission_payment_requests(fiscal_year, fiscal_month);
CREATE INDEX IF NOT EXISTS idx_cpr_requested  ON commission_payment_requests(requested_at DESC);

-- RLS
ALTER TABLE commission_payment_requests ENABLE ROW LEVEL SECURITY;

-- Partners solo ven sus propias solicitudes
CREATE POLICY "Partners see own requests" ON commission_payment_requests
    FOR SELECT USING (
        partner_id IN (
            SELECT p.id FROM partners p
            JOIN user_profiles up ON up.partner_id = p.id
            WHERE up.id = auth.uid()
        )
    );

-- El backend (service role) puede hacer todo (bypassa RLS)
CREATE POLICY "Backend full access" ON commission_payment_requests
    FOR ALL USING (true) WITH CHECK (true);
