#!/bin/bash
set -e

# --- CONFIGURATION ---
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO_NAME="lfe-repo"
IMAGE_NAME="legal-forensics-engine"
TAG="latest"
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$TAG"

# Job Names
JOB_SPLITTER="lfe-splitter"
JOB_PROCESSOR="lfe-processor"
JOB_AGGREGATOR="lfe-aggregator"
JOB_MEDIA="lfe-media-processor"
SERVICE_DISPATCHER="lfe-dispatcher"

# Bucket Names (Aligned with your project pattern)
INPUT_BUCKET="${PROJECT_ID}-input"
PROCESSING_BUCKET="${PROJECT_ID}-processing"
ARCHIVE_BUCKET="${PROJECT_ID}-archive"

echo "🚀 DEPLOYING TO PROJECT: $PROJECT_ID ($REGION)"


# 0. Fix Structure
chmod +x fix_structure.sh
./fix_structure.sh

# 1. Build & Push Image
echo "📦 Building and Pushing Docker Image..."
gcloud builds submit --tag $IMAGE_URI .

# 2. Deploy Cloud Run Jobs

# --- SPLITTER ---
echo "⚙️  Deploying Splitter Job..."
gcloud run jobs deploy $JOB_SPLITTER \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/splitter/src/index.js" \
  --max-retries 0 \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "PROCESSING_BUCKET=$PROCESSING_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_KEY=SUPABASE_KEY:latest"

# --- PROCESSOR ---
echo "⚙️  Deploying Processor Job (Forensic Edition)..."
gcloud run jobs deploy $JOB_PROCESSOR \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/processor/src/index.js" \
  --memory 4Gi \
  --cpu 2 \
  --max-retries 3 \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "PROCESSING_BUCKET=$PROCESSING_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_KEY=SUPABASE_KEY:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=LLAMA_CLOUD_API_KEY:latest"

# --- AGGREGATOR ---
echo "⚙️  Deploying Aggregator Job..."
gcloud run jobs deploy $JOB_AGGREGATOR \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/aggregator/src/index.js" \
  --memory 2Gi \
  --max-retries 1 \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "PROCESSING_BUCKET=$PROCESSING_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_KEY=SUPABASE_KEY:latest"

# --- MEDIA PROCESSOR ---
echo "⚙️  Deploying Media Processor Job..."
gcloud run jobs deploy $JOB_MEDIA \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/media-processor/src/index.js" \
  --memory 2Gi \
  --max-retries 1 \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_KEY=SUPABASE_KEY:latest" \
  --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest"

# 3. Deploy Dispatcher Service
echo "📡 Deploying Dispatcher Service..."
gcloud run deploy $SERVICE_DISPATCHER \
  --image $IMAGE_URI \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "SPLITTER_JOB_NAME=$JOB_SPLITTER" \
  --set-env-vars "PROCESSOR_JOB_NAME=$JOB_PROCESSOR" \
  --set-env-vars "AGGREGATOR_JOB_NAME=$JOB_AGGREGATOR" \
  --set-env-vars "MEDIA_PROCESSOR_JOB_NAME=$JOB_MEDIA" \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "TOPIC_NAME=page-processing-topic" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "PROCESSING_BUCKET=$PROCESSING_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets="SUPABASE_KEY=SUPABASE_KEY:latest" \
  --set-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=LLAMA_CLOUD_API_KEY:latest"

echo "✅ DEPLOYMENT COMPLETE!"
echo "Dispatcher URL: $(gcloud run services describe $SERVICE_DISPATCHER --region $REGION --format 'value(status.url)')"