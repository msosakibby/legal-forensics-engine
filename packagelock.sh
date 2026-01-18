#!/bin/bash
set -e

echo "☢️  INITIATING NUCLEAR CLEANUP & BUILD..."

# 1. CLEANUP: Destroy all node_modules, lock files, and build artifacts
echo "   - [1/5] Removing old dependencies and build artifacts..."
rm -rf node_modules
rm -f package-lock.json
rm -rf dist
# Clean sub-project dependencies if they exist
rm -rf processor/node_modules processor/package-lock.json
rm -rf aggregator/node_modules aggregator/package-lock.json

# 2. CACHE CLEAN: Force clean npm cache to prevent stale package installation
echo "   - [2/5] Cleaning npm cache..."
npm cache clean --force

# 3. INSTALL: Fresh installation of dependencies
echo "   - [3/5] Installing dependencies..."
npm install

# 4. BUILD: Run TypeScript Compiler
echo "   - [4/5] Compiling TypeScript..."
npm run build

# 5. ASSETS: Copy static assets (JSON) to dist folder
#    The processor needs document_metadata.json at runtime, but tsc doesn't copy it.
echo "   - [5/5] Copying static assets..."
mkdir -p dist/processor/prompts
cp processor/prompts/document_metadata.json dist/processor/prompts/

echo "✅ BUILD COMPLETE. Artifacts are in ./dist"

