-- Budget requests table: dept heads submit proposed budget changes for admin approval
CREATE TABLE IF NOT EXISTS budget_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_year INTEGER NOT NULL,
    dept TEXT NOT NULL,
    section TEXT NOT NULL,       -- 'revenue' | 'personal' | 'marketing' | etc.
    category TEXT NOT NULL,      -- human-readable category label
    item TEXT NOT NULL,
    month_idx INTEGER NOT NULL CHECK (month_idx >= 0 AND month_idx <= 11),
    current_value NUMERIC DEFAULT 0,
    requested_value NUMERIC NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by UUID,
    requested_by_email TEXT,
    reviewed_by UUID,
    reviewed_by_email TEXT,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_requests_year_dept ON budget_requests (fiscal_year, dept);
CREATE INDEX IF NOT EXISTS idx_budget_requests_status ON budget_requests (status);
