-- Groq deprecated llama-3.3-70b-versatile (2026-08-16) and llama-4-scout vision (2026-07-17).
-- @see https://console.groq.com/docs/deprecations

UPDATE configurations
SET settings = settings
    || '{"groqModel": "openai/gpt-oss-20b", "groqVisionModel": "openai/gpt-oss-120b"}'::jsonb,
    updated_at = NOW()
WHERE settings->>'groqModel' IN (
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    ' llama-3.3-70b-versatile',
    ' llama-3.1-8b-instant'
)
   OR settings->>'groqVisionModel' IN (
    'meta-llama/llama-4-scout-17b-16e-instruct',
    ' meta-llama/llama-4-scout-17b-16e-instruct'
);
