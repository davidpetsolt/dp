#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SRC="$HOME/Downloads/skincare_routine.html"
DEST="skincare_routine.html"
TEMPLATE="skincare-lock-template.html"
SALT_FILE=".staticrypt.json"
PLAINTEXT_MARKER="Brightening Supreme"   # must be ABSENT after a successful encrypt

# Plaintext backup — OUTSIDE the public repo, never committed
BACKUP_DIR="$HOME/Code/site-src/dp"
mkdir -p "$BACKUP_DIR"
. scripts/publish-lib.sh   # page code + backups live in the private dp-src repo
src_pull

STAGE_FILES=()

if [ ! -f "$SRC" ]; then
  # No new HTML source - maybe a prior run already committed and is just waiting to push.
  if [ -n "$(git log origin/main..HEAD --oneline -- "$DEST" 2>/dev/null)" ]; then
    echo "No new source at $SRC, but HEAD has unpushed commit(s):"
    git log origin/main..HEAD --oneline
    if [ "${CONFIRM_PUSH:-}" = "yes" ]; then
      echo "==> Pushing to origin main"
      git push origin main
      src_push "Back up skincare_routine ($(date '+%d-%b-%Y'))"
      echo "Pushed. Verify: https://pages.davidpetsolt.com/skincare_routine.html"
      exit 0
    else
      echo "Re-run with CONFIRM_PUSH=yes ./publish-skincare.sh to push this commit."
      exit 0
    fi
  fi
  echo "ERROR: $SRC not found and no pending commit to push." >&2
  exit 1
fi

# Page code: STATICRYPT_PW, else publish.env in the private dp-src repo, else prompt.
if [ -z "${STATICRYPT_PW:-}" ] && [ -f "$SRC_REPO/publish.env" ]; then
  . "$SRC_REPO/publish.env"
fi
if [ -n "${STATICRYPT_PW:-}" ]; then
  PW="$STATICRYPT_PW"
else
  read -rsp "Page code for skincare_routine.html: " PW
  echo
fi
if [ -z "$PW" ]; then
  echo "ERROR: empty password, refusing to encrypt." >&2
  exit 1
fi

echo "==> Step 1: backing up + moving plaintext source into repo"
cp "$SRC" "$BACKUP_DIR/skincare_routine-$(date '+%d-%b-%Y-%H%M').html"
mv -f "$SRC" "$DEST"

echo "==> Step 2: guard - confirming source is plaintext, not already encrypted"
if grep -q "staticryptConfig" "$DEST"; then
  echo "ERROR: $DEST already contains staticryptConfig - refusing to double-encrypt." >&2
  exit 1
fi
echo "    OK: plaintext confirmed (no staticryptConfig marker)."

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: $TEMPLATE not found in repo. Encryption needs this template." >&2
  exit 1
fi

echo "==> Step 3: encrypting with staticrypt"
npx staticrypt "$DEST" -p "$PW" --short --remember 30 -d . \
  --template "$TEMPLATE" \
  --template-title "ROUTINE" \
  --template-instructions "Enter password to view"

echo "==> Step 4: guard - confirming encryption succeeded"
if ! grep -q "staticryptConfig" "$DEST"; then
  echo "ERROR: encryption failed - staticryptConfig not found after staticrypt run." >&2
  exit 1
fi
if grep -q "$PLAINTEXT_MARKER" "$DEST"; then
  echo "ERROR: encryption failed - plaintext marker '$PLAINTEXT_MARKER' still present." >&2
  exit 1
fi
echo "    OK: encryption verified (staticryptConfig present, '$PLAINTEXT_MARKER' absent)."

STAGE_FILES+=("$DEST" "$TEMPLATE" "$SALT_FILE")

echo "==> Step 5: staging"
git add "${STAGE_FILES[@]}"
git status --short

if git diff --cached --quiet; then
  echo "No staged changes - nothing to commit. Stopping."
  exit 0
fi

DATE_STR="$(date '+%d-%b-%Y')"
echo "==> Step 6: committing"
git commit -m "Publish skincare_routine.html (encrypted, ${DATE_STR})"

if [ "${CONFIRM_PUSH:-}" = "yes" ]; then
  echo "==> Step 7: pushing to origin main"
  git push origin main
  src_push "Back up skincare_routine ($(date '+%d-%b-%Y'))"
  echo "Pushed. Verify: https://pages.davidpetsolt.com/skincare_routine.html"
else
  echo
  echo "Commit created locally but NOT pushed (public repo - push requires explicit confirmation)."
  echo "Re-run with CONFIRM_PUSH=yes ./publish-skincare.sh to push, once you've reviewed the above."
fi

