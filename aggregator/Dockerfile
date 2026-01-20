FROM node:20-slim

WORKDIR /app

# 1. Copy dependency definitions
COPY package.json package-lock.json* ./
COPY processor/package.json ./processor/
COPY aggregator/package.json ./aggregator/

# 2. Install dependencies
RUN npm ci

# 3. Copy source code
COPY tsconfig.json ./
COPY src ./src
COPY aggregator ./aggregator

# 4. Build TypeScript
RUN npm run build

# 5. Start the Aggregator
CMD ["node", "dist/aggregator/src/index.js"]