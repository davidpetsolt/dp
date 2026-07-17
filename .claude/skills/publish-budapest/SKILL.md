---
name: publish-budapest
description: Publish the latest budapest-2026.html from Downloads to the dp repo and push it live. Use when the user says /publish-budapest or "Update" in the context of Budapest.
---

# Publish Budapest 2026

Mirrors the `texas-2026.html` publish flow. Run these steps in this exact order — pulling before committing avoids diverging from other automated commits (e.g. World Cup / LaLiga score updates) that land on `main`.

## Steps

1. Move (not copy) `~/Downloads/budapest-2026.html` into the root of `/Users/d/Documents/GitHub/dp`, overwriting if present. This removes the file from Downloads.
2. `cd /Users/d/Documents/GitHub/dp && git pull --ff-only`
3. `git add budapest-2026.html`. If there is no staged change, stop and say so.
4. Commit with message `Publish budapest-2026.html (<today as DD-Mon-YYYY>)` and push to `main`.
5. Report the commit SHA and confirm https://pages.davidpetsolt.com/budapest-2026.html.
