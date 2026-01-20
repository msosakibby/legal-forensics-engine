#!/bin/bash
set -e

# CONFIGURATION
PROJECT_ID="legal-forensics-engine"
REGION="us-central1"
REPO_NAME="lfe-repo"

# BUCKET NAMES
INPUT_BUCKET="legal-forensics-engine-input"
PROCESSING_BUCKET="legal-forensics-engine-processing"
ARCHIVE_BUCKET="legal-forensics-engine-archive"

# NAMES (Matched to your Dispatcher's Env Vars)
JOB_DISPATCHER="job-dispatcher"       # Cloud Run Service
JOB_SPLITTER="job-splitter"           # Cloud Run Job
JOB_PROCESSOR="job-processor"         # Cloud Run Job
JOB_MEDIA="job-media-processor"       # Cloud Run Job <--- FIXED
JOB_AGGREGATOR="job-aggregator"       # Cloud Run Job

# TOPICS
TOPIC_TO_SPLITTER="topic-to-splitter"
TOPIC_TO_PROCESSOR="topic-to-processor"
TOPIC_TO_MEDIA="topic-to-media"
TOPIC_TO_AGGREGATOR="topic-to-aggregator"
TOPIC_PAGE_PROCESSING="page-processing-topic"

# --- HELPER FUNCTIONS ---
function ensure_bucket() {
  if gcloud storage buckets describe "gs://$1" --project "$PROJECT_ID" > /dev/null 2>&1; then
    echo "   ✅ Bucket gs://$1 exists."
  else
    echo "   🔨 Creating bucket gs://$1..."
    gcloud storage buckets create "gs://$1" --project="$PROJECT_ID" --location="$REGION"
  fi
}

function ensure_topic() {
  if gcloud pubsub topics describe "$1" --project "$PROJECT_ID" > /dev/null 2>&1; then
    echo "   ✅ Topic $1 exists."
  else
    echo "   🔨 Creating topic $1..."
    gcloud pubsub topics create "$1" --project="$PROJECT_ID"
  fi
}

echo "=== 🚀 Starting Infrastructure Setup for $PROJECT_ID ==="

# 1. Enable Services
echo "1️⃣  Enabling APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com pubsub.googleapis.com storage.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project $PROJECT_ID

# 2. Buckets
echo "2️⃣  Verifying Storage..."
ensure_bucket "$INPUT_BUCKET"
ensure_bucket "$PROCESSING_BUCKET"
ensure_bucket "$ARCHIVE_BUCKET"

# 3. Registry
echo "3️⃣  Verifying Artifact Registry..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" > /dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" --repository-format=docker --location="$REGION" --description="Legal Forensics Repo" --project="$PROJECT_ID"
fi

# 4. Topics
echo "4️⃣  Verifying Pub/Sub Topics..."
ensure_topic "$TOPIC_TO_SPLITTER"
ensure_topic "$TOPIC_TO_PROCESSOR"
ensure_topic "$TOPIC_TO_MEDIA"
ensure_topic "$TOPIC_TO_AGGREGATOR"
ensure_topic "$TOPIC_PAGE_PROCESSING"

# 5. Build & Deploy
echo "5️⃣  Building and Deploying Services..."

# --- DISPATCHER (SERVICE) ---
echo "   >> Deploying Dispatcher (Service)..."
gcloud builds submit . --config cloudbuild_dispatcher.yaml --project=$PROJECT_ID
gcloud run deploy $JOB_DISPATCHER \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_DISPATCHER \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "SPLITTER_JOB_NAME=$JOB_SPLITTER" \
  --set-env-vars "PROCESSOR_JOB_NAME=$JOB_PROCESSOR" \
  --set-env-vars "AGGREGATOR_JOB_NAME=$JOB_AGGREGATOR" \
  --set-env-vars "MEDIA_PROCESSOR_JOB_NAME=$JOB_MEDIA" \
  --set-env-vars "REGION=$REGION" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars "TOPIC_NAME=$TOPIC_PAGE_PROCESSING" \
  --set-env-vars "INPUT_BUCKET=$INPUT_BUCKET" \
  --set-env-vars "PROCESSING_BUCKET=$PROCESSING_BUCKET" \
  --set-env-vars "ARCHIVE_BUCKET=$ARCHIVE_BUCKET" \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --set-secrets="OPENAI_API_KEY=openai-api-key:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=llama-cloud-api-key:latest"

# --- SPLITTER (JOB) ---
echo "   >> Deploying Splitter (Job)..."
gcloud builds submit . --config cloudbuild_splitter.yaml --project=$PROJECT_ID
gcloud run jobs deploy $JOB_SPLITTER \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_SPLITTER \
  --region $REGION \
  --project $PROJECT_ID \
  --max-retries 0 \
  --set-env-vars PROJECT_ID=$PROJECT_ID,INPUT_BUCKET=$INPUT_BUCKET,OUTPUT_TOPIC=$TOPIC_TO_PROCESSOR \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest"

# --- PROCESSOR (JOB) ---
echo "   >> Deploying Processor (Job)..."
gcloud builds submit . --config cloudbuild_processor.yaml --project=$PROJECT_ID
gcloud run jobs deploy $JOB_PROCESSOR \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_PROCESSOR \
  --region $REGION \
  --project $PROJECT_ID \
  --memory 4Gi \
  --cpu 2 \
  --max-retries 3 \
  --set-env-vars PROJECT_ID=$PROJECT_ID,OUTPUT_TOPIC=$TOPIC_TO_AGGREGATOR,VERTEX_LOCATION=$REGION \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --set-secrets="LLAMA_CLOUD_API_KEY=llama-cloud-api-key:latest"

# --- MEDIA PROCESSOR (JOB) - FIXED ---
echo "   >> Deploying Media Processor (Job)..."
gcloud builds submit . --config cloudbuild_media.yaml --project=$PROJECT_ID
gcloud run jobs deploy $JOB_MEDIA \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_MEDIA \
  --region $REGION \
  --project $PROJECT_ID \
  --max-retries 1 \
  --set-env-vars PROJECT_ID=$PROJECT_ID,OUTPUT_TOPIC=$TOPIC_TO_AGGREGATOR \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest" \
  --set-secrets="OPENAI_API_KEY=openai-api-key:latest"

# --- AGGREGATOR (JOB) ---
echo "   >> Deploying Aggregator (Job)..."
gcloud builds submit . --config cloudbuild_aggregator.yaml --project=$PROJECT_ID
gcloud run jobs deploy $JOB_AGGREGATOR \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$JOB_AGGREGATOR \
  --region $REGION \
  --project $PROJECT_ID \
  --memory 2Gi \
  --max-retries 1 \
  --set-env-vars PROJECT_ID=$PROJECT_ID,OUTPUT_BUCKET=$ARCHIVE_BUCKET \
  --set-secrets="SUPABASE_URL=supabase-url:latest" \
  --set-secrets="SUPABASE_KEY=supabase-key:latest"

# 6. Wiring Pub/Sub
echo "6️⃣  Wiring Pub/Sub Subscriptions..."

SPLITTER_URL=$(gcloud run services describe $JOB_DISPATCHER --region $REGION --project $PROJECT_ID --format 'value(status.url)')
# Note: Since Splitter/Processor/Media/Aggregator are now JOBS, they don't have URLs to push to directly via Pub/Sub in this architecture.
# The Dispatcher triggers them directly via the Cloud Run API.
# Only the Dispatcher needs an ingress.

echo "=== ✅ Deployment Complete ==="
echo "Input Bucket: gs://$INPUT_BUCKET"	
