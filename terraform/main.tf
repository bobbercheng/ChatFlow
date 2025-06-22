# Configure the Google Cloud provider
terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "firestore.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "storage.googleapis.com",
    "cloudfunctions.googleapis.com"
  ])

  project = var.project_id
  service = each.key

  disable_dependent_services = false
  disable_on_destroy        = false
}

# Create Artifact Registry repository for Docker images
resource "google_artifact_registry_repository" "chatflow_repo" {
  location      = var.region
  repository_id = "chatflow"
  description   = "ChatFlow Docker repository"
  format        = "DOCKER"

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required_apis]
}

# Create Firestore database
resource "google_firestore_database" "chatflow_db" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.required_apis]
}

# Create Firestore index for conversations query
# This index supports queries that filter by participantEmails (array-contains) 
# and order by updatedAt (descending)
resource "google_firestore_index" "conversations_by_participant_and_date" {
  project    = var.project_id
  database   = google_firestore_database.chatflow_db.name
  collection = "conversations"

  fields {
    field_path   = "participantEmails"
    array_config = "CONTAINS"
  }

  fields {
    field_path = "updatedAt"
    order      = "DESCENDING"
  }

  depends_on = [google_firestore_database.chatflow_db]
}

# Create Firestore index for search queries (trending analysis)
# This index supports queries that filter by lastUsed and frequency with ordering
resource "google_firestore_index" "search_queries_trending" {
  project    = var.project_id
  database   = google_firestore_database.chatflow_db.name
  collection = "searchQueries"

  fields {
    field_path = "lastUsed"
    order      = "ASCENDING"
  }

  fields {
    field_path = "frequency"
    order      = "ASCENDING"
  }

  depends_on = [google_firestore_database.chatflow_db]
}

# Single-field indexes are automatically created by Firestore
# No need to explicitly create an index just for createdAt ordering
# The index below is commented out because it's handled automatically

# resource "google_firestore_index" "conversation_messages_by_date" {
#   # Single field indexes are automatic in Firestore
#   # This would cause "Insufficient fields blocks" error
# }

# Note: Subcollection indexes for messages are automatically handled by Firestore
# for simple single-field queries (like ordering by createdAt)
# Complex subcollection indexes may need to be created manually through the console if needed

# Create Cloud Storage bucket for Cloud Functions source code
resource "google_storage_bucket" "functions_source" {
  name          = "${var.project_id}-functions-source"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true

  depends_on = [google_project_service.required_apis]
}

# ChatFlow uses Firestore-based intelligent search - no external AI services needed

# Create Pub/Sub topic for chatflow events
resource "google_pubsub_topic" "chatflow_events" {
  name = "chatflow-events"

  depends_on = [google_project_service.required_apis]
}

# Create Pub/Sub subscription for chatflow events
resource "google_pubsub_subscription" "chatflow_events_subscription" {
  name  = "chatflow-events-subscription"
  topic = google_pubsub_topic.chatflow_events.name

  ack_deadline_seconds = 20

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.chatflow_dead_letter.id
    max_delivery_attempts = 5
  }

  depends_on = [google_project_service.required_apis]
}

# Create dead letter topic for failed messages
resource "google_pubsub_topic" "chatflow_dead_letter" {
  name = "chatflow-dead-letter"

  depends_on = [google_project_service.required_apis]
}

# Create service account for Cloud Run
resource "google_service_account" "chatflow_service_account" {
  account_id   = "chatflow-cloudrun"
  display_name = "ChatFlow Cloud Run Service Account"
  description  = "Service account for ChatFlow Cloud Run service"
}

# Grant necessary IAM roles to the service account
resource "google_project_iam_member" "chatflow_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.chatflow_service_account.email}"
}

resource "google_project_iam_member" "chatflow_pubsub_editor" {
  project = var.project_id
  role    = "roles/pubsub.editor"
  member  = "serviceAccount:${google_service_account.chatflow_service_account.email}"
}

resource "google_project_iam_member" "chatflow_logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.chatflow_service_account.email}"
}

resource "google_project_iam_member" "chatflow_monitoring_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.chatflow_service_account.email}"
}

