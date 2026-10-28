---
name: publish-half-ass
description: Encrypt and publish the latest half-ass-shenanigans.html from Downloads to the dp repo and push it live. Use when the user says /publish-half-ass, or says "Update" in the context of Half-Ass Shenanigans or the half marathon page.
---

# Publish Half-Ass Shenanigans (encrypted)

Password-locked with StatiCrypt, same flow as Budapest.
Runs via `~/Code/github/dp/publish-half-ass.sh`, which does, in order:

1. Move (not copy) `~/Downloads/half-ass-shenanigans.html` into the repo root — the plaintext source. A timestamped plaintext backup goes to `~/Code/site-src/dp/`.
2. Guard: confirm the moved-in file is plaintext (does NOT contain `staticryptConfig`). Abort rather than double-encrypt.
3. Encrypt in place with `npx staticrypt` (password configured inside the local publish script — never write it into any tracked file, `--short --remember 30`, template `half-ass-shenanigans-lock-template.html` — do not modify that template, and never delete or regenerate `.staticrypt.json`).
4. Guard: confirm encryption succeeded (`staticryptConfig` now present, plaintext marker `whole-assed` now absent). Abort if either check fails.
5. `git add half-ass-shenanigans.html half-ass-shenanigans-lock-template.html .staticrypt.json`, then commit `Publish half-ass-shenanigans.html (encrypted, <today as DD-Mon-YYYY>)`.
6. If `origin/main` has moved on (automated LaLiga/World Cup commits), rebase onto it rather than force-pushing.

## Steps to run this skill

1. `cd ~/Code/github/dp && ./publish-half-ass.sh` — steps 1-5, local commit, **no push** (repo is public; the push needs a live "yes" in chat this session).
2. Show the user both guard results and `git status`/the new commit SHA.
3. Once they say yes: `CONFIRM_PUSH=yes ./publish-half-ass.sh --push-only` (or `git push origin main` if the script has already committed). If rejected as non-fast-forward, `git fetch && git rebase origin/main` and retry.
4. Report the pushed SHA and remind the user to hard-refresh https://pages.davidpetsolt.com/half-ass-shenanigans.html. The password lives in the local publish script; do not repeat it in chat unless asked.

## Standing instruction

"Update" in Half-Ass Shenanigans context means: run this whole flow from whatever is in `~/Downloads/half-ass-shenanigans.html` now; confirm before the final push only.
