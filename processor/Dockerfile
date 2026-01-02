# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the TypeScript code
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# This is where we copy the prompts folder
COPY ./prompts ./prompts
RUN npm run build

# Stage 3: Production image - FINAL
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy the necessary compiled code, dependencies, AND prompts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prompts ./prompts
COPY --from=deps /app/node_modules ./node_modules
COPY package.json .

# Run as a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["node", "dist/index.js"]
