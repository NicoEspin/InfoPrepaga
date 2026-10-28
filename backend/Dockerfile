# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
FROM deps AS build
COPY . .
RUN pnpm prisma:generate && pnpm build
# Explicit migration target; application startup never seeds accounts.
FROM build AS migrate
CMD ["pnpm", "prisma:deploy"]
FROM build AS production-deps
RUN pnpm prune --prod
FROM node:24.22.1-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
