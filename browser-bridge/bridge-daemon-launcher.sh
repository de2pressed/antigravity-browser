#!/usr/bin/env bash
set -euo pipefail
BRIDGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[ ! -f "$BRIDGE_DIR/node-runtime.sh" ] || source "$BRIDGE_DIR/node-runtime.sh"
exec "${ANTIGRAVITY_NODE:-node}" "$BRIDGE_DIR/bridge-daemon.js" "$@"
