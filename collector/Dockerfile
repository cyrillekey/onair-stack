# syntax=docker/dockerfile:1

FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

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
