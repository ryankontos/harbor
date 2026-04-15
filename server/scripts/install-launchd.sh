#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
PLIST_TEMPLATE="$SERVER_DIR/launchd/dev.harbor.monitor.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/dev.harbor.monitor.plist"

mkdir -p "$TARGET_DIR"
mkdir -p "$SERVER_DIR/data"

sed "s#__WORKDIR__#$ROOT_DIR#g" "$PLIST_TEMPLATE" > "$TARGET_PLIST"

launchctl unload "$TARGET_PLIST" >/dev/null 2>&1 || true
launchctl load "$TARGET_PLIST"

echo "Installed launchd agent at $TARGET_PLIST"
