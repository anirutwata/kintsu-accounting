# CLAUDE.md

## Safety & Verification Rules
- Verify current real state (`git status`, an actual query/dashboard check) before deleting or changing anything meaningful — never assume from defaults or from what's remembered earlier in the conversation.
- Prefer reversible cleanup: move to a temp/archive location (or soft-delete via `deleted_at` where the schema supports it) instead of permanent deletion, unless explicitly confirmed.
- Answer "when/why/who" questions from the authoritative record (`git log --follow` on the specific file, a DB audit trail, real timestamps) — not from session memory or the first plausible-looking answer. Cross-check before reporting a conclusion as final.
