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

echo "🚀 DEPLOYING TO PROJECT: $PROJECT_ID ($REGION)"

# 1. Enable Services (First run only)
# gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

# 2. Create Artifact Registry Repo (if not exists)
if ! gcloud artifacts repositories describe $REPO_NAME --location=$REGION > /dev/null 2>&1; then
    echo "Creating Artifact Registry Repository..."
    gcloud artifacts repositories create $REPO_NAME --repository-format=docker --location=$REGION
fi

# 3. Build & Push Image
echo "📦 Building and Pushing Docker Image..."
gcloud builds submit --tag $IMAGE_URI .

# 4. Deploy Cloud Run Jobs

echo "⚙️  Deploying Splitter Job..."
gcloud run jobs deploy $JOB_SPLITTER \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/splitter/src/index.js" \
  --set-env-vars "TOPIC_NAME=page-processing-topic" \
  --set-env-vars "PROCESSING_BUCKET=lfe-processing-$PROJECT_ID" \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --max-retries 0

echo "⚙️  Deploying Processor Job..."
gcloud run jobs deploy $JOB_PROCESSOR \
  --image $IMAGE_URI \
  --region $REGION \
  --command "node" \
  --args "dist/processor/src/index.js" \
  --memory 2Gi \
  --cpu 1 \
  --max-retries 3 \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=llama-cloud-api-key:latest"

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
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest"

# 5. Deploy Dispatcher Service
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
  --set-env-vars "INPUT_BUCKET=lfe-input-$PROJECT_ID" \
  --set-env-vars "PROCESSING_BUCKET=lfe-processing-$PROJECT_ID" \
  --set-env-vars "ARCHIVE_BUCKET=lfe-archive-$PROJECT_ID" \
  --set-env-vars "TOPIC_NAME=page-processing-topic" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --set-secrets="OPENAI_API_KEY=openai-api-key:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=llama-cloud-api-key:latest"

echo "✅ DEPLOYMENT COMPLETE!"
echo "Dispatcher URL: $(gcloud run services describe $SERVICE_DISPATCHER --region $REGION --format 'value(status.url)')"
