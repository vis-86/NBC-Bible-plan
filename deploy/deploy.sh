#!/usr/bin/env bash
#
# Deploy NBC Bible Plan to the production Docker Compose stack.
#
# Ships the source tree to the server via rsync, then rebuilds and recreates
# the `app` container there (the image is built ON the server from this tree —
# compose build context is the repo root, Dockerfile is deploy/Dockerfile).
#
# This replaces the obsolete copy-prod.sh (which targeted a now-dead server).
#
# Prerequisites on the server (NOT managed here — infra lives only on the box):
#   - /opt/nbc/bible-plan/deploy/.env  contains all runtime secrets the app needs:
#       SESSION_SECRET, INVITE_ADMIN_SECRET, DIRECTUS_ADMIN_TOKEN,
#       NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_BASE_PATH, NEXT_PUBLIC_DIRECTUS_URL,
#       TELEGRAM_BOT_TOKEN, ... (see ENV_SETUP.md)
#   - deploy/compose.yml passes those through as ${VAR} in the app service.
#
# Usage:
#   deploy/deploy.sh            # full deploy (rsync + build + recreate + smoke)
#   deploy/deploy.sh --dry-run  # preview the rsync only, change nothing
#   deploy/deploy.sh --no-build # sync only, skip build/recreate
#
# Override target via env: SSH_TARGET, REMOTE_DIR, APP_SERVICE, PUBLIC_URL.

set -euo pipefail

# ---- config (override via environment) --------------------------------------
SSH_TARGET="${SSH_TARGET:-root@168.222.202.131}"
REMOTE_DIR="${REMOTE_DIR:-/opt/nbc/bible-plan}"
APP_SERVICE="${APP_SERVICE:-app}"
PUBLIC_URL="${PUBLIC_URL:-https://bible.baptistnn.ru/app}"
SSH_OPTS=(-o BatchMode=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=15)

# Repo root = parent of this script's directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Files NOT shipped to prod. deploy/ and .env* are excluded on purpose so the
# server's infra config (compose.yml + .env, incl. secrets) is the source of
# truth and is never clobbered by a deploy.
RSYNC_EXCLUDES=(
  --exclude '.git/'
  --exclude 'node_modules/'
  --exclude '.next/'
  --exclude 'deploy/'
  --exclude '.env*'
  --exclude 'database/'
  --exclude '.claude/'
  --exclude '.idea/'
  --exclude '.cursor/'
  --exclude '.vscode/'
  --exclude 'План Чтения НБЦ/'
  --exclude 'pkg/'
  --exclude 'pkg.tar.gz'
  --exclude '*.log'
  --exclude '.DS_Store'
  --exclude 'tsconfig.tsbuildinfo'
)

DRY_RUN=0
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# ---- preflight --------------------------------------------------------------
cd "$REPO_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "WARNING: working tree has uncommitted changes — they WILL be deployed."
fi

log "Checking SSH to $SSH_TARGET ..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "test -d '$REMOTE_DIR/deploy'" \
  || { echo "Cannot reach $SSH_TARGET:$REMOTE_DIR/deploy" >&2; exit 1; }

# ---- 1. rsync source --------------------------------------------------------
if [[ "$DRY_RUN" == 1 ]]; then
  log "DRY-RUN rsync (no changes will be made):"
  rsync -azn --delete --itemize-changes "${RSYNC_EXCLUDES[@]}" \
    -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/" "$SSH_TARGET:$REMOTE_DIR/"
  log "Dry-run complete. Re-run without --dry-run to apply."
  exit 0
fi

log "Syncing source to $SSH_TARGET:$REMOTE_DIR ..."
rsync -az --delete --stats "${RSYNC_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/" "$SSH_TARGET:$REMOTE_DIR/" \
  | grep -E 'files transferred|deleted|total size' || true

if [[ "$DO_BUILD" == 0 ]]; then
  log "Source synced. --no-build set, skipping build/recreate."
  exit 0
fi

# ---- 2. build + recreate on the server -------------------------------------
# next build is memory-hungry and can outlive a dropped SSH session; the remote
# script runs it detached and polls, so a flaky connection won't abort the build.
log "Building image and recreating '$APP_SERVICE' on the server ..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" REMOTE_DIR="$REMOTE_DIR" APP_SERVICE="$APP_SERVICE" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR/deploy"

OLD_IMG="$(docker compose images "$APP_SERVICE" -q 2>/dev/null || true)"

LOG="/tmp/bible-deploy-build.log"
: > "$LOG"
setsid bash -c "docker compose build '$APP_SERVICE' > '$LOG' 2>&1" &
BPID=$!
echo "  build started (pid $BPID), tailing $LOG ..."
# Poll until the build process exits (up to ~15 min).
for _ in $(seq 1 180); do
  kill -0 "$BPID" 2>/dev/null || break
  sleep 5
done
if kill -0 "$BPID" 2>/dev/null; then
  echo "  ERROR: build still running after timeout; check $LOG on the server" >&2
  exit 1
fi
wait "$BPID" || { echo "  BUILD FAILED:"; tail -n 30 "$LOG"; exit 1; }
tail -n 6 "$LOG"

echo "  recreating container ..."
docker compose up -d "$APP_SERVICE"

# wait for running, then read the new container's actual image id
CID=""
for _ in $(seq 1 20); do
  CID="$(docker compose ps -q "$APP_SERVICE" 2>/dev/null || true)"
  s="$(docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null || true)"
  [ "$s" = "running" ] && break
  sleep 2
done
NEW_IMG="$(docker inspect -f '{{.Image}}' "$CID" 2>/dev/null | sed 's/^sha256://' || true)"
echo "  app status: ${s:-unknown}  (image: ${OLD_IMG:0:12} -> ${NEW_IMG:0:12})"
echo "  recent logs:"
docker logs "$CID" 2>&1 | tail -8
REMOTE

# ---- 3. smoke check ---------------------------------------------------------
log "Smoke check: GET $PUBLIC_URL/login"
code="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_URL/login" || echo 000)"
if [[ "$code" == "200" ]]; then
  log "Deploy OK — /login returned 200."
else
  log "WARNING: /login returned HTTP $code — check the app logs on the server."
  exit 1
fi
