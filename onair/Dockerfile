# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
WORKDIR /app

FROM base AS builder
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY src ./src
RUN npm run build

# Production-only node_modules, built clean (no prune needed)
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runner
RUN apk add --no-cache libgcc libstdc++
ENV NODE_ENV=production
ENV PORT=8080

COPY --chown=node:node package.json package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/src/templates ./dist/src/templates
COPY --from=builder --chown=node:node /app/src/public ./dist/src/public

# Non-recursive, so it's cheap
RUN touch .env && chown node:node /app .env

USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/src/server.js"]