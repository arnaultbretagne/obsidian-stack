#!/bin/sh
if [ "$MODE" = "server" ]; then
  exec node dist/server.js
else
  exec node dist/cli.js "$@"
fi
