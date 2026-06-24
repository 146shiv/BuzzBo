# GenAI Comments — Reference

## Full prompt constraints (from buildPrompt)

1. Super short, relevant comment
2. Authentic, not bot-like
3. Reference something specific from post
4. Comment on image if no caption
5. One sentence ideal
6. No emojis
7. No hashtags
8. Vary tone; avoid "Great post!"
9. No questions or conversation starters
10. Comment on video content for videos
11. No personal opinions or experiences
12. No "This is so inspiring!" / "Love this!"
13. No exclamation marks or excited punctuation
14. No first-person pronouns

## aiPromptHint examples

```typescript
aiPromptHint: "Sound like a casual photographer. Mention technique or composition.",
aiPromptHint: "Minimal, understated tone. Under 8 words.",
aiPromptHint: "Focus on the subject matter, not compliments.",
```

## Common failure modes

| Output | Fix |
|--------|-----|
| Too long | Lower `maxOutputTokens`; add "max 8 words" to prompt |
| Generic | Strengthen rule 3 and 8; add specific `aiPromptHint` |
| Uses emoji | Reinforce rule 6; post-process strip if needed |
| Wrong language | Add "Write in English only" to prompt or hint |
| Hallucinates image content | Verify image URL captured; check multimodal payload |

## API errors

- `[AI_ERROR] API Key failed` — invalid or missing `googleAiApiKey`
- Empty response — increase `maxOutputTokens` or simplify prompt
- Harm block — adjust content; check `HarmCategory` settings if added later
