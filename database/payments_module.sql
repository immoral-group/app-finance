-- ============================================================
-- PAYMENTS MODULE - Database Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Beneficiaries table
CREATE TABLE IF NOT EXISTS beneficiaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'transfer' CHECK (type IN ('equipo', 'influencer', 'comisiones', 'transfer', 'piso_yure')),
    bank_details TEXT,
    preferred_payment_method VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE beneficiaries IS 'Registro de beneficiarios de pagos (personas y empresas)';

-- 2. Payments table (replaces old payment_schedule)
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_type VARCHAR(50) NOT NULL DEFAULT 'transfer',
    beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
    beneficiary_name VARCHAR(255),
    issuing_bank VARCHAR(100),
    invoice_reference VARCHAR(255),
    invoice_received_date DATE,
    amount_admk VARCHAR(100),
    amount_infinite VARCHAR(100),
    base_amount NUMERIC(12,2) DEFAULT 0,
    commission_amount NUMERIC(12,2) DEFAULT 0,
    incentives_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente', 'programado', 'pagado')),
    payment_date DATE,
    due_date DATE,
    fiscal_year INTEGER NOT NULL,
    fiscal_month INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Registro completo de pagos de la empresa';

-- 3. Index for faster queries
CREATE INDEX IF NOT EXISTS idx_payments_fiscal ON payments(fiscal_year, fiscal_month);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_beneficiary ON payments(beneficiary_id);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 5. Allow authenticated users to read/write
CREATE POLICY "Allow authenticated access to beneficiaries"
ON beneficiaries FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to payments"
ON payments FOR ALL USING (auth.role() = 'authenticated');
