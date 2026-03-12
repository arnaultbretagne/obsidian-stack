#!/bin/bash
set -e

# Si le sync n'est pas encore configure, attendre sans crasher
if ! ob sync-status --path /vault >/dev/null 2>&1; then
  echo "Sync not configured. Run 'ob sync-setup --vault \$VAULT_NAME --path /vault' manually."
  echo "Waiting indefinitely — use 'docker exec -it obsidian-sync bash' to configure."
  exec sleep infinity
fi

# Retry loop: Obsidian servers may still see the previous session
MAX_RETRIES=6
for i in $(seq 1 $MAX_RETRIES); do
  if ob sync --path /vault --continuous; then
    break
  fi
  echo "Sync failed (attempt $i/$MAX_RETRIES), retrying in 10s..."
  sleep 10
done
