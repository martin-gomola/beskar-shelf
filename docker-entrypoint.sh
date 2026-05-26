#!/bin/sh
# Wrapper around the upstream nginx:alpine entrypoint. We inject optional
# analytics HTML before the upstream entrypoint runs envsubst on the conf
# template, IPv6 detection, and worker tuning from /docker-entrypoint.d/.
set -e

if [ -n "$ANALYTICS_SCRIPT" ]; then
  sed -i "s|<!-- ANALYTICS -->|$ANALYTICS_SCRIPT|" /usr/share/nginx/html/index.html
fi

exec /docker-entrypoint.sh "$@"
