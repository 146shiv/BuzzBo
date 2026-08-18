-- Account sessions, campaigns, and comment jobs for multi-account orchestration

CREATE TABLE IF NOT EXISTS account_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_account_id UUID NOT NULL UNIQUE REFERENCES platform_accounts(id) ON DELETE CASCADE,
    storage_state_encrypted TEXT,
    fingerprint_json JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'needs_login'
        CHECK (status IN ('needs_login', 'valid', 'expired', 'challenged')),
    last_synced_at TIMESTAMPTZ,
    last_validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_status ON account_sessions (status);

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Campaign',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'running', 'paused', 'completed', 'stopped')),
    max_concurrency SMALLINT NOT NULL DEFAULT 1 CHECK (max_concurrency >= 1 AND max_concurrency <= 10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);

CREATE TABLE IF NOT EXISTS comment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    platform SMALLINT NOT NULL DEFAULT 1 CHECK (platform IN (1, 2)),
    target_type TEXT NOT NULL CHECK (target_type IN ('hashtag', 'url')),
    target_value TEXT NOT NULL,
    post_url TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
    attempts SMALLINT NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_jobs_poll ON comment_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_comment_jobs_campaign ON comment_jobs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_comment_jobs_account ON comment_jobs (platform_account_id);
