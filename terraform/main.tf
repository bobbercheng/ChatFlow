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
    "storage.googleapis.com"
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
      image = "${var.region}-docker.pkg.dev/${var.project_id}/chatflow/backend:latest"
      
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

      # Build the frontend
      npm run build
      
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