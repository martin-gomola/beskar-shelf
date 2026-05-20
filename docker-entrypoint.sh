#!/bin/sh
if [ -n "$ANALYTICS_SCRIPT" ]; then
  sed -i "s|<!-- ANALYTICS -->|$ANALYTICS_SCRIPT|" /usr/share/nginx/html/index.html
fi
exec "$@"
