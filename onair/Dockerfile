# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

# Build tools needed to compile native modules on Alpine (musl libc)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY src ./src

RUN npm run build

FROM node:24-alpine AS runner

# Runtime libs for native modules (Prisma engines, Sentry)
RUN apk add --no-cache libgcc libstdc++

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
RUN npm prune --omit=dev && npm cache clean --force && touch /app/.env && chown -R node:node /app

USER node

EXPOSE 8080

CMD ["node", "dist/src/server.js"]
