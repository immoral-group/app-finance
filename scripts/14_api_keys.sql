-- ================================================
-- API Keys table for external integrations
-- ================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,                           -- Human-readable name (e.g. "Chatbot Production")
    key_prefix TEXT NOT NULL,                     -- First 8 chars for display (e.g. "ig_live_a1b2")
    key_hash TEXT NOT NULL,                       -- SHA-256 hash of the full API key
    permissions TEXT[] DEFAULT '{}',              -- Array of allowed scopes: ['billing:read', 'pl:read', etc.]
    created_by UUID REFERENCES auth.users(id),   -- User who created the key
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ                        -- Optional expiration
);

-- Index for fast lookup during auth
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage api_keys"
    ON api_keys
    FOR ALL
    USING (true)
    WITH CHECK (true);
