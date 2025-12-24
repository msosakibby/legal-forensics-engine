# Use Alpine Linux for lightweight container
FROM node:20-alpine

# Install FFmpeg (Critical for Media Lane)
RUN apk update && \
    apk add --no-cache ffmpeg

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build 

# Start
CMD ["node", "dist/index.js"]
