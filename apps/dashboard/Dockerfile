FROM node:22-slim AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY apps/dashboard/package.json apps/dashboard/

RUN pnpm install --frozen-lockfile --prod

COPY packages/shared/ packages/shared/
COPY apps/dashboard/ apps/dashboard/

RUN mkdir -p /data

EXPOSE 3001
CMD ["npx", "tsx", "apps/dashboard/src/server.ts"]
