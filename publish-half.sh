#!/usr/bin/env bash
# publish-half.sh — encrypt ~/Downloads/half-ass-shenanigans.html into the dp repo and commit (no push unless CONFIRM_PUSH=yes).
# The page code lives in the private dp-src repo (publish.env), never in this file. Mirrors publish-budapest.sh.
set -euo pipefail

PAGE="half"
REPO="$HOME/Code/github/dp"
SRC="$HOME/Downloads/$PAGE.html"
BACKUP_DIR="$HOME/Code/site-src/dp"
TEMPLATE="$PAGE-lock-template.html"
MARKER="whole-assed"                       # plaintext marker that must vanish after encryption
TODAY="$(date +%d-%b-%Y)"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$REPO"
. scripts/publish-lib.sh   # page code + backups live in the private dp-src repo
src_pull

if [[ "${1:-}" == "--push-only" ]]; then
  [[ "${CONFIRM_PUSH:-}" == "yes" ]] || { echo "Refusing to push without CONFIRM_PUSH=yes"; exit 1; }
  git fetch origin main
  git rebase origin/main
  git push origin main
  src_push "Back up half ($(date '+%d-%b-%Y'))"
  exit 0
fi

load_page_code
PASSWORD="$STATICRYPT_PW"
[[ -f "$SRC" ]] || { echo "No $SRC to publish."; exit 1; }
grep -q "staticryptConfig" "$SRC" && { echo "GUARD FAILED: $SRC is already encrypted. Stopping."; exit 1; }
grep -q "$MARKER" "$SRC" || { echo "GUARD FAILED: $SRC does not contain the plaintext marker '$MARKER'. Stopping."; exit 1; }
[[ -f "$TEMPLATE" ]] || { echo "Missing $TEMPLATE in repo."; exit 1; }
[[ -f .staticrypt.json ]] || { echo "Missing .staticrypt.json (shared salt). Stopping."; exit 1; }

mkdir -p "$BACKUP_DIR"
cp "$SRC" "$BACKUP_DIR/$PAGE-$STAMP.html"
echo "Backup: $BACKUP_DIR/$PAGE-$STAMP.html"

mv "$SRC" "$REPO/$PAGE.html"

npx staticrypt "$PAGE.html" -p "$PASSWORD" --short --remember 30 \
  --template "$TEMPLATE" --template-title "HALF-ASS SHENANIGANS" \
  --template-instructions "Say the password, not the joke." \
  --template-placeholder "Password" --template-button "Let's go" \
  --template-remember "Remember me for 30 days" \
  --template-error "Nope. Not that one." \
  -d .
# staticrypt writes to ./<name>.html in -d; same path as the input here, so it encrypts in place.

grep -q "staticryptConfig" "$PAGE.html" || { echo "GUARD FAILED: no staticryptConfig after encryption. Stopping."; exit 1; }
grep -q "$MARKER" "$PAGE.html" && { echo "GUARD FAILED: plaintext marker still present after encryption. Stopping."; exit 1; }
echo "Guards passed: encrypted, plaintext marker absent."

git add "$PAGE.html" "$TEMPLATE" .staticrypt.json
git commit -m "Publish $PAGE.html (encrypted, $TODAY)"
git --no-pager log -1 --oneline

if [[ "${CONFIRM_PUSH:-}" == "yes" ]]; then
  git fetch origin main && git rebase origin/main && git push origin main
  src_push "Back up half ($(date '+%d-%b-%Y'))"
else
  echo "Committed locally. Re-run with CONFIRM_PUSH=yes ./publish-half.sh --push-only to push."
fi