# Deploy Cloud Run service
resource "google_cloud_run_v2_service" "chatflow_backend" {
  name     = "chatflow-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.chatflow_service_account.email
    
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/chatflow/backend:${var.backend_image_tag}"
      
      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "USE_FIRESTORE"
        value = "true"
      }

      env {
        name  = "USE_PUBSUB"
        value = "true"
      }

      env {
        name  = "JWT_SECRET"
        value = var.jwt_secret
      }

      env {
        name  = "JWT_EXPIRES_IN"
        value = var.jwt_expires_in
      }

      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origin
      }

      env {
        name  = "ADMIN_EMAIL"
        value = var.admin_email
      }

      # Search Service Configuration
      env {
        name  = "SEARCH_CACHE_TTL"
        value = tostring(var.search_cache_ttl)
      }

      env {
        name  = "SEARCH_CACHE_MAX_SIZE"
        value = tostring(var.search_cache_max_size)
      }

      env {
        name  = "SEARCH_RECENT_QUERIES_WINDOW"
        value = tostring(var.search_recent_queries_window)
      }

      env {
        name  = "SEARCH_TRENDING_TOPICS_WINDOW"
        value = tostring(var.search_trending_topics_window)
      }

      env {
        name  = "SEARCH_TRENDING_KEYWORDS_WINDOW"
        value = tostring(var.search_trending_keywords_window)
      }

      env {
        name  = "SEARCH_COMPLETIONS_RECENT_WINDOW"
        value = tostring(var.search_completions_recent_window)
      }

      env {
        name  = "SEARCH_INDEX_MESSAGES_LIMIT"
        value = tostring(var.search_index_messages_limit)
      }

      env {
        name  = "SEARCH_CONVERSATIONS_LIMIT"
        value = tostring(var.search_conversations_limit)
      }

      env {
        name  = "SEARCH_RECENT_CONVERSATIONS_LIMIT"
        value = tostring(var.search_recent_conversations_limit)
      }

      env {
        name  = "SEARCH_POPULAR_QUERIES_LIMIT"
        value = tostring(var.search_popular_queries_limit)
      }

      env {
        name  = "SEARCH_RECENT_QUERIES_LIMIT"
        value = tostring(var.search_recent_queries_limit)
      }

      env {
        name  = "SEARCH_TERMS_LIMIT"
        value = tostring(var.search_terms_limit)
      }

      env {
        name  = "SEARCH_SUGGESTIONS_COMPLETIONS_PERCENT"
        value = tostring(var.search_suggestions_completions_percent)
      }

      env {
        name  = "SEARCH_SUGGESTIONS_USER_KEYWORDS_PERCENT"
        value = tostring(var.search_suggestions_user_keywords_percent)
      }

      env {
        name  = "SEARCH_SUGGESTIONS_PARTICIPANTS_PERCENT"
        value = tostring(var.search_suggestions_participants_percent)
      }

      env {
        name  = "SEARCH_SUGGESTIONS_TRENDING_PERCENT"
        value = tostring(var.search_suggestions_trending_percent)
      }

      env {
        name  = "SEARCH_DEFAULT_RECENT_QUERIES_PERCENT"
        value = tostring(var.search_default_recent_queries_percent)
      }

      env {
        name  = "SEARCH_DEFAULT_POPULAR_TOPICS_PERCENT"
        value = tostring(var.search_default_popular_topics_percent)
      }

      env {
        name  = "SEARCH_DEFAULT_RECENT_PARTICIPANTS_PERCENT"
        value = tostring(var.search_default_recent_participants_percent)
      }

      env {
        name  = "SEARCH_DEFAULT_TRENDING_TOPICS_PERCENT"
        value = tostring(var.search_default_trending_topics_percent)
      }

      env {
        name  = "SEARCH_POPULAR_TOPICS_MIN_COUNT"
        value = tostring(var.search_popular_topics_min_count)
      }

      env {
        name  = "SEARCH_TRENDING_TOPICS_MIN_FREQUENCY"
        value = tostring(var.search_trending_topics_min_frequency)
      }

      env {
        name  = "SEARCH_TRENDING_KEYWORDS_MIN_FREQUENCY"
        value = tostring(var.search_trending_keywords_min_frequency)
      }

      env {
        name  = "SEARCH_MIN_QUERY_LENGTH"
        value = tostring(var.search_min_query_length)
      }

      env {
        name  = "SEARCH_MIN_KEYWORD_LENGTH"
        value = tostring(var.search_min_keyword_length)
      }

      env {
        name  = "SEARCH_MIN_LONG_KEYWORD_LENGTH"
        value = tostring(var.search_min_long_keyword_length)
      }

      env {
        name  = "SEARCH_MIN_SUCCESS_RATE"
        value = tostring(var.search_min_success_rate)
      }

      env {
        name  = "SEARCH_DEFAULT_LIMIT"
        value = tostring(var.search_default_limit)
      }

      env {
        name  = "SEARCH_MAX_RESULTS"
        value = tostring(var.search_max_results)
      }

      env {
        name  = "SEARCH_MESSAGES_PER_CONVERSATION"
        value = tostring(var.search_messages_per_conversation)
      }

      env {
        name  = "SEARCH_COMPLETION_TYPE_BOOST"
        value = tostring(var.search_completion_type_boost)
      }

      env {
        name  = "SEARCH_POPULAR_TYPE_BOOST"
        value = tostring(var.search_popular_type_boost)
      }

      env {
        name  = "SEARCH_RECENT_TYPE_BOOST"
        value = tostring(var.search_recent_type_boost)
      }

      env {
        name  = "SEARCH_PARTICIPANT_TYPE_BOOST"
        value = tostring(var.search_participant_type_boost)
      }

      env {
        name  = "SEARCH_TOPIC_TYPE_BOOST"
        value = tostring(var.search_topic_type_boost)
      }

      env {
        name  = "SEARCH_PERSON_TYPE_BOOST"
        value = tostring(var.search_person_type_boost)
      }

      env {
        name  = "SEARCH_TRENDING_TYPE_BOOST"
        value = tostring(var.search_trending_type_boost)
      }

      env {
        name  = "SEARCH_PREFIX_MATCH_BOOST"
        value = tostring(var.search_prefix_match_boost)
      }

      env {
        name  = "SEARCH_RECENT_QUERY_BOOST"
        value = tostring(var.search_recent_query_boost)
      }

      # Liveness probe
      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 30
        timeout_seconds       = 10
        period_seconds        = 30
        failure_threshold     = 3
      }

      # Startup probe
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 0
        timeout_seconds       = 10
        period_seconds        = 10
        failure_threshold     = 30
      }
    }
  }

  depends_on = [
    google_project_service.required_apis,
    google_firestore_database.chatflow_db,
    google_pubsub_topic.chatflow_events,
    google_pubsub_subscription.chatflow_events_subscription
  ]
}

