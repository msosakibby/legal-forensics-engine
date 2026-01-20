#!/bin/bash
set -e

# Load .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PROJECT_ID=$(gcloud config get-value project)
echo "🔐 Creating Secrets in Project: $PROJECT_ID"

create_secret() {
  local NAME=$1
  local VALUE=$2

  if [ -z "$VALUE" ]; then
    echo "⚠️  Missing value for $NAME. Skipping..."
    return
  fi

  # Check if secret exists
  if gcloud secrets describe "$NAME" --project="$PROJECT_ID" > /dev/null 2>&1; then
    echo "   🔄 Updating existing secret: $NAME"
    echo -n "$VALUE" | gcloud secrets versions add "$NAME" --data-file=- --project="$PROJECT_ID"
  else
    echo "   ➕ Creating new secret: $NAME"
    echo -n "$VALUE" | gcloud secrets create "$NAME" --data-file=- --project="$PROJECT_ID"
  fi
}

# 1. Supabase
create_secret "SUPABASE_URL" "$SUPABASE_URL"
create_secret "SUPABASE_KEY" "$SUPABASE_KEY"

# 2. LlamaIndex (For Processor)
create_secret "LLAMA_CLOUD_API_KEY" "$LLAMA_CLOUD_API_KEY"

# 3. OpenAI (For Media Processor)
create_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"

echo "------------------------------------------------"
echo "✅ Secrets creation complete."
echo "   - SUPABASE_URL"
echo "   - SUPABASE_KEY"
echo "   - LLAMA_CLOUD_API_KEY"
echo "   - OPENAI_API_KEY"
echo "------------------------------------------------"
echo "Next: Run './setup_env.sh' to link these secrets to your Cloud Run Jobs."