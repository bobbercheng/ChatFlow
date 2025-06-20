#!/bin/bash

# ChatFlow GCP Destroy Script
# This script destroys the GCP infrastructure created by Terraform

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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install it from https://terraform.io/downloads"
        exit 1
    fi
    
    if [ ! -f "terraform/terraform.tfvars" ]; then
        print_error "terraform/terraform.tfvars not found. Cannot proceed with destruction."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to show warning and get confirmation
get_confirmation() {
    echo
    print_warning "⚠️  WARNING: This will destroy ALL ChatFlow infrastructure in GCP!"
    print_warning "This includes:"
    echo "  - Cloud Run service"
    echo "  - Firestore database (and ALL data)"
    echo "  - Pub/Sub topics and subscriptions"
    echo "  - Artifact Registry repository"
    echo "  - Service accounts and IAM bindings"
    echo
    
    # Get project ID from terraform.tfvars
    PROJECT_ID=$(grep '^project_id' terraform/terraform.tfvars | sed 's/project_id[[:space:]]*=[[:space:]]*"\([^"]*\)"/\1/')
    
    if [ -n "$PROJECT_ID" ]; then
        print_status "Project: $PROJECT_ID"
    fi
    
    echo
    print_error "THIS ACTION CANNOT BE UNDONE!"
    echo
    
    read -p "Are you sure you want to destroy all resources? Type 'yes' to confirm: " CONFIRMATION
    
    if [ "$CONFIRMATION" != "yes" ]; then
        print_warning "Destruction cancelled by user"
        exit 0
    fi
    
    echo
    read -p "Please type the project ID to confirm: " CONFIRMED_PROJECT_ID
    
    if [ "$CONFIRMED_PROJECT_ID" != "$PROJECT_ID" ]; then
        print_error "Project ID confirmation failed. Destruction cancelled."
        exit 1
    fi
    
    print_warning "Proceeding with destruction in 10 seconds... (Ctrl+C to cancel)"
    sleep 10
}

# Function to destroy infrastructure
destroy_infrastructure() {
    print_status "Destroying infrastructure with Terraform..."
    
    cd terraform
    
    # Initialize Terraform (in case it's not initialized)
    print_status "Initializing Terraform..."
    terraform init
    
    # Show what will be destroyed
    print_status "Planning destruction..."
    terraform plan -destroy
    
    echo
    read -p "Do you want to proceed with the destruction? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Destruction cancelled by user"
        exit 0
    fi
    
    # Destroy the infrastructure
    print_status "Destroying infrastructure..."
    terraform destroy -auto-approve
    
    if [ $? -ne 0 ]; then
        print_error "Terraform destroy failed"
        exit 1
    fi
    
    cd ..
    print_success "Infrastructure destroyed successfully!"
}

# Function to clean up local files (optional)
cleanup_local() {
    echo
    read -p "Do you want to clean up local Terraform state files? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up local Terraform files..."
        rm -rf terraform/.terraform
        rm -f terraform/terraform.tfstate*
        rm -f terraform/.terraform.lock.hcl
        print_success "Local Terraform files cleaned up"
    fi
    
    echo
    read -p "Do you want to remove terraform.tfvars? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "terraform/terraform.tfvars" ]; then
            mv terraform/terraform.tfvars terraform/terraform.tfvars.destroyed
            print_success "terraform.tfvars moved to terraform.tfvars.destroyed"
        fi
    fi
}

# Function to show final status
show_final_status() {
    echo
    print_success "🗑️  Destruction completed!"
    echo
    echo "What was destroyed:"
    echo "  ✅ Cloud Run service"
    echo "  ✅ Firestore database"
    echo "  ✅ Pub/Sub topics and subscriptions"
    echo "  ✅ Artifact Registry repository"
    echo "  ✅ Service accounts and IAM bindings"
    echo
    print_warning "Note: Your GCP project still exists. You may want to delete it manually if no longer needed."
    echo
    echo "To recreate the infrastructure:"
    echo "  1. Run: ./scripts/setup-gcp.sh"
    echo "  2. Run: ./scripts/deploy.sh"
}

# Main destruction function
main() {
    echo "🗑️  ChatFlow GCP Destroy Script"
    echo "==============================="
    echo
    
    check_prerequisites
    get_confirmation
    destroy_infrastructure
    cleanup_local
    show_final_status
}

# Handle script arguments
case "${1:-}" in
    --help)
        echo "Usage: $0 [options]"
        echo
        echo "This script destroys all ChatFlow infrastructure in GCP."
        echo
        echo "⚠️  WARNING: This will permanently delete all data!"
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