#!/bin/bash
set -e

# Si le sync n'est pas encore configure, attendre sans crasher
if ! ob sync-status --path /vault >/dev/null 2>&1; then
  echo "Sync not configured. Run 'ob sync-setup --vault \$VAULT_NAME --path /vault' manually."
  echo "Waiting indefinitely — use 'docker exec -it obsidian-sync bash' to configure."
  exec sleep infinity
fi

# Sync continu
exec ob sync --path /vault --continuous
