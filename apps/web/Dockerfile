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

# Production stage - simple static file server
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist ./dist

# Copy static file server script
COPY apps/web/server.js ./server.js

# Expose port
EXPOSE 5173

# Start the static file server
CMD ["bun", "run", "server.js"]