# Allow unauthenticated access to Cloud Run service
resource "google_cloud_run_service_iam_member" "chatflow_public_access" {
  location = google_cloud_run_v2_service.chatflow_backend.location
  project  = google_cloud_run_v2_service.chatflow_backend.project
  service  = google_cloud_run_v2_service.chatflow_backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Create Cloud Storage bucket for frontend hosting
resource "google_storage_bucket" "chatflow_frontend" {
  name                        = "${var.project_id}-chatflow-frontend"
  location                    = var.frontend_bucket_location
  force_destroy               = true
  uniform_bucket_level_access = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.required_apis]
}

# Make bucket publicly readable
resource "google_storage_bucket_iam_member" "chatflow_frontend_public" {
  bucket = google_storage_bucket.chatflow_frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Build frontend with correct backend URL
resource "null_resource" "build_frontend" {
  triggers = {
    backend_url = google_cloud_run_v2_service.chatflow_backend.uri
    always_run  = timestamp()
  }

  provisioner "local-exec" {
    working_dir = "../frontend"
    command = <<-EOT
      # Create production config file
      cat > config.js << 'EOF'
window.CHATFLOW_CONFIG = {
    API_BASE_URL: '${google_cloud_run_v2_service.chatflow_backend.uri}/v1',
    WS_BASE_URL: '${replace(google_cloud_run_v2_service.chatflow_backend.uri, "https://", "wss://")}/ws',
    APP_NAME: 'ChatFlow',
    VERSION: '1.0.0'
};
EOF

      # Build the frontend with cache busting
      npm run build-with-cache-bust
      
      # Copy config to dist
      cp config.js dist/
    EOT
  }

  depends_on = [google_cloud_run_v2_service.chatflow_backend]
}

# Upload frontend files to bucket
resource "google_storage_bucket_object" "frontend_files" {
  for_each = fileset("../frontend/dist", "**/*")
  
  name   = each.value
  bucket = google_storage_bucket.chatflow_frontend.name
  source = "../frontend/dist/${each.value}"
  
  content_type = lookup({
    "html" = "text/html",
    "css"  = "text/css",
    "js"   = "application/javascript",
    "json" = "application/json",
    "png"  = "image/png",
    "jpg"  = "image/jpeg",
    "jpeg" = "image/jpeg",
    "gif"  = "image/gif",
    "svg"  = "image/svg+xml",
    "ico"  = "image/x-icon"
  }, split(".", each.value)[length(split(".", each.value)) - 1], "application/octet-stream")

  depends_on = [
    null_resource.build_frontend,
    google_storage_bucket_iam_member.chatflow_frontend_public
  ]
} 