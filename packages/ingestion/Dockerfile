FROM node:22-slim AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./

# Copy relevant package manifests
COPY packages/shared/package.json packages/shared/
COPY packages/ingestion/package.json packages/ingestion/

# Install dependencies (need tsx as devDep)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/ingestion/ packages/ingestion/

CMD ["./packages/ingestion/node_modules/.bin/tsx", "packages/ingestion/src/runner.ts"]
