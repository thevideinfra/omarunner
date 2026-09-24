#!/usr/bin/env bash
# Link this checkout into the Omarchy shell's plugin directory, enable it in
# shell.json, and put the omarunner CLI on PATH.
set -euo pipefail

PLUGIN_ID="videinfra.omarunner"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/.config/omarchy/plugins/$PLUGIN_ID"
SHELL_CONFIG="$HOME/.config/omarchy/shell.json"
BIN_DIR="$HOME/.local/bin"

mkdir -p "$(dirname "$TARGET_DIR")" "$BIN_DIR"

if [[ -e $TARGET_DIR && ! -L $TARGET_DIR ]]; then
  echo "Refusing to replace the real directory at $TARGET_DIR" >&2
  exit 1
fi

ln -nsf "$SOURCE_DIR" "$TARGET_DIR"
echo "Linked $TARGET_DIR -> $SOURCE_DIR"

ln -nsf "$SOURCE_DIR/bin/omarunner" "$BIN_DIR/omarunner"
echo "Linked $BIN_DIR/omarunner"

if [[ ! -f $SHELL_CONFIG ]]; then
  echo "No $SHELL_CONFIG found; add {\"id\": \"$PLUGIN_ID\"} to its plugins array to enable." >&2
  exit 0
fi

if jq -e --arg id "$PLUGIN_ID" '(.plugins // []) | any(.id == $id)' "$SHELL_CONFIG" >/dev/null; then
  echo "Already enabled in $SHELL_CONFIG"
else
  backup="$SHELL_CONFIG.bak.$(date +%s)"
  cp "$SHELL_CONFIG" "$backup"
  tmp=$(mktemp)
  jq --arg id "$PLUGIN_ID" '.plugins = ((.plugins // []) + [{"id": $id}])' "$SHELL_CONFIG" > "$tmp"
  mv "$tmp" "$SHELL_CONFIG"
  echo "Enabled in $SHELL_CONFIG (backup at $backup)"
fi

echo "Restart the shell to load the plugin: omarchy-restart-shell"
