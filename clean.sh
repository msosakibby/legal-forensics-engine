#!/bin/bash
set -e

# Define project root
PROJECT_ROOT="/Users/mkibby/legal-forensics-engine/legal-forensics-engine"

echo "========================================"
echo "STARTING DEEP CLEAN & REDEPLOY PROTOCOL"
echo "========================================"

# 1. CLEANUP FUNCTION
clean_service() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Cleaning $dir..."
        cd "$dir"
        rm -rf node_modules package-lock.json dist
    fi
}

# 2. EXECUTE CLEANUP
clean_service "$PROJECT_ROOT"
clean_service "$PROJECT_ROOT/processor"
clean_service "$PROJECT_ROOT/aggregator"
clean_service "$PROJECT_ROOT/media-processor"
clean_service "$PROJECT_ROOT/dispatcher"
clean_service "$PROJECT_ROOT/splitter"

echo "----------------------------------------"
echo "All local caches and artifacts destroyed."
echo "----------------------------------------"

# 3. INSTALL DEPENDENCIES (Generates fresh package-lock.json)
install_service() {
    local dir=$1
    if [ -d "$dir" ]; then
        echo "Installing dependencies for $dir..."
        cd "$dir"
        npm install
    fi
}

install_service "$PROJECT_ROOT"
install_service "$PROJECT_ROOT/processor"
install_service "$PROJECT_ROOT/aggregator"
install_service "$PROJECT_ROOT/media-processor"
install_service "$PROJECT_ROOT/dispatcher"
install_service "$PROJECT_ROOT/splitter"

echo "----------------------------------------"
echo "Dependencies refreshed. Lockfiles updated."
echo "----------------------------------------"

# 4. SUBMIT TO CLOUD BUILD
echo "Submitting to Cloud Build..."
cd "$PROJECT_ROOT"
gcloud builds submit .

echo "========================================"
echo "DEPLOYMENT SEQUENCE COMPLETE"
echo "========================================"

