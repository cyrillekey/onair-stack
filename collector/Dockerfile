# syntax=docker/dockerfile:1

FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Prisma CLI stage: keeps the dev dependencies (the `prisma` CLI) together with
# the contract and the migration history, so the database can be created before
# the services start. `prisma db init` is additive and idempotent.
FROM builder AS migrate

COPY prisma.config.ts ./
COPY src/prisma ./src/prisma
COPY migrations ./migrations

CMD ["node_modules/.bin/prisma", "db", "init"]

FROM node:26-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN npm prune --omit=dev && npm cache clean --force && touch /app/.env && chown -R node:node /app

USER node

# No EXPOSE / no HTTP server. This is a cron worker only.
CMD ["node", "dist/src/main.js"]
