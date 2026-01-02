terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.50.0"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# --- VARIABLES ---
variable "gcp_project_id" {
  description = "The GCP project ID"
  type        = string
  default     = "legal-forensics-engine" 
}

variable "gcp_region" {
  description = "The GCP region for the resources."
  type        = string
  default     = "us-central1"
}

variable "image_tag" {
  description = "The Docker image tag to deploy, typically the git commit SHA."
  type        = string
  default     = "latest"
}

# --- API & SERVICE ENABLEMENT ---
resource "google_project_service" "vertex_ai" {
  project = var.gcp_project_id
  service = "aiplatform.googleapis.com"

  # Keep the API enabled even if the resource is removed from Terraform
  disable_on_destroy = false
}

# --- SERVICE ACCOUNT & IAM ---
resource "google_service_account" "forensics_sa" {
  account_id   = "forensics-sa"
  display_name = "Forensics Engine Service Account"
}

resource "google_project_iam_member" "sa_roles" {
  for_each = toset([
    "roles/storage.admin",
    "roles/aiplatform.user",
    "roles/secretmanager.secretAccessor",
    "roles/run.developer",
    "roles/run.invoker", # Use a more restrictive role for better security
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/iam.serviceAccountUser"
  ])
  project    = var.gcp_project_id
  role       = each.key
  member     = "serviceAccount:${google_service_account.forensics_sa.email}"
  depends_on = [google_project_service.vertex_ai]
}

# --- BUCKETS ---
resource "google_storage_bucket" "input" {
  name                        = "${var.gcp_project_id}-input"
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = true 
}

resource "google_storage_bucket" "processing" {
  name                        = "${var.gcp_project_id}-processing"
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = true 
}

resource "google_storage_bucket" "archive" {
  name                        = "${var.gcp_project_id}-archive"
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = true 
}

# --- PUB/SUB TOPICS ---
resource "google_pubsub_topic" "topic_input" { name = "evidence-uploaded" }
resource "google_pubsub_topic" "topic_page_ready" { name = "page-ready-for-processing" }
resource "google_pubsub_topic" "topic_aggregation" { name = "document-ready-to-aggregate" }

# --- IAM: ALLOW GCS TO PUBLISH TO PUBSUB ---
data "google_storage_project_service_account" "gcs_account" {}

resource "google_pubsub_topic_iam_member" "gcs_publisher" {
  topic  = google_pubsub_topic.topic_input.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${data.google_storage_project_service_account.gcs_account.email_address}"
}

resource "google_storage_notification" "bucket_notification" {
  bucket         = google_storage_bucket.input.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.topic_input.id
  event_types    = ["OBJECT_FINALIZE"]
  depends_on     = [google_pubsub_topic.topic_input, google_pubsub_topic_iam_member.gcs_publisher]
}

