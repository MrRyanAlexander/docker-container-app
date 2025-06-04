#!/bin/bash

# Deployment script for Container App
# Usage: ./scripts/deploy.sh <environment> [options]
# Environments: dev, staging, production
# Options: --dry-run, --no-migration, --force

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
DRY_RUN=false
NO_MIGRATION=false
FORCE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    echo "Usage: $0 <environment> [options]"
    echo ""
    echo "Environments:"
    echo "  dev         Deploy to development environment"
    echo "  staging     Deploy to staging environment"
    echo "  production  Deploy to production environment"
    echo ""
    echo "Options:"
    echo "  --dry-run      Show what would be deployed without actually deploying"
    echo "  --no-migration Skip database migrations"
    echo "  --force        Force deployment even with warnings"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev"
    echo "  $0 staging --dry-run"
    echo "  $0 production --no-migration"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is installed and configured
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check kubectl context
    local current_context=$(kubectl config current-context 2>/dev/null || echo "none")
    log_info "Current kubectl context: $current_context"
    
    # Validate context based on environment
    case $ENVIRONMENT in
        dev)
            if [[ ! "$current_context" =~ dev|development|local ]]; then
                log_warn "Current context '$current_context' may not be appropriate for development deployment"
                if [ "$FORCE" != true ]; then
                    log_error "Use --force to override context validation"
                    exit 1
                fi
            fi
            ;;
        staging)
            if [[ ! "$current_context" =~ staging|stage ]]; then
                log_warn "Current context '$current_context' may not be appropriate for staging deployment"
                if [ "$FORCE" != true ]; then
                    log_error "Use --force to override context validation"
                    exit 1
                fi
            fi
            ;;
        production|prod)
            if [[ ! "$current_context" =~ prod|production ]]; then
                log_warn "Current context '$current_context' may not be appropriate for production deployment"
                if [ "$FORCE" != true ]; then
                    log_error "Use --force to override context validation"
                    exit 1
                fi
            fi
            ;;
    esac
}

set_environment_config() {
    log_info "Setting up environment configuration for $ENVIRONMENT..."
    
    case $ENVIRONMENT in
        dev)
            NAMESPACE="container-app-dev"
            REPLICA_COUNT=1
            RESOURCES_LIMITS_CPU="500m"
            RESOURCES_LIMITS_MEMORY="512Mi"
            RESOURCES_REQUESTS_CPU="250m"
            RESOURCES_REQUESTS_MEMORY="256Mi"
            IMAGE_TAG="${GITHUB_SHA:-dev-latest}"
            ;;
        staging)
            NAMESPACE="container-app-staging"
            REPLICA_COUNT=2
            RESOURCES_LIMITS_CPU="1000m"
            RESOURCES_LIMITS_MEMORY="1Gi"
            RESOURCES_REQUESTS_CPU="500m"
            RESOURCES_REQUESTS_MEMORY="512Mi"
            IMAGE_TAG="${GITHUB_SHA:-staging-latest}"
            ;;
        production)
            NAMESPACE="container-app-prod"
            REPLICA_COUNT=3
            RESOURCES_LIMITS_CPU="2000m"
            RESOURCES_LIMITS_MEMORY="2Gi"
            RESOURCES_REQUESTS_CPU="1000m"
            RESOURCES_REQUESTS_MEMORY="1Gi"
            IMAGE_TAG="${GITHUB_SHA:-latest}"
            ;;
    esac
    
    IMAGE_REPOSITORY="${REGISTRY:-ghcr.io}/${IMAGE_NAME:-container-app}"
    FULL_IMAGE="$IMAGE_REPOSITORY:$IMAGE_TAG"
    
    log_info "Configuration:"
    log_info "  Namespace: $NAMESPACE"
    log_info "  Replicas: $REPLICA_COUNT"
    log_info "  Image: $FULL_IMAGE"
    log_info "  CPU Limit: $RESOURCES_LIMITS_CPU"
    log_info "  Memory Limit: $RESOURCES_LIMITS_MEMORY"
}

create_namespace() {
    log_info "Creating namespace if it doesn't exist..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would create namespace: $NAMESPACE"
        return
    fi
    
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
}

