#!/bin/bash
set -e

FILE_PATH="$1"
if [ -z "$FILE_PATH" ]; then
  echo "Usage: ./test_pipeline.sh <path-to-local-pdf>"
  exit 1
fi

PROJECT_ID=$(gcloud config get-value project)
INPUT_BUCKET="${PROJECT_ID}-input"
FILENAME=$(basename "$FILE_PATH")
REGION="us-central1"

echo "🧪 Testing Pipeline with file: $FILENAME"

# 1. Upload File
echo "1. Uploading to gs://$INPUT_BUCKET..."
gcloud storage cp "$FILE_PATH" "gs://${INPUT_BUCKET}/${FILENAME}"

# 2. Get Dispatcher URL
URL=$(gcloud run services describe lfe-dispatcher --region $REGION --format 'value(status.url)')

# 3. Trigger Dispatcher Manually
echo "2. Triggering Dispatcher at $URL..."
# We simulate a GCS Object Finalized event payload
curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"bucket\": \"${INPUT_BUCKET}\", \"name\": \"${FILENAME}\"}"

echo -e "\n✅ Request Sent. Check Cloud Run logs for 'lfe-dispatcher'."