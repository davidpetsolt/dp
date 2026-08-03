# CLAUDE.md — dp repo rules

## THIS REPO IS PUBLIC
Anything committed and pushed here is publicly visible. Treat every push as
publishing to the internet.

## Publishing pages
- Publish ONLY via the publish-*.sh scripts (./publish-<page>.sh). Never
  replicate their steps with raw git or staticrypt commands.
- The scripts commit locally but do not push. Pushing requires re-running with
  CONFIRM_PUSH=yes — do this ONLY after David explicitly confirms the push in
  the current session. Never push proactively, never batch a push into other
  work, and never use `git push` directly.
- Before any push, verify: (1) the target .html contains staticryptConfig and
  no plaintext markers (the script's guards must have passed — if a guard
  failed, stop and report, do not work around it), (2) the plaintext backup
  was written to ~/Code/site-src/dp/ with today's timestamp.

## Plaintext handling
- NEVER commit plaintext page HTML to this repo, even briefly, even on a
  branch. Plaintext sources live in ~/Downloads (inbound) and
  ~/Code/site-src/dp/ (backups) only.
- ~/Code/site-src/ must never be moved into, symlinked into, or referenced
  from this repo.
- The ONLY backup location is ~/Code/site-src/dp/ (directly under ~/Code/).
  Do not create or use ~/Code/github/site-src/ or any other variant — a
  duplicate there was merged into the canonical location and deleted on
  25-Jul-2026. If a backup dir is missing, mkdir -p the canonical path.
- Never encrypt an already-encrypted file. If a source contains
  staticryptConfig, stop and report.

## Do not touch without explicit instruction
- .staticrypt.json (shared salt — changing it breaks every published page's
  remember-me)
- *-lock-template.html files
- The guard logic inside publish-*.sh scripts

## General
- Commit messages: "Publish <page>.html (encrypted, DD-MMM-YYYY)" — the
  scripts generate this; don't override.
- If a publish script errors mid-run, report the exact step and stop. Do not
  improvise recovery (e.g., manual mv/encrypt/commit) without confirmation.
