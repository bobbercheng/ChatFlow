# ChatFlow Terraform Configuration

This directory contains Terraform configuration files for deploying ChatFlow to Google Cloud Platform (GCP) with Cloud Run, Firestore, and Pub/Sub.

## Prerequisites

1. **Terraform** (>= 1.0): [Install Terraform](https://terraform.io/downloads)
2. **Google Cloud SDK**: [Install gcloud](https://cloud.google.com/sdk/docs/install)
3. **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
4. **GCP Project** with billing enabled

## Quick Start

### 1. Initial Setup
Run the setup script to configure your GCP project:
```bash
./scripts/setup-gcp.sh
```

This will:
- Authenticate with gcloud
- Set up or select a GCP project
- Enable required APIs
- Create Artifact Registry repository
- Generate `terraform.tfvars` file

### 2. Deploy
Deploy your application:
```bash
./scripts/deploy.sh
```

This will:
- Build and push Docker image to Artifact Registry
- Deploy infrastructure with Terraform
- Test the health endpoint

### 3. Destroy (when needed)
To clean up all resources:
```bash
./scripts/destroy.sh
```

⚠️ **Warning**: This will permanently delete all data!

## Files Overview

- **`main.tf`**: Main Terraform configuration
- **`variables.tf`**: Variable definitions
- **`outputs.tf`**: Output values after deployment
- **`terraform.tfvars.example`**: Example variables file
- **`terraform.tfvars`**: Your actual variables (created by setup script, ignored by git)

## Configuration

### Required Variables

- **`project_id`**: Your GCP project ID
- **`jwt_secret`**: Secret key for JWT tokens

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `region` | `us-central1` | GCP region for resources |
| `firestore_location` | `us-central` | Firestore database location |
| `min_instances` | `0` | Minimum Cloud Run instances |
| `max_instances` | `10` | Maximum Cloud Run instances |
| `cpu_limit` | `1000m` | CPU limit per container |
| `memory_limit` | `512Mi` | Memory limit per container |
| `cors_origin` | `*` | CORS origin for frontend |
| `jwt_expires_in` | `7d` | JWT token expiration |

## Manual Deployment

If you prefer to run Terraform manually:

### 1. Initialize
```bash
cd terraform
terraform init
```

### 2. Plan
```bash
terraform plan
```

### 3. Apply
```bash
terraform apply
```

### 4. Get Outputs
```bash
terraform output
```

## Resources Created

This Terraform configuration creates:

### Compute & Storage
- **Cloud Run service**: Hosts the backend API
- **Firestore database**: NoSQL database for application data
- **Artifact Registry**: Stores Docker images

### Messaging
- **Pub/Sub topic**: `chatflow-events` for real-time messaging
- **Pub/Sub subscription**: `chatflow-events-subscription`
- **Dead letter topic**: For failed message handling

### Security & Access
- **Service Account**: For Cloud Run with minimal required permissions
- **IAM bindings**: Firestore, Pub/Sub, logging, and monitoring access

### Monitoring
- **Health checks**: Built-in liveness and startup probes
- **Logging**: Automatic log collection
- **Monitoring**: Metrics collection

## Environment Variables

The Cloud Run service is configured with these environment variables:

- `NODE_ENV=production`
- `PORT=3002`
- `GOOGLE_CLOUD_PROJECT`: Your project ID
- `USE_FIRESTORE=true`
- `USE_PUBSUB=true`
- `JWT_SECRET`: From terraform.tfvars
- `JWT_EXPIRES_IN`: Token expiration time
- `CORS_ORIGIN`: Frontend origin

## Troubleshooting

### Common Issues

**1. Docker build fails**
```bash
# Check if you're in the root directory
pwd
# Should show: /path/to/ChatFlow

# Build manually to see detailed errors
docker build -f backend/Dockerfile -t test .
```

**2. Authentication errors**
```bash
# Re-authenticate with gcloud
gcloud auth login

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

**3. Terraform state issues**
```bash
# Reinitialize Terraform
rm -rf .terraform terraform.tfstate*
terraform init
```

**4. Resource conflicts**
```bash
# Import existing resources (example for Firestore)
terraform import google_firestore_database.chatflow_db "(default)"
```

### Viewing Logs

```bash
# Cloud Run logs
gcloud run logs tail chatflow-backend --region=us-central1

# Real-time logs
gcloud run logs tail chatflow-backend --region=us-central1 --follow
```

### Accessing Services

After deployment, you can access:

- **API Endpoint**: Use the `cloud_run_url` output
- **Firestore Console**: [GCP Console > Firestore](https://console.cloud.google.com/firestore)
- **Pub/Sub Console**: [GCP Console > Pub/Sub](https://console.cloud.google.com/cloudpubsub)
- **Cloud Run Console**: [GCP Console > Cloud Run](https://console.cloud.google.com/run)

## Git Configuration

The following Terraform files are automatically ignored by git for security:

- **State files**: `*.tfstate`, `*.tfstate.*` (contain sensitive data)
- **Lock file**: `.terraform.lock.hcl` (platform-specific)
- **Variables**: `terraform.tfvars` (contains secrets)
- **Terraform directory**: `.terraform/` (local cache)
- **Plan files**: `*.tfplan` (may contain sensitive data)

### Creating terraform.tfvars

If the setup script doesn't work, manually create `terraform.tfvars`:

```bash
# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vi terraform.tfvars
```

Required values:
```hcl
project_id = "your-gcp-project-id"
jwt_secret = "your-secure-random-secret"
```

## Security Notes

1. **JWT Secret**: Use a strong, random secret in production
2. **CORS Origin**: Set to your actual frontend domain in production
3. **Service Account**: Uses minimal required permissions
4. **Public Access**: The API is publicly accessible (adjust IAM if needed)
5. **Sensitive Files**: Never commit `terraform.tfvars` or state files to git

## Cost Optimization

- **Cloud Run**: Scales to zero when not in use
- **Firestore**: Pay per read/write operation
- **Pub/Sub**: Pay per message
- **Artifact Registry**: Minimal storage cost for Docker images

For production, consider:
- Setting `min_instances = 1` to reduce cold starts
- Using Cloud Armor for DDoS protection
- Implementing request quotas and rate limiting 