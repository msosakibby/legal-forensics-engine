#!/bin/bash

# Define service directories
BASE_DIR="/Users/mkibby/legal-forensics-engine/legal-forensics-engine"
SERVICES=("processor" "aggregator" "dispatcher" "media-processor" "")

for service in "${SERVICES[@]}"; do
  TARGET_DIR="$BASE_DIR/$service"
  if [ -d "$TARGET_DIR" ]; then
    echo "========================================"
    echo "Installing dependencies for: $service"
    echo "Directory: $TARGET_DIR"
    echo "========================================"
    cd "$TARGET_DIR"
    npm install
  else
    echo "WARNING: Directory not found: $TARGET_DIR"
  fi
done

