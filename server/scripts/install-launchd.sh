#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
PLIST_TEMPLATE="$SERVER_DIR/launchd/dev.harbor.monitor.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/dev.harbor.monitor.plist"
NODE_BIN="${NODE_BIN:-}"

if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "$NODE_BIN" && -x /opt/homebrew/bin/node ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi

if [[ -z "$NODE_BIN" && -x /usr/local/bin/node ]]; then
  NODE_BIN="/usr/local/bin/node"
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Unable to find a usable node binary. Set NODE_BIN=/absolute/path/to/node and rerun." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
mkdir -p "$SERVER_DIR/data"

sed \
  -e "s#__WORKDIR__#$ROOT_DIR#g" \
  -e "s#__NODE_BIN__#$NODE_BIN#g" \
  "$PLIST_TEMPLATE" > "$TARGET_PLIST"

launchctl unload "$TARGET_PLIST" >/dev/null 2>&1 || true
launchctl load "$TARGET_PLIST"

echo "Installed launchd agent at $TARGET_PLIST"
