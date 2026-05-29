# Stage 1: Build
FROM node:20.18-alpine3.21 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time VITE env. The marketing site only talks to the backend's public
# API (cross-origin), so it just needs the backend base URL.
ARG VITE_BACKEND_API_URL
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

RUN npm run build

# Stage 2: Serve
FROM nginx:1.27-alpine3.21

# Non-root user
RUN addgroup -g 1000 -S appgroup && adduser -u 1000 -S appuser -G appgroup

RUN mkdir -p /var/cache/nginx/client_temp /var/run \
    && chown -R appuser:appgroup /var/cache/nginx /var/run /var/log/nginx /etc/nginx/conf.d \
    && touch /run/nginx.pid && chown appuser:appgroup /run/nginx.pid

RUN rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint-custom.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# Railway overrides $PORT at runtime.
ENV PORT=80

USER appuser

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
