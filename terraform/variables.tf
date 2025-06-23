variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "The location for Firestore database"
  type        = string
  default     = "us-central"
}

variable "frontend_bucket_location" {
  description = "The location for the frontend storage bucket"
  type        = string
  default     = "US"
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "cpu_limit" {
  description = "CPU limit for Cloud Run containers"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for Cloud Run containers"
  type        = string
  default     = "512Mi"
}

variable "jwt_secret" {
  description = "JWT secret for authentication"
  type        = string
  sensitive   = true
}

variable "jwt_expires_in" {
  description = "JWT token expiration time"
  type        = string
  default     = "7d"
}

variable "cors_origin" {
  description = "CORS origin for the frontend"
  type        = string
  default     = "*"
}

variable "admin_email" {
  description = "Admin email address for rate limit management and administrative access"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "backend_image_tag" {
  description = "Tag for the backend Docker image"
  type        = string
  default     = "latest"
}

# Search Service Configuration Variables
variable "search_cache_ttl" {
  description = "Search cache time-to-live in milliseconds"
  type        = number
  default     = 300000  # 5 minutes
}

variable "search_cache_max_size" {
  description = "Maximum size of search cache"
  type        = number
  default     = 1000
}

variable "search_recent_queries_window" {
  description = "Time window for recent queries in days"
  type        = number
  default     = 7
}

variable "search_trending_topics_window" {
  description = "Time window for trending topics in days"
  type        = number
  default     = 7
}

variable "search_trending_keywords_window" {
  description = "Time window for trending keywords in days"
  type        = number
  default     = 30
}

variable "search_completions_recent_window" {
  description = "Time window for recent completions in days"
  type        = number
  default     = 1
}

variable "search_index_messages_limit" {
  description = "Limit for search index messages queries"
  type        = number
  default     = 100
}

variable "search_conversations_limit" {
  description = "Limit for conversations queries"
  type        = number
  default     = 50
}

variable "search_recent_conversations_limit" {
  description = "Limit for recent conversations"
  type        = number
  default     = 20
}

variable "search_popular_queries_limit" {
  description = "Limit for popular queries"
  type        = number
  default     = 100
}

variable "search_recent_queries_limit" {
  description = "Limit for recent queries"
  type        = number
  default     = 50
}

variable "search_terms_limit" {
  description = "Maximum number of search terms"
  type        = number
  default     = 10
}

variable "search_suggestions_completions_percent" {
  description = "Percentage allocation for completion suggestions"
  type        = number
  default     = 0.3
}

variable "search_suggestions_user_keywords_percent" {
  description = "Percentage allocation for user keyword suggestions"
  type        = number
  default     = 0.3
}

variable "search_suggestions_participants_percent" {
  description = "Percentage allocation for participant suggestions"
  type        = number
  default     = 0.2
}

variable "search_suggestions_trending_percent" {
  description = "Percentage allocation for trending suggestions"
  type        = number
  default     = 0.2
}

variable "search_default_recent_queries_percent" {
  description = "Percentage allocation for default recent queries"
  type        = number
  default     = 0.25
}

variable "search_default_popular_topics_percent" {
  description = "Percentage allocation for default popular topics"
  type        = number
  default     = 0.35
}

variable "search_default_recent_participants_percent" {
  description = "Percentage allocation for default recent participants"
  type        = number
  default     = 0.25
}

variable "search_default_trending_topics_percent" {
  description = "Percentage allocation for default trending topics"
  type        = number
  default     = 0.15
}

variable "search_popular_topics_min_count" {
  description = "Minimum count for popular topics"
  type        = number
  default     = 2
}

variable "search_trending_topics_min_frequency" {
  description = "Minimum frequency for trending topics"
  type        = number
  default     = 2
}

variable "search_trending_keywords_min_frequency" {
  description = "Minimum frequency for trending keywords"
  type        = number
  default     = 1
}

variable "search_min_query_length" {
  description = "Minimum query length for processing"
  type        = number
  default     = 2
}

variable "search_min_keyword_length" {
  description = "Minimum keyword length for indexing"
  type        = number
  default     = 2
}

variable "search_min_long_keyword_length" {
  description = "Minimum length for long keywords"
  type        = number
  default     = 3
}

variable "search_min_success_rate" {
  description = "Minimum success rate threshold"
  type        = number
  default     = 0.01
}

variable "search_default_limit" {
  description = "Default search result limit"
  type        = number
  default     = 20
}

variable "search_max_results" {
  description = "Maximum search results"
  type        = number
  default     = 50
}

variable "search_messages_per_conversation" {
  description = "Maximum messages per conversation to search"
  type        = number
  default     = 50
}

variable "search_completion_type_boost" {
  description = "Type boost multiplier for completion suggestions"
  type        = number
  default     = 1.5
}

variable "search_popular_type_boost" {
  description = "Type boost multiplier for popular suggestions"
  type        = number
  default     = 1.2
}

variable "search_recent_type_boost" {
  description = "Type boost multiplier for recent suggestions"
  type        = number
  default     = 1.1
}

variable "search_participant_type_boost" {
  description = "Type boost multiplier for participant suggestions"
  type        = number
  default     = 1.0
}

variable "search_topic_type_boost" {
  description = "Type boost multiplier for topic suggestions"
  type        = number
  default     = 1.0
}

variable "search_person_type_boost" {
  description = "Type boost multiplier for person suggestions"
  type        = number
  default     = 1.0
}

variable "search_trending_type_boost" {
  description = "Type boost multiplier for trending suggestions"
  type        = number
  default     = 0.8
}

variable "search_prefix_match_boost" {
  description = "Boost multiplier for prefix matches"
  type        = number
  default     = 2.0
}

variable "search_recent_query_boost" {
  description = "Boost score for recent queries"
  type        = number
  default     = 100
} 