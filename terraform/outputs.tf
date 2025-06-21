output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}

output "region" {
  description = "The GCP region"
  value       = var.region
}

output "cloud_run_url" {
  description = "The URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.chatflow_backend.uri
}

output "frontend_url" {
  description = "The public URL of the deployed frontend"
  value       = "https://storage.googleapis.com/${google_storage_bucket.chatflow_frontend.name}/index.html"
}

output "frontend_bucket_url" {
  description = "The Google Cloud Storage bucket URL for the frontend"
  value       = "gs://${google_storage_bucket.chatflow_frontend.name}"
}

output "artifact_registry_url" {
  description = "The Artifact Registry repository URL"
  value       = google_artifact_registry_repository.chatflow_repo.name
}

output "docker_image_url" {
  description = "The Docker image URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/chatflow/backend"
}

output "firestore_database" {
  description = "The Firestore database name"
  value       = google_firestore_database.chatflow_db.name
}

output "firestore_indexes" {
  description = "The created Firestore indexes"
  value = {
    conversations_by_participant = google_firestore_index.conversations_by_participant_and_date.name
  }
}

output "pubsub_topic" {
  description = "The Pub/Sub topic name"
  value       = google_pubsub_topic.chatflow_events.name
}

output "pubsub_subscription" {
  description = "The Pub/Sub subscription name"
  value       = google_pubsub_subscription.chatflow_events_subscription.name
}

output "service_account_email" {
  description = "The service account email"
  value       = google_service_account.chatflow_service_account.email
}

output "vertex_ai_search" {
  description = "Vertex AI Search configuration (manually managed)"
  value = {
    data_store_id = "chatflow-conversations"
    search_engine_id = "chatflow-search-engine"
    location = "global"
    status = "Manual setup required - see VERTEX_AI_SEARCH_SETUP.md"
  }
} 