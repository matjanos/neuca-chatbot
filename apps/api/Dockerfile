# Use Bun official image
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
# Copy workspace configuration
COPY package.json bun.lock* ./
# Copy all workspace package.json files for dependency resolution
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
# Install all dependencies
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner
WORKDIR /app/apps/api

# Copy node_modules
COPY --from=deps /app/node_modules /app/node_modules

# Copy API source code
COPY apps/api ./

# Expose the API port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["bun", "run", "src/index.ts"]
