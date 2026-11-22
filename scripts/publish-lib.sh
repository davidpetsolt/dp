# Shared by the publish-*.sh scripts (sourced, not run). Keeps the page code and the plaintext
# backups out of this public repo: both live in the private davidpetsolt/dp-src repo, cloned at
# ~/Code/site-src/dp on every machine that publishes.

SRC_REPO="$HOME/Code/site-src/dp"

# Sets STATICRYPT_PW: from the environment if already set, else from $SRC_REPO/publish.env.
load_page_code() {
  if [ -z "${STATICRYPT_PW:-}" ] && [ -f "$SRC_REPO/publish.env" ]; then
    # shellcheck disable=SC1091
    . "$SRC_REPO/publish.env"
  fi
  if [ -z "${STATICRYPT_PW:-}" ]; then
    echo "ERROR: no page code. Clone davidpetsolt/dp-src to $SRC_REPO (it holds publish.env), or set STATICRYPT_PW." >&2
    exit 1
  fi
}

# Bring the backups and version log up to date before reading them.
src_pull() {
  [ -d "$SRC_REPO/.git" ] || return 0
  git -C "$SRC_REPO" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 || return 0
  if ! git -C "$SRC_REPO" pull -q --ff-only; then
    echo "ERROR: could not update $SRC_REPO (git pull --ff-only failed). Sort it out there, then re-run." >&2
    exit 1
  fi
}

# After a successful publish: commit the new backup / log row and push them to dp-src.
# A failure here never undoes the publish; it only warns.
src_push() {
  [ -d "$SRC_REPO/.git" ] || return 0
  git -C "$SRC_REPO" add -A
  if ! git -C "$SRC_REPO" diff --cached --quiet; then
    git -C "$SRC_REPO" commit -q -m "$1" || { echo "WARNING: could not commit backups in $SRC_REPO." >&2; return 0; }
  fi
  if git -C "$SRC_REPO" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    git -C "$SRC_REPO" push -q || echo "WARNING: backups committed but not pushed. Run: git -C $SRC_REPO push" >&2
  fi
}
