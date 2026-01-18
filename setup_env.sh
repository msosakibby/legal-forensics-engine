#!/bin/bash

echo "🔧 Setting up .env file..."

# 1. Get Project ID
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

echo "Detected Project ID: $PROJECT_ID"

# 2. Fetch Secrets (Graceful fallback)
echo "Fetching secrets from Google Cloud..."
LLAMA_KEY=$(gcloud secrets versions access latest --secret="llama-cloud-api-key" --quiet 2>/dev/null || echo "PLACEHOLDER_LLAMA_KEY")
SUPABASE_URL=$(gcloud secrets versions access latest --secret="supabase-url" --quiet 2>/dev/null || echo "PLACEHOLDER_SUPABASE_URL")
SUPABASE_KEY=$(gcloud secrets versions access latest --secret="supabase-key" --quiet 2>/dev/null || echo "PLACEHOLDER_SUPABASE_KEY")

# 3. Write .env
cat > .env <<EOF
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
REGION=$REGION
LLAMA_CLOUD_API_KEY=$LLAMA_KEY
SUPABASE_URL=$SUPABASE_URL
SUPABASE_KEY=$SUPABASE_KEY
EOF

echo "✅ .env file created!"
echo "Run 'chmod +x setup_env.sh' if needed, but I just ran it for you (conceptually)."

