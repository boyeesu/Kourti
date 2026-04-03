# Stage 1: Build
FROM node:20.18-alpine3.21 as builder

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
ARG VITE_USE_NODE_BACKEND
ARG VITE_BACKEND_API_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_API_TIMEOUT=$VITE_API_TIMEOUT
ENV VITE_USE_NODE_BACKEND=$VITE_USE_NODE_BACKEND
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL

# Build the application
RUN npm run build

# Stage 2: Serve
FROM nginx:1.27-alpine3.21

# Copy the build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Run as non-root user for security
RUN addgroup -g 1000 -S appgroup && adduser -u 1000 -S appuser -G appgroup
USER appuser

CMD ["nginx", "-g", "daemon off;"]
