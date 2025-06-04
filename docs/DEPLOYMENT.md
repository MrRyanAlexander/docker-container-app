# Deployment Guide

This document provides comprehensive instructions for deploying the Container App to different environments using both automated CI/CD and manual deployment methods.

## Table of Contents

1. [Overview](#overview)
2. [Environments](#environments)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Manual Deployment](#manual-deployment)
5. [Environment Setup](#environment-setup)
6. [Troubleshooting](#troubleshooting)
7. [Security Considerations](#security-considerations)

## Overview

The Container App supports deployment to three environments:
- **Development**: For feature development and testing
- **Staging**: For pre-production validation
- **Production**: For live user access

Each environment has its own configuration, resource allocation, and security settings.

## Environments

### Development Environment
- **Namespace**: `container-app-dev`
- **Replicas**: 1
- **Resources**: 0.5 CPU, 512Mi RAM
- **Domain**: `dev.containerapp.com` (example)
- **Database**: Development PostgreSQL instance
- **Auth0**: Development tenant

### Staging Environment  
- **Namespace**: `container-app-staging`
- **Replicas**: 2
- **Resources**: 1 CPU, 1Gi RAM
- **Domain**: `staging.containerapp.com` (example)
- **Database**: Staging PostgreSQL instance
- **Auth0**: Staging tenant

### Production Environment
- **Namespace**: `container-app-prod`
- **Replicas**: 3
- **Resources**: 2 CPU, 2Gi RAM
- **Domain**: `containerapp.com` (example)
- **Database**: Production PostgreSQL cluster
- **Auth0**: Production tenant

## CI/CD Pipeline

The automated CI/CD pipeline is implemented using GitHub Actions and triggers on:
- **Push to `develop`**: Deploys to development
- **Push to `main`**: Deploys to staging, then production
- **Pull requests**: Runs tests but doesn't deploy

### Pipeline Stages

#### 1. Code Quality & Linting
```bash
# Runs automatically on all commits
- ESLint for JavaScript/TypeScript
- Prettier for code formatting
- TypeScript type checking
```

#### 2. Testing (67 Tests Total)
```bash
# Unit Tests (29 tests)
npm run test:unit

# Integration Tests (13 tests)  
npm run test:integration

# Simulation Tests (8 tests)
npm run test:simulation

# E2E Tests (17 tests)
npm run test:e2e

# Coverage Report
npm run test:coverage
```

#### 3. Security Scanning
```bash
# Dependency vulnerability scanning
npm audit --audit-level=moderate

# Static code analysis with CodeQL
# Container image vulnerability scanning with Trivy
```

#### 4. Docker Build & Test
```bash
# Build Docker image with caching
# Test container startup
# Push to GitHub Container Registry
# Image tagged with: branch name, commit SHA, latest
```

#### 5. Kubernetes Validation
```bash
# Validate manifests with kubeval
# Lint Helm charts (if available)
# Dry-run deployments
```

#### 6. Deployment
```bash
# Development: automatic on develop branch
# Staging: automatic on main branch
# Production: manual approval required
```

### Required GitHub Secrets

Set up the following secrets in your GitHub repository:

```bash
# Container Registry
REGISTRY_USERNAME=your-username
REGISTRY_PASSWORD=your-token

# Kubernetes Access
KUBE_CONFIG_DATA=base64-encoded-kubeconfig

# Database
DATABASE_URL_DEV=postgresql://...
DATABASE_URL_STAGING=postgresql://...
DATABASE_URL_PROD=postgresql://...

# Auth0
AUTH0_SECRET=your-auth0-secret
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com

# Optional: Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
SNYK_TOKEN=your-snyk-token
```

## Manual Deployment

Use the deployment script for manual deployments:

### Basic Usage

```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to staging with dry-run
./scripts/deploy.sh staging --dry-run

# Deploy to production (skip migrations)
./scripts/deploy.sh production --no-migration

# Force deploy (skip context validation)
./scripts/deploy.sh staging --force
```

### Script Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Show what would be deployed without making changes |
| `--no-migration` | Skip database migrations |
| `--force` | Override safety checks and warnings |
| `--help` | Show usage information |

### Prerequisites

Ensure you have the following tools installed:

```bash
# Required tools
kubectl >= 1.25
helm >= 3.10
docker >= 20.10

# Verify installations
kubectl version --client
helm version
docker --version
```

### Context Setup

Configure kubectl context for each environment:

```bash
# Development
kubectl config set-context dev-cluster --cluster=dev --user=dev-user --namespace=container-app-dev

# Staging  
kubectl config set-context staging-cluster --cluster=staging --user=staging-user --namespace=container-app-staging

# Production
kubectl config set-context prod-cluster --cluster=prod --user=prod-user --namespace=container-app-prod

# Switch context
kubectl config use-context dev-cluster
```

## Environment Setup

### 1. Kubernetes Cluster Setup

#### Development Cluster
```bash
# Minimal cluster for development
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: container-app-dev
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: container-app-dev
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 4Gi
    limits.cpu: "4" 
    limits.memory: 8Gi
    count/pods: "10"
EOF
```

#### Production Cluster
```bash
# Production-ready cluster with monitoring and security
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: container-app-prod
  labels:
    name: production
    monitoring: enabled
    security: enforced
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: container-app-prod
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: prod-quota
  namespace: container-app-prod
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    count/pods: "50"
EOF
```

### 2. Database Setup

#### PostgreSQL for Each Environment

```bash
# Development
helm install postgresql bitnami/postgresql \
  --namespace container-app-dev \
  --set auth.postgresPassword=dev-password \
  --set primary.persistence.size=10Gi

# Staging
helm install postgresql bitnami/postgresql \
  --namespace container-app-staging \
  --set auth.postgresPassword=staging-password \
  --set primary.persistence.size=50Gi \
  --set metrics.enabled=true

# Production
helm install postgresql bitnami/postgresql \
  --namespace container-app-prod \
  --set auth.postgresPassword=prod-password \
  --set primary.persistence.size=100Gi \
  --set metrics.enabled=true \
  --set primary.resources.requests.memory=2Gi \
  --set primary.resources.requests.cpu=1000m
```

### 3. Secrets Management

```bash
# Create secrets for each environment
kubectl create secret generic app-secrets \
  --namespace=container-app-dev \
  --from-literal=database-url="postgresql://postgres:dev-password@postgresql:5432/postgres" \
  --from-literal=auth0-secret="your-dev-auth0-secret" \
  --from-literal=auth0-client-id="your-dev-client-id" \
  --from-literal=auth0-client-secret="your-dev-client-secret"

# Repeat for staging and production with appropriate values
```

### 4. Ingress and SSL

```bash
# Install Traefik (if not using cloud load balancer)
helm repo add traefik https://helm.traefik.io/traefik
helm install traefik traefik/traefik \
  --namespace=traefik-system \
  --create-namespace \
  --set additionalArguments="{--certificatesresolvers.letsencrypt.acme.email=admin@example.com,--certificatesresolvers.letsencrypt.acme.storage=/data/acme.json,--certificatesresolvers.letsencrypt.acme.caserver=https://acme-v02.api.letsencrypt.org/directory,--certificatesresolvers.letsencrypt.acme.httpchallenge=true,--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web}"
```

## Troubleshooting

### Common Deployment Issues

#### 1. Image Pull Errors
```bash
# Check image exists
docker pull ghcr.io/your-org/container-app:latest

# Verify registry credentials
kubectl get secret regcred -o yaml

# Debug pod
kubectl describe pod -l app=container-app -n container-app-dev
```

#### 2. Database Connection Issues
```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15 --restart=Never -- psql "postgresql://user:pass@host:5432/db"

# Check service DNS
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup postgresql.container-app-dev.svc.cluster.local
```

#### 3. Health Check Failures
```bash
# Check application logs
kubectl logs deployment/container-app -n container-app-dev --tail=100

# Test health endpoint directly
kubectl port-forward service/container-app 8080:80 -n container-app-dev
curl http://localhost:8080/api/health-check
```

#### 4. Resource Constraints
```bash
# Check resource usage
kubectl top pods -n container-app-dev
kubectl describe nodes

# Check resource quotas
kubectl describe resourcequota -n container-app-dev
```

### Rollback Procedures

#### Helm Rollback
```bash
# List releases
helm list -n container-app-prod

# Rollback to previous version
helm rollback container-app -n container-app-prod

# Rollback to specific revision
helm rollback container-app 2 -n container-app-prod
```

#### kubectl Rollback
```bash
# Check rollout history
kubectl rollout history deployment/container-app -n container-app-prod

# Rollback to previous version
kubectl rollout undo deployment/container-app -n container-app-prod

# Rollback to specific revision
kubectl rollout undo deployment/container-app --to-revision=2 -n container-app-prod
```

## Security Considerations

### 1. Image Security
- All images are scanned with Trivy for vulnerabilities
- Base images are updated regularly
- Multi-stage builds minimize attack surface
- Non-root user in containers

### 2. Network Security
- Network policies restrict inter-pod communication
- TLS termination at ingress level
- Private container registry
- Secrets stored in Kubernetes secrets (not environment variables)

### 3. Access Control
- RBAC policies for service accounts
- Separate namespaces for environment isolation
- Least privilege principle
- Regular security audits

### 4. Monitoring and Logging
- Centralized logging with structured format
- Security event monitoring
- Resource usage monitoring
- Automated alerting for anomalies

### 5. Data Protection
- Database encryption at rest
- Backup encryption
- Regular security patches
- GDPR compliance measures

## Performance Optimization

### 1. Resource Tuning
```yaml
# Recommended resource limits
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

### 2. Horizontal Pod Autoscaling
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: container-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: container-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 3. Database Optimization
- Connection pooling
- Read replicas for read-heavy workloads
- Regular VACUUM and ANALYZE
- Query performance monitoring

## Monitoring and Alerting

### Key Metrics to Monitor
- Application response times
- Error rates
- CPU and memory usage
- Database connection pool status
- Container restart counts
- Network throughput

### Recommended Alerts
- High error rate (>5% in 5 minutes)
- High response time (>2s average)
- Pod restart loops
- Resource exhaustion
- Database connection failures
- SSL certificate expiration

---

For additional support, check the main [README.md](../README.md) or contact the development team. 