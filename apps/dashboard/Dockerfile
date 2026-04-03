FROM node:22-slim AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy package manifests
COPY packages/shared/package.json packages/shared/
COPY apps/dashboard/package.json apps/dashboard/

# Install all deps (need devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/dashboard/ apps/dashboard/

# Build the React SPA
RUN pnpm exec vp build apps/dashboard

RUN mkdir -p /data

ENV DIST_DIR=/app/apps/dashboard/dist

EXPOSE 3001
CMD ["./apps/dashboard/node_modules/.bin/tsx", "apps/dashboard/src/server.ts"]
