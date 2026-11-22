#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SRC="$HOME/Downloads/japan-2026.html"
DEST="japan-2026.html"
TEMPLATE="japan-2026-lock-template.html"
SALT_FILE=".staticrypt.json"
ICON="apple-touch-icon-japan.png"

# Plaintext backups and the version log live OUTSIDE the public repo, never committed
BACKUP_DIR="$HOME/Code/site-src/dp"
VERSIONS="$BACKUP_DIR/japan-2026-VERSIONS.md"
PENDING="$BACKUP_DIR/.japan-2026-pending-publish"
mkdir -p "$BACKUP_DIR"
. scripts/publish-lib.sh   # page code + backups live in the private dp-src repo
src_pull

NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --note) NOTE="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

TODAY="$(date '+%d-%b-%Y')"

log_publish() {
  # Append the pending line (written at commit time) to the VERSIONS log once the push has succeeded.
  if [ -f "$PENDING" ]; then
    printf '%s\n' "$(cat "$PENDING")" >> "$VERSIONS"
    rm -f "$PENDING"
    echo "==> Logged to $VERSIONS:"; tail -1 "$VERSIONS"
  fi
}

if [ ! -f "$SRC" ]; then
  # No new source to process - maybe a prior run already committed and is just waiting to push.
  if [ -n "$(git log origin/main..HEAD --oneline -- "$DEST" 2>/dev/null)" ]; then
    echo "No new source at $SRC, but HEAD has an unpushed commit for $DEST:"
    git log origin/main..HEAD --oneline
    if [ "${CONFIRM_PUSH:-}" = "yes" ]; then
      echo "==> Pushing to origin main"
      git push origin main
      log_publish
      src_push "Back up japan-2026 ($(date '+%d-%b-%Y'))"
      echo "Pushed. Verify: https://pages.davidpetsolt.com/japan-2026.html"
      exit 0
    else
      echo "Re-run with CONFIRM_PUSH=yes ./publish-japan-2026.sh to push this commit."
      exit 0
    fi
  fi
  echo "ERROR: $SRC not found and no pending commit to push." >&2
  exit 1
fi

echo "==> Step 0 (G0): version guard"
# The page carries one source of truth: const BUILD = window.BUILD = { v:N, date:'DD-MMM-YYYY', note:'...' }
NEW_V="$(grep -o "const BUILD = window.BUILD = { v:[0-9]*" "$SRC" | grep -o '[0-9]*$' || true)"
NEW_DATE="$(grep -o "const BUILD = window.BUILD = { v:[0-9]*, date:'[^']*'" "$SRC" | sed "s/.*date:'//; s/'$//" || true)"
if [ -z "$NEW_V" ] || [ -z "$NEW_DATE" ]; then
  echo "ERROR: could not read BUILD {v, date} from $SRC. The page must define: const BUILD = window.BUILD = { v:N, date:'DD-MMM-YYYY', ... }" >&2
  exit 1
fi
if ! printf '%s' "$NEW_DATE" | grep -Eq '^[0-9]{2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{4}$'; then
  echo "ERROR: BUILD.date '$NEW_DATE' is not DD-MMM-YYYY." >&2
  exit 1
fi
if [ ! -f "$VERSIONS" ]; then
  echo "ERROR: $VERSIONS not found. Seed it with the currently live version first (one '| vN | ... |' row)." >&2
  exit 1
fi
LIVE_V="$(grep -o '^| v[0-9]* |' "$VERSIONS" | tail -1 | grep -o '[0-9]*' || true)"
if [ -z "$LIVE_V" ]; then
  echo "ERROR: no '| vN |' rows found in $VERSIONS." >&2
  exit 1
fi
if [ "$NEW_V" -ne $((LIVE_V + 1)) ]; then
  echo "ERROR: BUILD.v is v$NEW_V but live is v$LIVE_V (per $VERSIONS). Expected v$((LIVE_V + 1)). Bump BUILD in the page, or fix the log." >&2
  exit 1
fi
if [ -z "$NOTE" ]; then
  NOTE="$(grep -o "const BUILD = window.BUILD = {.*note:'[^']*'" "$SRC" | sed "s/.*note:'//; s/'$//" || true)"
fi
echo "    OK: v$NEW_V ($NEW_DATE) follows live v$LIVE_V."

echo "==> Step 1: backing up plaintext source and moving it into the repo"
BACKUP_NAME="japan-2026-v${NEW_V}-$(date '+%d-%b-%Y-%H%M').html"
cp "$SRC" "$BACKUP_DIR/$BACKUP_NAME"
mv -f "$SRC" "$DEST"
echo "    Backup: $BACKUP_DIR/$BACKUP_NAME"

echo "==> Step 2 (G1): guard - confirming source is plaintext, not already encrypted"
if grep -q "staticryptConfig" "$DEST"; then
  echo "ERROR: $DEST already contains staticryptConfig - refusing to double-encrypt." >&2
  exit 1
fi
echo "    OK: plaintext confirmed (no staticryptConfig marker)."

echo "==> Step 3: encrypting with staticrypt"
load_page_code
npx staticrypt "$DEST" -p "$STATICRYPT_PW" --short --remember 30 -d . \
  --template "$TEMPLATE" \
  --template-title "JAPAN" \
  --template-instructions "十一月 二〇二六 · Enter password"

echo "==> Step 4 (G2): guard - confirming encryption succeeded"
if ! grep -q "staticryptConfig" "$DEST"; then
  echo "ERROR: encryption failed - staticryptConfig not found after staticrypt run." >&2
  exit 1
fi
echo "    OK: staticryptConfig present."

echo "==> Step 5 (G3): guard - confirming no plaintext leaked into encrypted output"
LEAKED=0
for marker in "days-list" "JAPAN DESIGNED TRAVEL" "Kaczmarczyk" "build-meta" "<main"; do
  if grep -qF "$marker" "$DEST"; then
    echo "ERROR: plaintext marker '$marker' still present in $DEST after encryption." >&2
    LEAKED=1
  fi
done
if [ "$LEAKED" -ne 0 ]; then
  echo "ERROR: encryption leak detected - refusing to proceed." >&2
  exit 1
fi
echo "    OK: no plaintext markers leaked."

echo "==> Step 6: staging files"
git add "$DEST" "$TEMPLATE" "$SALT_FILE" "$ICON"
git status --short

echo "==> Step 7: committing"
if git diff --cached --quiet; then
  echo "No staged changes - nothing to commit. Stopping."
  exit 0
fi
git commit -m "Publish japan-2026.html v${NEW_V} (encrypted, ${TODAY})"
printf '| v%s | %s | %s | %s | %s |\n' "$NEW_V" "$NEW_DATE" "$TODAY" "$BACKUP_NAME" "$NOTE" > "$PENDING"

if [ "${CONFIRM_PUSH:-}" = "yes" ]; then
  echo "==> Step 8: pushing to origin main"
  git push origin main
  log_publish
  src_push "Back up japan-2026 ($(date '+%d-%b-%Y'))"
  echo "Pushed. Verify: https://pages.davidpetsolt.com/japan-2026.html"
else
  echo
  echo "Commit created locally but NOT pushed (public repo - push requires explicit confirmation)."
  echo "Re-run with CONFIRM_PUSH=yes ./publish-japan-2026.sh to push, once you've reviewed the above."
fi
