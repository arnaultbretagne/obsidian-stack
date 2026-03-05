#!/bin/bash
set -e

# Setup sync si pas encore configure
if [ ! -d "/vault/.obsidian" ]; then
  ob sync-setup --vault "$VAULT_NAME" --path /vault
fi

# Sync continu
exec ob sync --path /vault --continuous
