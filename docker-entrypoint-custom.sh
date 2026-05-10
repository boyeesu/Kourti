#!/bin/sh
set -e

# Substitute only PORT and BACKEND_URL, leaving nginx variables ($host, $uri, etc.) intact
envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "Starting nginx on port ${PORT}, backend at ${BACKEND_URL}"

exec nginx -g 'daemon off;'
