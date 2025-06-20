# ChatFlow GCP Deployment Guide

Deploy your ChatFlow application to Google Cloud Platform using Terraform for infrastructure as code and Cloud Run for serverless container hosting.

## 🏗️ Architecture Overview

Your deployment will create:

- **Cloud Run**: Serverless container hosting for the backend API
- **Firestore**: NoSQL database for storing users, conversations, and messages
- **Firestore Indexes**: Optimized composite indexes for fast query performance
- **Pub/Sub**: Real-time messaging infrastructure
- **Artifact Registry**: Private Docker image repository
- **Service Account**: Minimal permissions for security

## 📋 Prerequisites

### Required Tools
1. **[Google Cloud SDK](https://cloud.google.com/sdk/docs/install)** (gcloud CLI)
2. **[Terraform](https://terraform.io/downloads)** (>= 1.0)
3. **[Docker](https://docs.docker.com/get-docker/)**
4. **Node.js 18+** and **npm**

### GCP Requirements
1. **GCP Account** with billing enabled
2. **Project Owner** or **Editor** permissions
3. **APIs** will be enabled automatically by the setup script

## 🚀 Quick Start (Recommended)

### Step 1: Initial Setup
```bash
# Run the interactive setup script
./scripts/setup-gcp.sh
```

This script will guide you through:
- Authenticating with Google Cloud
- Creating or selecting a GCP project
- Enabling required APIs
- Setting up Artifact Registry
- Generating configuration files

### Step 2: Deploy
```bash
# Deploy everything (build + infrastructure)
./scripts/deploy.sh
```

This will:
- Build your Docker image
- Push to Artifact Registry
- Deploy infrastructure with Terraform
- Test the health endpoint

### Step 3: Verify Deployment
After deployment completes, you'll see output like:
```
cloud_run_url = "https://chatflow-backend-xxx-uc.a.run.app"
```

Test your API:
```bash
curl https://your-cloud-run-url/health
```

## 🔧 Manual Setup (Advanced)

If you prefer manual control over the setup process:

### 1. Authenticate with Google Cloud
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required APIs
```bash
gcloud services enable \
  firestore.googleapis.com \
  pubsub.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### 3. Create Artifact Registry Repository
```bash
gcloud artifacts repositories create chatflow \
  --repository-format=docker \
  --location=us-central1 \
  --description="ChatFlow Docker repository"
```

### 4. Configure Docker Authentication
```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 5. Create Configuration File
```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
# Edit terraform/terraform.tfvars with your values
```

### 6. Deploy
```bash
./scripts/deploy.sh
```

## 📝 Configuration

### Required Variables (terraform/terraform.tfvars)

```hcl
# Your GCP project ID
project_id = "your-gcp-project-id"

# Strong JWT secret for authentication
jwt_secret = "your-super-secret-jwt-key-change-this-in-production"
```

### Optional Variables

```hcl
# GCP Configuration
region            = "us-central1"     # GCP region
firestore_location = "us-central"     # Firestore location
environment       = "prod"           # Environment name

# Cloud Run Configuration
min_instances = 0                     # Minimum instances (0 = scale to zero)
max_instances = 10                    # Maximum instances
cpu_limit     = "1000m"              # CPU limit (1000m = 1 vCPU)
memory_limit  = "512Mi"              # Memory limit

# Application Configuration
jwt_expires_in = "7d"                # JWT token expiration
cors_origin    = "*"                 # CORS origin (set to your frontend domain)
```

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `npm run gcp:setup` | Run interactive GCP setup |
| `npm run deploy` | Full deployment (build + deploy) |
| `npm run deploy:build` | Build and push Docker image only |
| `npm run deploy:terraform` | Deploy infrastructure only |
| `npm run destroy` | Destroy all GCP resources |

## 📊 Monitoring and Management

### View Logs
```bash
# Real-time logs
gcloud run logs tail chatflow-backend --region=us-central1 --follow

# Recent logs
gcloud run logs tail chatflow-backend --region=us-central1
```

### Manage Services
```bash
# List Cloud Run services
gcloud run services list

# Update service (after code changes)
./scripts/deploy.sh

# Scale service
gcloud run services update chatflow-backend \
  --min-instances=1 \
  --max-instances=20 \
  --region=us-central1
```

### Access Google Cloud Console
- **Cloud Run**: https://console.cloud.google.com/run
- **Firestore**: https://console.cloud.google.com/firestore
- **Pub/Sub**: https://console.cloud.google.com/cloudpubsub
- **Artifact Registry**: https://console.cloud.google.com/artifacts

## 🔐 Security Best Practices

### 1. JWT Secret
- Use a strong, random secret (32+ characters)
- Generated automatically by setup script
- Never commit to version control

### 2. CORS Configuration
```hcl
# Production: Set to your actual frontend domain
cors_origin = "https://your-frontend-domain.com"

# Development: Allow all origins
cors_origin = "*"
```

### 3. Service Account Permissions
The deployment creates a service account with minimal required permissions:
- `roles/datastore.user` - Firestore read/write
- `roles/pubsub.editor` - Pub/Sub publish/subscribe
- `roles/logging.logWriter` - Write logs
- `roles/monitoring.metricWriter` - Write metrics

### 4. Network Security
- Cloud Run service is publicly accessible
- Add Cloud Armor for DDoS protection if needed
- Implement rate limiting in your application

## 💰 Cost Optimization

### Cloud Run Pricing
- **CPU/Memory**: Pay only when processing requests
- **Requests**: $0.40 per million requests
- **Scale to Zero**: No charges when idle

### Optimize Costs
```hcl
# Minimize cold starts (small cost increase)
min_instances = 1

# Right-size resources
cpu_limit    = "1000m"  # Adjust based on load
memory_limit = "512Mi"  # Start small, increase if needed
```

### Firestore Pricing
- **Reads**: $0.06 per 100,000 documents
- **Writes**: $0.18 per 100,000 documents
- **Storage**: $0.18/GiB/month
- **Indexes**: Minimal additional storage cost (~$0.18/GiB/month)

### Pub/Sub Pricing
- **Messages**: $40 per TiB of data

## 🐛 Troubleshooting

### Common Issues

**1. Authentication Errors**
```bash
# Re-authenticate
gcloud auth login
gcloud auth configure-docker us-central1-docker.pkg.dev
```

**2. Docker Build Fails**
```bash
# Check you're in the project root
pwd  # Should show: /path/to/ChatFlow

# Try building manually
docker build -f backend/Dockerfile -t test .
```

**3. Terraform State Issues**
```bash
cd terraform
rm -rf .terraform terraform.tfstate*
terraform init
```

**4. Cloud Run 404 Errors**
```bash
# Check service exists
gcloud run services list --region=us-central1

# Check logs for startup errors
gcloud run logs tail chatflow-backend --region=us-central1
```

**5. Firestore Permission Errors**
```bash
# Verify service account has correct roles
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

### Health Check Endpoint

Test your deployment:
```bash
# Health check
curl https://your-cloud-run-url/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "firestore": "connected",
    "pubsub": "connected"
  }
}
```

### Debug Service Issues

```bash
# Get service details
gcloud run services describe chatflow-backend --region=us-central1

# Check revisions
gcloud run revisions list --service=chatflow-backend --region=us-central1

# View detailed logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=chatflow-backend" --limit=50
```

## 🔄 Updates and Maintenance

### Deploy Code Changes
```bash
# Full redeploy (recommended)
./scripts/deploy.sh

# Or just rebuild and push image
./scripts/deploy.sh --build-only
```

### Update Configuration
```bash
# Edit terraform/terraform.tfvars
# Then apply changes
./scripts/deploy.sh --terraform-only
```

### Database Migrations
Firestore is schema-less, but for structure changes:
1. Update your backend code to handle both old and new formats
2. Deploy the updated code
3. Run data migration scripts if needed

## 🗑️ Cleanup

### Destroy All Resources
```bash
./scripts/destroy.sh
```

⚠️ **Warning**: This permanently deletes:
- All Firestore data
- Pub/Sub messages
- Docker images
- Cloud Run service

### Partial Cleanup
```bash
# Stop Cloud Run service only
gcloud run services delete chatflow-backend --region=us-central1

# Clean up unused Docker images
gcloud artifacts docker images list us-central1-docker.pkg.dev/PROJECT_ID/chatflow/backend
gcloud artifacts docker images delete IMAGE_URL
```

## 📈 Scaling for Production

### Performance Tuning
```hcl
# Reduce cold starts
min_instances = 1

# Handle more traffic
max_instances = 50
cpu_limit     = "2000m"
memory_limit  = "1Gi"
```

### Multiple Environments
Create separate configurations:
```bash
# Development
cp terraform/terraform.tfvars terraform/terraform.dev.tfvars
# Edit for dev environment

# Deploy to dev
terraform apply -var-file="terraform.dev.tfvars"
```

### CI/CD Integration
Add to your CI pipeline:
```yaml
# Example GitHub Actions
- name: Deploy to GCP
  run: |
    echo "${{ secrets.GCP_SA_KEY }}" | gcloud auth activate-service-account --key-file=-
    ./scripts/deploy.sh --terraform-only
```

## 🆘 Getting Help

1. **Check logs first**: `gcloud run logs tail chatflow-backend --region=us-central1`
2. **Review Terraform outputs**: `cd terraform && terraform output`
3. **Verify API health**: `curl YOUR_CLOUD_RUN_URL/health`
4. **Check GCP Console** for service status and metrics

For more help, check the [Google Cloud Run documentation](https://cloud.google.com/run/docs) or [Terraform Google Provider docs](https://registry.terraform.io/providers/hashicorp/google/latest/docs). 