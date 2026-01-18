#!/bin/bash
set -e

# =============================================================================
# LFE LOG ANALYZER
# Usage: ./analyze_logs.sh [recent|errors|trace DOC_ID|job JOB_NAME]
# =============================================================================

PROJECT_ID=$(gcloud config get-value project)
LIMIT=50

# Resource Names (Must match deploy.sh)
JOB_SPLITTER="lfe-splitter"
JOB_PROCESSOR="lfe-processor"
JOB_AGGREGATOR="lfe-aggregator"
SERVICE_DISPATCHER="lfe-dispatcher"

function show_help {
    echo "Usage: ./analyze_logs.sh [COMMAND] [ARGUMENT]"
    echo ""
    echo "Commands:"
    echo "  recent        Show the 50 most recent logs across all LFE services"
    echo "  errors        Show recent errors (Severity >= ERROR)"
    echo "  trace <ID>    Trace a specific DOC_ID across the pipeline"
    echo "  job <NAME>    Show logs for a specific job (splitter, processor, aggregator)"
    echo ""
}

CMD=$1
ARG=$2

# Filter for both Cloud Run Jobs and Services
FILTER_BASE="resource.type = (cloud_run_job OR cloud_run_revision) AND \
(resource.labels.job_name = ($JOB_SPLITTER OR $JOB_PROCESSOR OR $JOB_AGGREGATOR) OR \
resource.labels.service_name = $SERVICE_DISPATCHER)"

echo "🔍 Project: $PROJECT_ID"

if [ "$CMD" == "recent" ]; then
    echo "Fetching recent logs..."
    gcloud logging read "$FILTER_BASE" --project=$PROJECT_ID --limit=$LIMIT --format="table(timestamp, resource.labels.job_name, resource.labels.service_name, textPayload, jsonPayload.message)"
    
elif [ "$CMD" == "errors" ]; then
    echo "🚨 Fetching error logs..."
    gcloud logging read "$FILTER_BASE AND severity>=ERROR" --project=$PROJECT_ID --limit=$LIMIT --format="table(timestamp, severity, resource.labels.job_name, textPayload, jsonPayload.message, jsonPayload.error)"

elif [ "$CMD" == "trace" ]; then
    if [ -z "$ARG" ]; then echo "Error: Missing DOC_ID"; exit 1; fi
    echo "🕵️‍♀️ Tracing DOC_ID: $ARG"
    # Searches textPayload (console.log) and jsonPayload (structured logs)
    gcloud logging read "$FILTER_BASE AND (textPayload:$ARG OR jsonPayload.docId:$ARG OR jsonPayload.DOC_ID:$ARG)" --project=$PROJECT_ID --format="table(timestamp, resource.labels.job_name, textPayload, jsonPayload.message)"

elif [ "$CMD" == "job" ]; then
    echo "Viewing logs for job: lfe-$ARG"
    gcloud logging read "resource.labels.job_name = lfe-$ARG" --project=$PROJECT_ID --limit=$LIMIT --format="table(timestamp, textPayload, jsonPayload.message)"

else
    show_help
fi