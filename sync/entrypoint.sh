#!/bin/bash
set -e

# If sync is not configured yet, wait without crashing
if ! ob sync-status --path /vault >/dev/null 2>&1; then
  echo "Sync not configured. Run 'ob sync-setup --vault \$VAULT_NAME --path /vault' manually."
  echo "Waiting indefinitely — exec into the container to configure."
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
