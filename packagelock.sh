#!/bin/bash
set -e
SERVICES=("splitter" "processor" "aggregator" "dispatcher" "media-processor")
for SERVICE in "${SERVICES[@]}"; do
  echo "--- Cleaning and installing for: $SERVICE ---"
  (cd "$SERVICE" && rm -rf node_modules package-lock.json && npm install)
done