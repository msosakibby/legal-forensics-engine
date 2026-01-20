#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

# Bucket Names (Standardized naming)
INPUT_BUCKET="${PROJECT_ID}-input"
PROCESSING_BUCKET="${PROJECT_ID}-processing"
ARCHIVE_BUCKET="${PROJECT_ID}-archive"

echo "🚀 Setting up Cloud Run Environment for Project: $PROJECT_ID"

# 1. Create Buckets if they don't exist
echo "📦 Checking Buckets..."
gcloud storage buckets create gs://$INPUT_BUCKET --location=$REGION 2>/dev/null || echo "   - Input bucket exists or could not be created."
gcloud storage buckets create gs://$PROCESSING_BUCKET --location=$REGION 2>/dev/null || echo "   - Processing bucket exists or could not be created."
gcloud storage buckets create gs://$ARCHIVE_BUCKET --location=$REGION 2>/dev/null || echo "   - Archive bucket exists or could not be created."

# 2. Update Processor Job
echo "⚙️  Configuring Processor Job..."
gcloud run jobs update lfe-processor \
    --region "$REGION" \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REGION=$REGION,INPUT_BUCKET=$INPUT_BUCKET,PROCESSING_BUCKET=$PROCESSING_BUCKET,ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
    --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest,LLAMA_CLOUD_API_KEY=LLAMA_CLOUD_API_KEY:latest"

# 3. Update Aggregator Job
echo "⚙️  Configuring Aggregator Job..."
gcloud run jobs update lfe-aggregator \
    --region "$REGION" \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REGION=$REGION,INPUT_BUCKET=$INPUT_BUCKET,PROCESSING_BUCKET=$PROCESSING_BUCKET,ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
    --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest"

# 4. Update Media Processor Job
echo "⚙️  Configuring Media Processor Job..."
gcloud run jobs update lfe-media-processor \
    --region "$REGION" \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REGION=$REGION,INPUT_BUCKET=$INPUT_BUCKET,ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
    --set-secrets "SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_KEY=SUPABASE_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest"

echo "✅ Environment Setup Complete."
