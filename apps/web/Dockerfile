# Build stage
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock* ./
# Copy all workspace package.json files for dependency resolution
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Install dependencies
RUN bun install --frozen-lockfile

# Copy web app source code
COPY apps/web ./apps/web

# Build the application
WORKDIR /app/apps/web
RUN bun run build

# Production stage with nginx
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built assets from builder with proper permissions
COPY --from=builder --chown=nginx:nginx /app/apps/web/dist .

# Ensure proper permissions
RUN chmod -R 755 /usr/share/nginx/html && \
    find /usr/share/nginx/html -type f -exec chmod 644 {} \;

# Copy nginx configuration template
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy and set up entrypoint script
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set default API URL (can be overridden via environment variable)
ENV API_URL=http://api:3000

# Expose port
EXPOSE 5173

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
