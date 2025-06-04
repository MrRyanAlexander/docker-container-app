# Per-User Containerized App

A modern, secure, and scalable web application where each authenticated user receives their own isolated Docker container environment.

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS
- **Authentication**: Auth0
- **Orchestration**: Kubernetes
- **Routing**: Traefik
- **Containerization**: Docker
- **Database**: PostgreSQL
- **Protection**: Cloudflare (for production)

## Features

- 🔐 Secure authentication with Auth0
- 🐳 Per-user isolated Docker containers
- 🚀 Modern Next.js frontend with server-side rendering
- ⚡ Fast development environment with hot reload
- 🔒 Enterprise-grade security headers and policies
- 📊 Resource management and monitoring
- 🌐 Production-ready with Kubernetes and Traefik

## Prerequisites

- Node.js 18+ (LTS recommended)
- Docker Desktop
- Docker Compose
- kubectl (for Kubernetes deployment)
- Helm (for Kubernetes deployment)

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd per-user-containerized-app
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Copy the example environment file
cp .env.example .env
```

Configure your environment variables:

```env
# Auth0 Configuration
AUTH0_SECRET=your-auth0-secret-key
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-domain.us.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret

# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=peruser
```

### 3. Start Development Environment

```bash
# Start all services with Docker Compose
docker-compose up -d

# Or start just the database and run frontend locally
docker-compose up -d db traefik
cd frontend && npm run dev
```

### 4. Access the Application

- **Main App**: http://localhost:3000
- **Traefik Dashboard**: http://localhost:8080
- **Database**: localhost:5432

## Development

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:3000 with hot reload enabled.

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

## Architecture

### Directory Structure

```
per-user-containerized-app/
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   └── lib/             # Utility functions
│   ├── public/              # Static assets
│   └── Dockerfile           # Frontend container
├── kubernetes/              # Kubernetes manifests
├── helm/                    # Helm charts
├── traefik/                 # Traefik configuration
├── docker-compose.yml       # Local development
└── plan.md                  # Detailed implementation plan
```

### Container Management

Each authenticated user receives:
- **Isolated container** with resource limits (0.5 CPU, 512Mi RAM)
- **Persistent storage** for user data
- **Automatic cleanup** after inactivity timeout
- **Secure networking** with no direct public access

## Security

- **Authentication**: Auth0 with JWT validation
- **Authorization**: User-specific container access
- **Network Isolation**: Kubernetes network policies
- **Resource Limits**: CPU and memory constraints
- **DDoS Protection**: Cloudflare + Traefik rate limiting
- **Security Headers**: OWASP recommended headers

## Production Deployment

### Kubernetes Deployment

```bash
# Deploy with Helm
helm install per-user-app ./helm/per-user-app

# Or use kubectl
kubectl apply -f kubernetes/
```

### Environment Requirements

- Kubernetes cluster (GKE, EKS, AKS)
- Traefik as ingress controller
- Cloudflare for DDoS protection
- Persistent storage (for user data)

## Monitoring and Observability

- **Logs**: Structured logging with correlation IDs
- **Metrics**: Prometheus integration
- **Dashboards**: Grafana dashboards
- **Alerts**: Alertmanager for critical issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support, please open an issue in the GitHub repository. 