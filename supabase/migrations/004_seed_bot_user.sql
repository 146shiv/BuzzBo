-- Bot user for Electron app login (password: testbot123)
-- bcrypt hash for 'testbot123' at cost 12
INSERT INTO users (id, username, password_hash, display_name, role, config_id)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'testbot',
    '$2b$12$jhp2oFmAHAPZWWEa7uXnY.CGl4PE6H.6NsvPOevXg3AGLw9rwVTDe',
    'Test Bot User',
    'user',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (username) DO NOTHING;
