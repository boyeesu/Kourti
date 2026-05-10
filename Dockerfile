# Stage 1: Build
FROM node:20.18-alpine3.21 AS builder

WORKDIR /app

COPY package*.json ./

# Install dependencies (skip prepare script since source isn't copied yet)
RUN npm ci --ignore-scripts

COPY . .

# Run prepare script now that source files are available
RUN npm run prepare

# Build arguments for VITE environment variables
ARG VITE_APP_URL
ARG VITE_API_TIMEOUT
ARG VITE_USE_NODE_BACKEND
ARG VITE_BACKEND_API_URL

ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_API_TIMEOUT=$VITE_API_TIMEOUT
ENV VITE_USE_NODE_BACKEND=$VITE_USE_NODE_BACKEND
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

# Build the application
RUN npm run build

# Stage 2: Serve
FROM nginx:1.27-alpine3.21

# Create non-root user
RUN addgroup -g 1000 -S appgroup && adduser -u 1000 -S appuser -G appgroup

# Create nginx cache and runtime directories owned by appuser
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
             /var/run \
    && chown -R appuser:appgroup /var/cache/nginx /var/run /var/log/nginx \
    && chown -R appuser:appgroup /etc/nginx/conf.d \
    && touch /run/nginx.pid && chown appuser:appgroup /run/nginx.pid

# Remove the default nginx config (we generate ours at runtime)
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy the build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template and entrypoint
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint-custom.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# Default port (Railway overrides via $PORT)
ENV PORT=80
ENV BACKEND_URL=http://backend:4000

USER appuser

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
