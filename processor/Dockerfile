# Single-stage build for safety
FROM node:20-alpine

WORKDIR /app

# 1. Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Copy source code AND prompts
COPY . .
# (The above copies src/, prompts/, tsconfig.json, etc.)

# 3. Build the TypeScript code
RUN npm run build

# 4. Expose port (Cloud Run default)
EXPOSE 8080

# 5. Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# 6. Start the app
CMD ["node", "dist/index.js"]