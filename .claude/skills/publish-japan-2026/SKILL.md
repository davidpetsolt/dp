---
name: publish-japan-2026
description: Encrypt and publish the latest japan-2026.html from Downloads to the dp repo and push it live. Use when the user says /publish-japan-2026, or says "Update" in the context of Japan.
---

# Publish JAPAN 2026 (encrypted, versioned)

Runs via `~/Code/github/dp/publish-japan-2026.sh`, which does, in order:

0. G0 version guard: reads `BUILD.v` and `BUILD.date` from the page (`const BUILD = window.BUILD = { v:N, date:'DD-MMM-YYYY', note:'...' }`) and refuses unless `v` is exactly one more than the last row of `~/Code/site-src/dp/japan-2026-VERSIONS.md` (what is live).
1. Copies the plaintext to `~/Code/site-src/dp/japan-2026-vN-DD-MMM-YYYY-HHMM.html` (outside the public repo), then moves `~/Downloads/japan-2026.html` into the repo root.
2. G1: confirms the file is plaintext (no `staticryptConfig`). Never double-encrypts.
3. Encrypts in place with `npx staticrypt` using `japan-2026-lock-template.html` and the shared `.staticrypt.json` salt (never delete or regenerate the salt; the password lives only in the local script).
4. G2: confirms `staticryptConfig` is present. G3: confirms no plaintext markers leaked (`days-list`, `JAPAN DESIGNED TRAVEL`, `Kaczmarczyk`, `build-meta`, `<main`).
5. Commits `Publish japan-2026.html vN (encrypted, <today>)` and writes a pending log row.
6. With `CONFIRM_PUSH=yes`, pushes to origin main and appends the row to `japan-2026-VERSIONS.md`. Without it, the commit stays local and the row stays pending until the next `CONFIRM_PUSH=yes` run.

Optional: `--note "text"` overrides the note column (defaults to `BUILD.note`).

## Steps to run this skill

1. Make sure the new build sits at `~/Downloads/japan-2026.html` with `BUILD.v` bumped.
2. `cd ~/Code/github/dp && ./publish-japan-2026.sh` to dry-run through the guards and commit locally. Show the guard output and the commit SHA.
3. Once the user says yes (the repo is public, so push needs a live yes in this session): `CONFIRM_PUSH=yes ./publish-japan-2026.sh`. If the push is rejected as non-fast-forward, `git fetch && git rebase origin/main` (automated score commits never touch the japan files) and retry.
4. Report the pushed SHA and the new VERSIONS row. Remind the user to hard-refresh the live page.

## Standing instruction

"Update" in Japan context means: run this whole flow on whatever is in `~/Downloads/japan-2026.html` now; confirm before the final push. Never write plaintext into the dp clone by hand; the script is the only path.
