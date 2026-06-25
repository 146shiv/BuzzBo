-- Platform enum: 1 = Instagram, 2 = YouTube
CREATE TABLE IF NOT EXISTS configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    config_id UUID REFERENCES configurations(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform SMALLINT NOT NULL CHECK (platform IN (1, 2)),
    username TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}',
    skills_content TEXT NOT NULL DEFAULT '',
    post_urls JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, platform, username)
);

CREATE TABLE IF NOT EXISTS commented_posts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    platform SMALLINT NOT NULL CHECK (platform IN (1, 2)),
    post_id TEXT NOT NULL,
    commented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform_account_id, platform, post_id)
);

CREATE INDEX IF NOT EXISTS idx_users_last_used_at ON users (last_used_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_commented_posts_account ON commented_posts (platform_account_id, platform);

-- Default configuration template
INSERT INTO configurations (id, name, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default',
    '{
        "headless": true,
        "developerMode": false,
        "browserChannel": "chrome",
        "browserViewport": {"width": 1440, "height": 900},
        "aiProvider": "groq",
        "googleAiApiKey": "YOUR_GOOGLE_AI_API_KEY_HERE",
        "groqApiKey": "YOUR_GROQ_API_KEY_HERE",
        "groqModel": "llama-3.3-70b-versatile",
        "groqVisionModel": "meta-llama/llama-4-scout-17b-16e-instruct",
        "localLlmBaseUrl": "http://localhost:11434/v1",
        "localLlmModel": "llama3.2",
        "mockAiComments": false,
        "aiMaxRequestsPerMinute": 15,
        "monitoringIntervalSeconds": {"min": 360, "max": 600},
        "behavior": {
            "shortWaitMs": {"base": 1200, "variance": 2000},
            "navigationWaitMs": {"base": 3500, "variance": 4500},
            "typingDelayMs": {"base": 140, "variance": 220}
        },
        "defaultActionDelaySeconds": {"min": 90, "max": 180},
        "hashtagSearch": {
            "ui_search": {
                "maxPostsToScan": 2, "maxPostsToComment": 3,
                "minLikes": 0, "minComments": 0,
                "likeWeight": 1, "commentWeight": 2, "preferTopTab": true
            },
            "api_search": {
                "fetchBatchSize": 100, "maxPostsToComment": 5,
                "minLikes": 0, "minComments": 0,
                "likeWeight": 1, "commentWeight": 2
            }
        }
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Default admin: shivendra / shivendra@123#
INSERT INTO users (id, username, password_hash, display_name, role, config_id)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'shivendra',
    '$2b$12$C58tCTVpkKZ6prQoV96WPOb3GohfvzPSGK3c2gr/bf9ekHYM4jsTa',
    'Admin',
    'admin',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (username) DO NOTHING;
