# Dockerfile

# ---- Base ----
# Use a specific version of node:20-alpine for reproducibility
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# ---- Dependencies ----
# Use a dedicated layer for dependencies to leverage Docker's caching.
# This layer is only rebuilt when package.json or package-lock.json changes.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Builder ----
# This stage builds the TypeScript code into JavaScript.
FROM deps AS builder
COPY . .
RUN npm run build

# ---- Production ----
# This is the final, lean image that will be deployed.
FROM base AS production
ENV NODE_ENV=production

# Copy package files and install only production dependencies.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the compiled application code from the 'builder' stage.
COPY --from=builder /usr/src/app/dist ./dist

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application
CMD ["node", "dist/index.js"]
