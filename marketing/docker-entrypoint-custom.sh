#!/bin/sh
set -e

# Substitute only PORT, leaving nginx runtime variables ($host, $uri, ...) intact.
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting marketing nginx on port ${PORT}"

exec nginx -g 'daemon off;'
