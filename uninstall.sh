#!/usr/bin/env bash
# Reverse install.sh: drop the plugin from shell.json and remove both symlinks.
set -euo pipefail

PLUGIN_ID="videinfra.omarunner"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/.config/omarchy/plugins/$PLUGIN_ID"
SHELL_CONFIG="$HOME/.config/omarchy/shell.json"
BIN_LINK="$HOME/.local/bin/omarunner"

if [[ -f $SHELL_CONFIG ]]; then
  backup="$SHELL_CONFIG.bak.$(date +%s)"
  cp "$SHELL_CONFIG" "$backup"
  tmp=$(mktemp)
  jq --arg id "$PLUGIN_ID" '.plugins = ((.plugins // []) | map(select(.id != $id)))' "$SHELL_CONFIG" > "$tmp"
  mv "$tmp" "$SHELL_CONFIG"
  echo "Disabled in $SHELL_CONFIG (backup at $backup)"
fi

if [[ -L $TARGET_DIR ]]; then
  if [[ "$(readlink -f "$TARGET_DIR")" == "$(readlink -f "$SOURCE_DIR")" ]]; then
    rm "$TARGET_DIR"
    echo "Removed $TARGET_DIR"
  else
    echo "Skipped $TARGET_DIR (points to $(readlink -f "$TARGET_DIR"), not this checkout)"
  fi
fi

if [[ -L $BIN_LINK ]]; then
  if [[ "$(readlink -f "$BIN_LINK")" == "$(readlink -f "$SOURCE_DIR/bin/omarunner")" ]]; then
    rm "$BIN_LINK"
    echo "Removed $BIN_LINK"
  else
    echo "Skipped $BIN_LINK (points to $(readlink -f "$BIN_LINK"), not this checkout)"
  fi
fi

echo "Restart the shell to unload the plugin: omarchy-restart-shell"
exit 0
