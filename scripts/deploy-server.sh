#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_ENV_FILE="${1:-$ROOT_DIR/.env.deploy}"

if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
  echo "Missing deploy env file: $DEPLOY_ENV_FILE" >&2
  exit 1
fi

set -a
source "$DEPLOY_ENV_FILE"
set +a

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${SERVER_ENV_FILE:?SERVER_ENV_FILE is required}"

SSH_PORT="${SSH_PORT:-22}"
REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

if [[ ! -f "$SERVER_ENV_FILE" ]]; then
  echo "Missing server env file: $SERVER_ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR/server"
npm run build

ssh -p "$SSH_PORT" "$REMOTE" "mkdir -p '$DEPLOY_PATH/server' '$DEPLOY_PATH/server/data'"

rsync -av --delete -e "ssh -p $SSH_PORT" \
  "$ROOT_DIR/server/dist" \
  "$ROOT_DIR/server/package.json" \
  "$ROOT_DIR/server/package-lock.json" \
  "$ROOT_DIR/server/scripts" \
  "$ROOT_DIR/server/launchd" \
  "$ROOT_DIR/server/cloudflared" \
  "$ROOT_DIR/wifi-watcher.sh" \
  "$REMOTE:$DEPLOY_PATH/"

rsync -av -e "ssh -p $SSH_PORT" \
  "$SERVER_ENV_FILE" \
  "$REMOTE:$DEPLOY_PATH/server/.env"

ssh -p "$SSH_PORT" "$REMOTE" "\
  cd '$DEPLOY_PATH/server' && \
  npm ci --omit=dev && \
  chmod +x scripts/install-launchd.sh && \
  ./scripts/install-launchd.sh"

echo "Deployment complete: $REMOTE:$DEPLOY_PATH"
