FROM node:22-slim AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/engine/ packages/engine/

RUN mkdir -p /data

CMD ["pnpm", "exec", "tsx", "packages/engine/src/runner.ts"]
