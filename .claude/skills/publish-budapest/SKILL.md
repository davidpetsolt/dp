---
name: publish-budapest
description: Encrypt and publish the latest budapest-2026.html from Downloads to the dp repo and push it live. Use when the user says /publish-budapest, or says "Update" in the context of Budapest.
---

# Publish Budapest 2026 (encrypted)

Unlike the plain `texas-2026.html` flow, Budapest is password-locked with StatiCrypt.
Runs via `~/Code/github/dp/publish-budapest.sh`, which does, in order:

1. Move (not copy) `~/Downloads/budapest-2026.html` into the repo root — this is the plaintext source. Downloads is cleaned up as a side effect.
2. Guard: confirm the moved-in file is plaintext (does NOT contain `staticryptConfig`). Abort rather than double-encrypt if it's already locked.
3. Encrypt in place with `npx staticrypt` (password configured inside the local publish script — never write it into any tracked file, `--short --remember 30`, using the existing `budapest-2026-lock-template.html` template — do not modify that template, and never delete or regenerate `.staticrypt.json`, since that would invalidate everyone's remember-me cookie).
4. Guard: confirm encryption succeeded (`staticryptConfig` now present, plaintext marker `Hungaroring` now absent). Abort if either check fails.
5. `git add budapest-2026.html budapest-2026-lock-template.html .staticrypt.json`, then commit `Publish budapest-2026.html (encrypted, <today as DD-Mon-YYYY>)`.
6. If `origin/main` has moved on (e.g. automated LaLiga/World Cup score commits), rebase onto it rather than force-pushing — those commits never touch the budapest files, so this is a clean rebase, not a conflict.

## Steps to run this skill

1. Trigger by running `cd ~/Code/github/dp && ./publish-budapest.sh` — this performs steps 1-5 above and creates a local commit, but does **not** push (repo is public — push always needs a live "yes" in chat this session, not implied from an earlier approval).
2. Show the user: both guard results, and `git status`/the new commit SHA.
3. Once they say yes, push: `git push origin main`. If rejected as non-fast-forward, `git fetch && git rebase origin/main` (safe — no file overlap with the automated score-update commits) and retry the push.
4. Report the final pushed commit SHA and remind the user to hard-refresh https://pages.davidpetsolt.com/budapest-2026.html to see the BUDAPEST lock screen — a stale cached plaintext page can look "broken" until refreshed. The password lives in the local publish script; do not repeat it in chat unless asked.

## Standing instruction

If the user says "Update" (in Budapest context), that means: run this whole flow starting from whatever new file is currently sitting in `~/Downloads/budapest-2026.html` right now — no need to re-ask what to do, just confirm before the final push.