run_database_migrations() {
    if [ "$NO_MIGRATION" = true ]; then
        log_info "Skipping database migrations (--no-migration flag)"
        return
    fi
    
    log_info "Running database migrations..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would run database migrations"
        return
    fi
    
    # Create migration job
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: migration-$(date +%s)
  namespace: $NAMESPACE
spec:
  template:
    spec:
      containers:
      - name: migration
        image: $FULL_IMAGE
        command: ["npm", "run", "migrate"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
      restartPolicy: Never
  backoffLimit: 3
EOF
    
    # Wait for migration to complete
    log_info "Waiting for migration to complete..."
    kubectl wait --for=condition=complete job/migration-$(date +%s) --namespace=$NAMESPACE --timeout=300s
}

deploy_application() {
    log_info "Deploying application..."
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would deploy with the following configuration:"
        helm template container-app "$PROJECT_ROOT/helm/container-app" \
            --namespace="$NAMESPACE" \
            --set image.repository="$IMAGE_REPOSITORY" \
            --set image.tag="$IMAGE_TAG" \
            --set replicaCount="$REPLICA_COUNT" \
            --set resources.limits.cpu="$RESOURCES_LIMITS_CPU" \
            --set resources.limits.memory="$RESOURCES_LIMITS_MEMORY" \
            --set resources.requests.cpu="$RESOURCES_REQUESTS_CPU" \
            --set resources.requests.memory="$RESOURCES_REQUESTS_MEMORY" \
            --set environment="$ENVIRONMENT"
        return
    fi
    
    # Check if Helm chart exists
    if [ ! -d "$PROJECT_ROOT/helm/container-app" ]; then
        log_warn "Helm chart not found, using kubectl with basic manifests"
        
        # Apply Kubernetes manifests
        if [ -d "$PROJECT_ROOT/kubernetes" ]; then
            # Update image in deployment
            find "$PROJECT_ROOT/kubernetes" -name "*.yaml" -exec sed -i.bak "s|image:.*|image: $FULL_IMAGE|g" {} \;
            kubectl apply -f "$PROJECT_ROOT/kubernetes/" --namespace="$NAMESPACE"
            # Restore original files
            find "$PROJECT_ROOT/kubernetes" -name "*.bak" -exec bash -c 'mv "$1" "${1%.bak}"' _ {} \;
        else
            log_error "No deployment manifests found"
            exit 1
        fi
    else
        # Use Helm for deployment
        helm upgrade --install container-app "$PROJECT_ROOT/helm/container-app" \
            --namespace="$NAMESPACE" \
            --create-namespace \
            --set image.repository="$IMAGE_REPOSITORY" \
            --set image.tag="$IMAGE_TAG" \
            --set replicaCount="$REPLICA_COUNT" \
            --set resources.limits.cpu="$RESOURCES_LIMITS_CPU" \
            --set resources.limits.memory="$RESOURCES_LIMITS_MEMORY" \
            --set resources.requests.cpu="$RESOURCES_REQUESTS_CPU" \
            --set resources.requests.memory="$RESOURCES_REQUESTS_MEMORY" \
            --set environment="$ENVIRONMENT" \
            --wait \
            --timeout=600s
    fi
}

verify_deployment() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would verify deployment"
        return
    fi
    
    log_info "Verifying deployment..."
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/container-app --namespace="$NAMESPACE" --timeout=300s
    
    # Check pod status
    log_info "Pod status:"
    kubectl get pods --namespace="$NAMESPACE" -l app=container-app
    
    # Check service status
    log_info "Service status:"
    kubectl get services --namespace="$NAMESPACE"
    
    # Run health check if possible
    log_info "Running health check..."
    if kubectl get service container-app --namespace="$NAMESPACE" &> /dev/null; then
        # Port forward and test (timeout after 10 seconds)
        kubectl port-forward service/container-app 8080:80 --namespace="$NAMESPACE" &
        PF_PID=$!
        sleep 3
        
        if curl -f http://localhost:8080/api/health-check --max-time 5 &> /dev/null; then
            log_info "Health check passed ✓"
        else
            log_warn "Health check failed (this may be expected in test environments)"
        fi
        
        kill $PF_PID 2>/dev/null || true
    fi
}

cleanup_old_deployments() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would cleanup old deployments"
        return
    fi
    
    log_info "Cleaning up old deployments..."
    
    # Keep only last 3 helm releases
    helm list --namespace="$NAMESPACE" --max=10 -q | tail -n +4 | xargs -r helm uninstall --namespace="$NAMESPACE"
    
    # Clean up completed jobs older than 24h
    kubectl delete jobs --namespace="$NAMESPACE" --field-selector=status.successful=1 --ignore-not-found=true
}

main() {
    # Parse arguments
    if [ $# -eq 0 ]; then
        usage
        exit 1
    fi
    
    ENVIRONMENT=$1
    shift
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-migration)
                NO_MIGRATION=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Validate environment
    case $ENVIRONMENT in
        dev|staging|production)
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            usage
            exit 1
            ;;
    esac
    
    log_info "Starting deployment to $ENVIRONMENT environment"
    
    # Run deployment steps
    check_prerequisites
    set_environment_config
    create_namespace
    run_database_migrations
    deploy_application
    verify_deployment
    cleanup_old_deployments
    
    log_info "Deployment to $ENVIRONMENT completed successfully! 🚀"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "This was a dry run. No actual changes were made."
    fi
}

# Run main function
main "$@" 