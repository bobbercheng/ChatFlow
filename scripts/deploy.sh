#!/bin/bash

# ChatFlow GCP Deployment Script
# This script builds the Docker image, pushes it to Artifact Registry, and deploys using Terraform

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

# Function to check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if gcloud is installed and authenticated
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it from https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    # Check if terraform is installed
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install it from https://terraform.io/downloads"
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it from https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check if authenticated with gcloud
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_error "Not authenticated with gcloud. Please run 'gcloud auth login'"
        exit 1
    fi
    
    print_success "All prerequisites are met"
}

# Function to load configuration
load_config() {
    if [ ! -f "terraform/terraform.tfvars" ]; then
        print_error "terraform/terraform.tfvars not found. Please copy terraform/terraform.tfvars.example and update it with your values."
        exit 1
    fi
    
    # Extract project_id and region from terraform.tfvars
    PROJECT_ID=$(grep '^project_id' terraform/terraform.tfvars | sed 's/project_id[[:space:]]*=[[:space:]]*"\([^"]*\)"/\1/')
    REGION=$(grep '^region' terraform/terraform.tfvars | sed 's/region[[:space:]]*=[[:space:]]*"\([^"]*\)"/\1/' || echo "us-central1")
    
    if [ -z "$PROJECT_ID" ]; then
        print_error "Could not extract project_id from terraform.tfvars"
        exit 1
    fi
    
    print_status "Using project: $PROJECT_ID"
    print_status "Using region: $REGION"
    
    # Set gcloud project
    gcloud config set project "$PROJECT_ID"
}

# Function to configure Docker for Artifact Registry
configure_docker() {
    print_status "Configuring Docker for Artifact Registry..."
    gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
    print_success "Docker configured for Artifact Registry"
}

# Function to build and push Docker image
build_and_push_image() {
    print_status "Building Docker image..."
    
    # Build the image from the root directory using the backend Dockerfile
    docker build -f backend/Dockerfile -t "chatflow-backend:latest" .
    
    if [ $? -ne 0 ]; then
        print_error "Docker build failed"
        exit 1
    fi
    
    # Tag image for Artifact Registry
    IMAGE_URL="$REGION-docker.pkg.dev/$PROJECT_ID/chatflow/backend:latest"
    docker tag "chatflow-backend:latest" "$IMAGE_URL"
    
    print_success "Docker image built successfully"
    
    print_status "Pushing image to Artifact Registry..."
    docker push "$IMAGE_URL"
    
    if [ $? -ne 0 ]; then
        print_error "Docker push failed"
        exit 1
    fi
    
    print_success "Docker image pushed successfully to $IMAGE_URL"
}

# Function to deploy with Terraform
deploy_terraform() {
    print_status "Deploying infrastructure with Terraform..."
    
    cd terraform
    
    # Initialize Terraform
    print_status "Initializing Terraform..."
    terraform init
    
    # Plan the deployment
    print_status "Planning Terraform deployment..."
    terraform plan
    
    # Ask for confirmation
    echo
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Deployment cancelled by user"
        exit 0
    fi
    
    # Apply the deployment
    print_status "Applying Terraform configuration..."
    terraform apply -auto-approve
    
    if [ $? -ne 0 ]; then
        print_error "Terraform apply failed"
        exit 1
    fi
    
    # Get outputs
    print_status "Deployment completed! Here are the important URLs:"
    echo
    terraform output
    
    cd ..
    print_success "Infrastructure deployed successfully!"
}

# Function to run post-deployment tasks
post_deployment() {
    print_status "Running post-deployment tasks..."
    
    # Get the Cloud Run URL
    cd terraform
    CLOUD_RUN_URL=$(terraform output -raw cloud_run_url 2>/dev/null || echo "")
    cd ..
    
    if [ -n "$CLOUD_RUN_URL" ]; then
        print_status "Testing health endpoint..."
        sleep 30  # Wait for service to start
        
        if curl -f "$CLOUD_RUN_URL/health" > /dev/null 2>&1; then
            print_success "Health check passed! Your API is running at: $CLOUD_RUN_URL"
        else
            print_warning "Health check failed. The service might still be starting up."
            print_status "You can check the logs with: gcloud run logs tail chatflow-backend --region=$REGION"
        fi
    fi
    
    print_success "Deployment completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Update your frontend configuration to use the new API URL"
    echo "2. Monitor the service: gcloud run logs tail chatflow-backend --region=$REGION"
    echo "3. View metrics in Cloud Console: https://console.cloud.google.com/run"
}

# Main deployment function
main() {
    echo "🚀 ChatFlow GCP Deployment Script"
    echo "=================================="
    echo
    
    check_prerequisites
    load_config
    configure_docker
    build_and_push_image
    deploy_terraform
    post_deployment
}

# Handle script arguments
case "${1:-}" in
    --build-only)
        print_status "Building and pushing Docker image only..."
        check_prerequisites
        load_config
        configure_docker
        build_and_push_image
        ;;
    --terraform-only)
        print_status "Running Terraform deployment only..."
        check_prerequisites
        load_config
        deploy_terraform
        ;;
    --help)
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --build-only      Build and push Docker image only"
        echo "  --terraform-only  Run Terraform deployment only"
        echo "  --help           Show this help message"
        echo
        echo "Without options, runs full deployment pipeline"
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