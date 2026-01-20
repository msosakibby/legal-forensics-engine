#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
INPUT_BUCKET="${PROJECT_ID}-input"
REGION="us-central1"
SERVICE_ACCOUNT_NAME="lfe-invoker"

echo "🔗 Setting up Eventarc Trigger for Bucket: $INPUT_BUCKET"

# 1. Create Service Account for Eventarc Identity
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" > /dev/null 2>&1; then
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name "LFE Eventarc Invoker"
fi

# 2. Grant Permissions
# Allow Eventarc to invoke Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

# Allow Eventarc to receive events
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/eventarc.eventReceiver"

# Grant Pub/Sub Publisher to GCS Service Agent (Required for GCS notifications)
SERVICE_AGENT=$(gcloud storage service-agent --project=$PROJECT_ID)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_AGENT" \
    --role="roles/pubsub.publisher"

# 3. Create the Trigger
gcloud eventarc triggers create lfe-gcs-trigger \
    --location=$REGION \
    --destination-run-service=lfe-dispatcher \
    --destination-run-region=$REGION \
    --event-filters="type=google.cloud.storage.object.v1.finalized" \
    --event-filters="bucket=$INPUT_BUCKET" \
    --service-account="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "✅ Trigger Created! Uploading a file to gs://$INPUT_BUCKET will now auto-start the pipeline."