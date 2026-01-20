FROM node:20-slim

WORKDIR /app

# 1. Copy dependency definitions
# We copy the root package files and the service-specific ones
COPY package.json package-lock.json* ./
COPY processor/package.json ./processor/
COPY aggregator/package.json ./aggregator/

# 2. Install dependencies
RUN npm ci

# 3. Copy source code
# We need the root 'src' for shared utilities and 'processor' for the service code
COPY tsconfig.json ./
COPY src ./src
COPY processor ./processor

# 4. Build TypeScript
RUN npm run build

# 5. Copy static assets (Prompts)
RUN mkdir -p dist/prompts && \
    cp processor/prompts/*.json dist/prompts/

# 6. Start the Processor
CMD ["node", "dist/processor/src/index.js"]