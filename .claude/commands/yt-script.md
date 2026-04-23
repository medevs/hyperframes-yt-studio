---
name: yt-script
description: Invoke yt-script skill, verify claims, stop for script approval gate.
---

1. Read `.last-run`.
2. Invoke the `yt-script` skill against `$RUN/picks.json`, `$RUN/items.json`, and `DESIGN.md`. Skill writes `$RUN/script.md`, `$RUN/claims.json`, `$RUN/storyboard.md`, `$RUN/storyboard.json`.
3. Verify claims:

```bash
RUN=$(cat .last-run)
node pipeline/verify-claims.mjs "$RUN" 2>&1 | tee -a "$RUN/logs/verify.log"
```

4. If verification fails, show the user `$RUN/claims-verification-report.md` and stop.
5. If pass, print `script.md` and the scene list from `storyboard.md` to the user and ask: **"Approve script, or request changes?"**

Do not proceed to `/yt-render` until the user says approved.