# --- JOB 1: SPLITTER (Lanes A/B/C) ---
resource "google_cloud_run_v2_job" "splitter" {
  name     = "job-splitter"
  location = var.gcp_region
  deletion_protection = false
  depends_on = [google_project_iam_member.sa_roles]

  template {
    template {
      service_account = google_service_account.forensics_sa.email
      containers {
        image = "gcr.io/${var.gcp_project_id}/splitter:${var.image_tag}"
        
        env { 
          name  = "INPUT_BUCKET" 
          value = google_storage_bucket.input.name 
        }
        env { 
          name  = "PROCESSING_BUCKET" 
          value = google_storage_bucket.processing.name 
        }
        env { 
          name  = "TOPIC_NAME" 
          value = google_pubsub_topic.topic_page_ready.name 
        }
        
        env {
          name = "SUPABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "supabase-url"
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_KEY"
          value_source {
            secret_key_ref {
              secret  = "supabase-key"
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# --- JOB 2: PROCESSOR (Lanes A/B/C) ---
resource "google_cloud_run_v2_job" "processor" {
  name     = "job-processor"
  location = var.gcp_region
  deletion_protection = false
  depends_on = [google_project_iam_member.sa_roles]

  template {
    template {
      service_account = google_service_account.forensics_sa.email
      timeout = "3600s"
      
      containers {
        image = "gcr.io/${var.gcp_project_id}/processor:${var.image_tag}"

        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.gcp_project_id
        }
        env {
          name  = "REGION"
          value = var.gcp_region
        }
        env {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "openai-api-key"
              version = "latest"
            }
          }
        }
        env {
          name = "LLAMA_CLOUD_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "llama-key"
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "supabase-url"
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_KEY"
          value_source {
            secret_key_ref {
              secret  = "supabase-key"
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# --- JOB 3: AGGREGATOR (Final Assembly + Vector Store) ---
resource "google_cloud_run_v2_job" "aggregator" {
  name     = "job-aggregator"
  location = var.gcp_region
  deletion_protection = false
  depends_on = [google_project_iam_member.sa_roles]

  template {
    template {
      service_account = google_service_account.forensics_sa.email
      containers {
        image = "gcr.io/${var.gcp_project_id}/aggregator:${var.image_tag}"

        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.gcp_project_id
        }
        env {
          name  = "REGION"
          value = var.gcp_region
        }

        env { 
          name  = "INPUT_BUCKET"
          value = google_storage_bucket.input.name 
        }
        env { 
          name  = "PROCESSING_BUCKET"
          value = google_storage_bucket.processing.name 
        }
        env { 
          name  = "ARCHIVE_BUCKET"
          value = google_storage_bucket.archive.name 
        }
        
        env {
          name = "SUPABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "supabase-url"
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_KEY"
          value_source {
            secret_key_ref {
              secret  = "supabase-key"
              version = "latest"
            }
          }
        }
        env {
          name = "OPENAI_VECTOR_STORE_ID"
          value_source {
            secret_key_ref {
              secret  = "OPENAI_VECTOR_STORE_ID"
              version = "latest"
            }
          }
        }
        env {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "openai-api-key"
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# --- JOB 4: MEDIA PROCESSOR (Lane D) ---
resource "google_cloud_run_v2_job" "media_processor" {
  name     = "job-media-processor"
  location = var.gcp_region
  deletion_protection = false
  depends_on = [google_project_iam_member.sa_roles]

  template {
    template {
      service_account = google_service_account.forensics_sa.email
      timeout = "3600s" 
      
      containers {
        image = "gcr.io/${var.gcp_project_id}/media-processor:${var.image_tag}"
        
        resources {
          limits = {
            memory = "2Gi"
            cpu    = "2"
          }
        }

        env { 
          name  = "INPUT_BUCKET" 
          value = google_storage_bucket.input.name 
        }
        env { 
          name  = "ARCHIVE_BUCKET" 
          value = google_storage_bucket.archive.name 
        }

        env {
          name = "SUPABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "supabase-url"
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_KEY"
          value_source {
            secret_key_ref {
              secret  = "supabase-key"
              version = "latest"
            }
          }
        }
        env {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = "openai-api-key"
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# --- DISPATCHER SERVICE (Smart Router) ---
resource "google_cloud_run_v2_service" "dispatcher" {
  name     = "dispatcher-service"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL" # Must be ALL to receive Pub/Sub push requests
  deletion_protection = false 

  template {
    containers {
      image = "gcr.io/${var.gcp_project_id}/dispatcher:${var.image_tag}"
      
      env { 
        name  = "SPLITTER_JOB_NAME" 
        value = google_cloud_run_v2_job.splitter.name 
      }
      env { 
        name  = "PROCESSOR_JOB_NAME" 
        value = google_cloud_run_v2_job.processor.name 
      }
      env { 
        name  = "AGGREGATOR_JOB_NAME" 
        value = google_cloud_run_v2_job.aggregator.name 
      }
      env { 
        name  = "MEDIA_PROCESSOR_JOB_NAME" 
        value = google_cloud_run_v2_job.media_processor.name 
      }
      env {
        name  = "REGION"
        value = var.gcp_region
      }
    }
    service_account = google_service_account.forensics_sa.email
  }
}

# --- SUBSCRIPTIONS ---
resource "google_pubsub_subscription" "input_sub" {
  name  = "trigger-splitter-sub"
  topic = google_pubsub_topic.topic_input.name
  message_retention_duration = "600s"

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.dispatcher.uri}/trigger-splitter"
    oidc_token {
      service_account_email = google_service_account.forensics_sa.email
    }
  }
}

resource "google_pubsub_subscription" "process_sub" {
  name  = "trigger-processor-sub"
  topic = google_pubsub_topic.topic_page_ready.name

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.dispatcher.uri}/trigger-processor"
    oidc_token {
      service_account_email = google_service_account.forensics_sa.email
    }
  }
}

resource "google_pubsub_subscription" "aggregation_sub" {
  name  = "trigger-aggregator-sub"
  topic = google_pubsub_topic.topic_aggregation.name

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.dispatcher.uri}/trigger-aggregator"
    oidc_token {
      service_account_email = google_service_account.forensics_sa.email
    }
  }
}