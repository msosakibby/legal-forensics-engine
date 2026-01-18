# Single-stage build for safety
FROM node:20-alpine

WORKDIR /app

# 1. Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# COPY ARTIFACTS
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json .

# ... (Previous steps remain the same)

RUN npm run build

# 5. ASSETS: Manually copy JSON to the 'dist' folder for runtime
# We create the directory structure and copy the prompts
RUN mkdir -p dist/processor/prompts && \
    cp processor/prompts/*.json dist/processor/prompts/

# ... (Rest of Dockerfile)

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["node", "dist/index.js"]