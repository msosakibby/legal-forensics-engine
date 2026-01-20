FROM node:20-slim

WORKDIR /app

# Install system dependencies (FFmpeg for media processing, OpenSSL for DB)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# 1. Copy dependency definitions
COPY package.json package-lock.json* ./
# Copy sub-project package files if they exist to prevent install warnings, 
# though root package.json drives the main install.
COPY processor/package.json ./processor/
COPY aggregator/package.json ./aggregator/

# 2. Install dependencies
RUN npm ci

# 3. Copy source code
COPY . .

# 4. Build TypeScript
RUN npm run build

# 5. Copy static assets (JSON prompts) that tsc doesn't move
RUN mkdir -p dist/processor/prompts && \
    cp processor/prompts/document_metadata.json dist/processor/prompts/

# Default Command (Dispatcher) - can be overridden by Cloud Run Jobs
CMD ["node", "dist/dispatcher/src/index.js"]