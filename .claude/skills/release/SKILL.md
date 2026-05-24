---
name: release
description: >
  Use BEFORE pushing any user-visible change. Updates every file that must
  change together for a release: version badge, service worker cache, and
  CLAUDE.md version constants. Missing any one of these causes stale-cache
  bugs that are invisible until a hard-refresh.
---

# Release Checklist

## Files that must change together (in order)

1. **`index.html` line ~256** — version badge in sidebar header
   - Pattern: `v3.XX.Y` → `v3.XX.(Y+1)` (patch) or `v3.(XX+1).0` (minor)
   - Find with: `grep -n "v3\." index.html | head -5`

2. **`sw.js` line 1** — service worker cache name
   - Pattern: `coach4u-crm-vN` → `coach4u-crm-v(N+1)`
   - Always increment by 1; never skip numbers or reuse a number.

3. **`CLAUDE.md` Conventions › Versioning section** — "currently" pin
   - Update both `v3.XX.Y` and `vN` to match what you just set above.
   - Find with: `grep -n "currently" CLAUDE.md`

## Gotchas (every one of these has shipped a bug)

- **sw.js not bumped** (v3.61.2 shipped with v613, later found at v619 while
  CLAUDE.md still said v613): users got cached stale HTML after deployments
  because the service worker didn't know a new version existed.

- **CLAUDE.md version not updated** (stayed at v3.61.2 / v613 while production
  moved to v3.62.5 / v619 over ~6 commits): next Claude session read the wrong
  "current" version, derived wrong bump targets, and the changelog in commit
  messages became unreliable as a version audit trail.

- **Prompts section said "localStorage" after migration to Supabase**: new
  sessions tried to call non-existent `getPrompts()` / `savePrompts()` helpers
  instead of the real `supabase.from('prompts')` pattern.

- **schema.sql missing 30+ tables**: a fresh-install guide from schema.sql
  would produce a broken DB (contacts, clients, client_members, tasks,
  gallup_code_requests only — none of the pulse, agent, comms, finance, or
  intake tables). Always append idempotent IF NOT EXISTS blocks at the end
  rather than regenerating the file.

## Quick version audit (run before any commit)

```bash
grep -n "v3\." index.html | head -3
head -1 sw.js
grep "currently" CLAUDE.md
```

All three must agree before you push.
