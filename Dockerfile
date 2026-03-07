# Stage 1: Build
# TODO: Pin base image to a specific digest in CI (e.g. node:20-alpine@sha256:...)
FROM node:20-alpine as builder

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm ci

COPY . .

# Build arguments for VITE environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_URL
ARG VITE_API_TIMEOUT

# Build the application
RUN npm run build

# Stage 2: Serve
# TODO: Pin base image to a specific digest in CI (e.g. nginx:alpine@sha256:...)
FROM nginx:alpine

# Copy the build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Run as non-root user for security
RUN addgroup -g 1000 -S appgroup && adduser -u 1000 -S appuser -G appgroup
USER appuser

CMD ["nginx", "-g", "daemon off;"]
