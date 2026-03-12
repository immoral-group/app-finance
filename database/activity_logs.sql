-- ============================================================
-- User Activity Logs table
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL DEFAULT 'login',
    ip_address VARCHAR(100),
    user_agent TEXT,
    page_path VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries by user + date
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON user_activity_logs(user_id, created_at DESC);

-- Index for querying all activity by date
CREATE INDEX IF NOT EXISTS idx_activity_date ON user_activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: allow service role full access (backend inserts/reads)
CREATE POLICY "Service role full access on activity logs"
    ON user_activity_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);
