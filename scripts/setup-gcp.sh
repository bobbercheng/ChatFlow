#!/bin/bash

# ChatFlow GCP Setup Script
# This script sets up the initial GCP project configuration and prerequisites

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if gcloud is installed
check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it from https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    print_success "gcloud CLI is installed"
}

# Function to authenticate with gcloud
authenticate() {
    print_status "Checking gcloud authentication..."
    
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_status "Not authenticated with gcloud. Starting authentication..."
        gcloud auth login
    else
        print_success "Already authenticated with gcloud"
    fi
}

# Function to get or create project
setup_project() {
    echo
    print_status "Setting up GCP project..."
    
    # List available projects
    print_status "Available projects:"
    gcloud projects list --format="table(projectId,name,lifecycleState)"
    
    echo
    read -p "Enter your GCP project ID (or press Enter to create a new one): " PROJECT_ID
    
    if [ -z "$PROJECT_ID" ]; then
        # Create new project
        echo
        read -p "Enter a project ID for the new project: " NEW_PROJECT_ID
        read -p "Enter a project name: " PROJECT_NAME
        
        print_status "Creating new project: $NEW_PROJECT_ID"
        gcloud projects create "$NEW_PROJECT_ID" --name="$PROJECT_NAME"
        PROJECT_ID="$NEW_PROJECT_ID"
        
        print_success "Project created: $PROJECT_ID"
    else
        print_status "Using existing project: $PROJECT_ID"
    fi
    
    # Set the project
    gcloud config set project "$PROJECT_ID"
    print_success "Project set to: $PROJECT_ID"
    
    # Check if billing is enabled
    print_status "Checking billing account..."
    if ! gcloud billing projects describe "$PROJECT_ID" &>/dev/null; then
        print_warning "No billing account is linked to this project."
        print_status "Available billing accounts:"
        gcloud billing accounts list
        
        echo
        read -p "Enter a billing account ID to link: " BILLING_ACCOUNT
        gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
        print_success "Billing account linked"
    else
        print_success "Billing is already enabled for this project"
    fi
}

# Function to enable required APIs
enable_apis() {
    print_status "Enabling required Google Cloud APIs..."
    
    APIS=(
        "firestore.googleapis.com"
        "pubsub.googleapis.com"
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "artifactregistry.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
    )
    
    for api in "${APIS[@]}"; do
        print_status "Enabling $api..."
        gcloud services enable "$api"
    done
    
    print_success "All required APIs enabled"
}

# Function to set up Artifact Registry
setup_artifact_registry() {
    print_status "Setting up Artifact Registry..."
    
    read -p "Enter the region for Artifact Registry (default: us-central1): " REGION
    REGION=${REGION:-us-central1}
    
    # Create repository if it doesn't exist
    if ! gcloud artifacts repositories describe chatflow --location="$REGION" &>/dev/null; then
        print_status "Creating Artifact Registry repository..."
        gcloud artifacts repositories create chatflow \
            --repository-format=docker \
            --location="$REGION" \
            --description="ChatFlow Docker repository"
        print_success "Artifact Registry repository created"
    else
        print_success "Artifact Registry repository already exists"
    fi
    
    # Configure Docker authentication
    print_status "Configuring Docker authentication..."
    gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
    print_success "Docker authentication configured"
}

# Function to create terraform.tfvars
create_terraform_vars() {
    print_status "Creating terraform.tfvars file..."
    
    if [ -f "terraform/terraform.tfvars" ]; then
        print_warning "terraform.tfvars already exists. Backing up to terraform.tfvars.backup"
        cp terraform/terraform.tfvars terraform/terraform.tfvars.backup
    fi
    
    read -p "Enter JWT secret (leave empty to generate random): " JWT_SECRET
    if [ -z "$JWT_SECRET" ]; then
        JWT_SECRET=$(openssl rand -base64 32)
        print_status "Generated random JWT secret"
    fi
    
    read -p "Enter CORS origin (default: *): " CORS_ORIGIN
    CORS_ORIGIN=${CORS_ORIGIN:-*}
    
    read -p "Enter region (default: us-central1): " REGION
    REGION=${REGION:-us-central1}
    
    read -p "Enter Firestore location (default: us-central): " FIRESTORE_LOCATION
    FIRESTORE_LOCATION=${FIRESTORE_LOCATION:-us-central}
    
    # Create terraform.tfvars
    cat > terraform/terraform.tfvars << EOF
# GCP Configuration
project_id = "$PROJECT_ID"
region = "$REGION"
firestore_location = "$FIRESTORE_LOCATION"

# Security
jwt_secret = "$JWT_SECRET"

# Application Configuration
cors_origin = "$CORS_ORIGIN"
environment = "prod"

# Cloud Run Configuration
min_instances = 0
max_instances = 10
cpu_limit = "1000m"
memory_limit = "512Mi"
jwt_expires_in = "7d"
EOF
    
    print_success "terraform.tfvars created successfully"
}

# Function to display next steps
show_next_steps() {
    echo
    print_success "🎉 GCP setup completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Review and customize terraform/terraform.tfvars if needed"
    echo "2. Run the deployment script: ./scripts/deploy.sh"
    echo "3. Monitor your deployment in the GCP Console"
    echo
    echo "Useful commands:"
    echo "  - Deploy: ./scripts/deploy.sh"
    echo "  - Build only: ./scripts/deploy.sh --build-only"
    echo "  - Terraform only: ./scripts/deploy.sh --terraform-only"
    echo "  - View logs: gcloud run logs tail chatflow-backend --region=$REGION"
    echo
    print_status "Project ID: $PROJECT_ID"
    print_status "Region: $REGION"
    print_status "Artifact Registry: $REGION-docker.pkg.dev/$PROJECT_ID/chatflow"
}

# Main setup function
main() {
    echo "🛠️  ChatFlow GCP Setup Script"
    echo "============================="
    echo
    
    check_gcloud
    authenticate
    setup_project
    enable_apis
    setup_artifact_registry
    create_terraform_vars
    show_next_steps
}

# Handle script arguments
case "${1:-}" in
    --help)
        echo "Usage: $0 [options]"
        echo
        echo "This script sets up your GCP project for ChatFlow deployment."
        echo "It will:"
        echo "  - Authenticate with gcloud"
        echo "  - Set up or select a GCP project"
        echo "  - Enable required APIs"
        echo "  - Create Artifact Registry repository"
        echo "  - Generate terraform.tfvars file"
        echo
        echo "Options:"
        echo "  --help    Show this help message"
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac 