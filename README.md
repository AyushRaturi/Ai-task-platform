# 🤖 AI Task Processing Platform

A production-ready MERN stack application for asynchronous AI text processing, deployed on Kubernetes with GitOps via Argo CD.

## 📋 Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Local Development](#local-development)
- [Docker](#docker)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Argo CD Setup](#argo-cd-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)

---

## Architecture

```
Frontend (React)  →  Backend API (Node/Express)  →  MongoDB
                              ↓
                        Redis Queue
                              ↓
                    Worker (Python) ×N
                              ↓
                         MongoDB (results)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details on scaling, indexing, and failure handling.

---

## Features

- ✅ JWT authentication (register / login)
- ✅ Create and manage text processing tasks
- ✅ Supported operations: `uppercase`, `lowercase`, `reverse`, `word_count`
- ✅ Real-time status polling (pending → running → success/failed)
- ✅ Execution logs per task
- ✅ Rerun failed tasks
- ✅ Paginated task list with status filtering
- ✅ Rate limiting, Helmet, bcrypt
- ✅ Multi-stage Dockerfiles with non-root users
- ✅ Kubernetes with HPA, probes, resource limits
- ✅ GitOps with Argo CD auto-sync
- ✅ GitHub Actions CI/CD

---

## Local Development

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker & Docker Compose

### Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/ai-task-platform.git
cd ai-task-platform

# 2. Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp worker/.env.example worker/.env

# 3. Edit .env with your values (or use defaults for local dev)

# 4. Start all services
docker compose up --build

# App is now running at http://localhost:3000
# API at http://localhost:5000
```

### Running Services Individually

```bash
# MongoDB & Redis only
docker compose up mongo redis -d

# Backend
cd backend
npm install
npm run dev

# Worker
cd worker
pip install -r requirements.txt
python worker.py

# Frontend
cd frontend
npm install
npm run dev
```

---

## Docker

### Build Images

```bash
# Backend
docker build -t atp-backend:local ./backend

# Frontend
docker build -t atp-frontend:local ./frontend

# Worker
docker build -t atp-worker:local ./worker
```

### Multi-stage build targets
Each Dockerfile has a `runner` target (production). Use `--target runner` for the smallest image.

---

## Kubernetes Deployment

### Prerequisites
- k3s or any Kubernetes cluster
- `kubectl` configured
- `kustomize` installed

### Deploy to Staging

```bash
# Apply staging overlay
kubectl apply -k k8s/overlays/staging

# Watch rollout
kubectl -n ai-task-platform-staging rollout status deployment/backend
kubectl -n ai-task-platform-staging rollout status deployment/frontend
kubectl -n ai-task-platform-staging rollout status deployment/worker
```

### Deploy to Production

```bash
# Update secrets first!
kubectl -n ai-task-platform create secret generic app-secrets \
  --from-literal=MONGODB_URI='mongodb://...' \
  --from-literal=REDIS_PASSWORD='...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=MONGO_ROOT_USERNAME='admin' \
  --from-literal=MONGO_ROOT_PASSWORD='...' \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply production overlay
kubectl apply -k k8s/overlays/production

# Check all pods
kubectl -n ai-task-platform get pods
```

### Verify Deployment

```bash
# Check all resources
kubectl -n ai-task-platform get all

# View backend logs
kubectl -n ai-task-platform logs -l app=backend --tail=50

# View worker logs
kubectl -n ai-task-platform logs -l app=worker --tail=50

# Check HPA
kubectl -n ai-task-platform get hpa
```

---

## Argo CD Setup

### Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl -n argocd wait --for=condition=ready pod --all --timeout=120s
```

### Register Applications

```bash
# Edit application YAMLs to set your repo URL first
vim k8s/argocd/application-staging.yaml
vim k8s/argocd/application-prod.yaml

kubectl apply -f k8s/argocd/application-staging.yaml
kubectl apply -f k8s/argocd/application-prod.yaml
```

### Access Dashboard

```bash
# Port-forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Open https://localhost:8080
# Username: admin
# Password:
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

### Auto-sync behavior
- **Staging**: Syncs on every push to `develop` branch
- **Production**: Syncs on every push to `main` branch
- Both environments have `selfHeal: true` to revert manual kubectl changes

---

## CI/CD Pipeline

### Secrets Required in GitHub

| Secret | Description |
|---|---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub password or access token |
| `INFRA_REPO_TOKEN` | GitHub PAT with write access to infra repo |

### Pipeline Flow

```
Push to develop/main
        │
        ▼
  ┌─── Lint ───────────────────────┐
  │  Backend (ESLint)              │
  │  Frontend (ESLint + Vite build)│
  │  Worker (flake8)               │
  └────────────────────────────────┘
        │ (all pass)
        ▼
  Build & Push Docker Images
  Tagged: latest (main) or branch-sha (develop)
        │
        ▼
  Update infra repo kustomization.yaml
  with new image tags
        │
        ▼
  Argo CD detects change → auto-sync
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | API server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | — |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | — |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |

### Worker (`worker/.env`)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `REDIS_PASSWORD` | Redis password |

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `GET` | `/api/auth/me` | Get current user (auth required) |

### Tasks (all require `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks` | List tasks (paginated, filterable) |
| `POST` | `/api/tasks` | Create & queue a task |
| `GET` | `/api/tasks/:id` | Get task detail with logs |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `POST` | `/api/tasks/:id/rerun` | Requeue a failed task |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Full health check (MongoDB + Redis) |
| `GET` | `/health/ready` | Readiness probe |

---

## Project Structure

```
ai-task-platform/
├── backend/                  # Node.js + Express API
│   ├── src/
│   │   ├── models/           # Mongoose models
│   │   ├── routes/           # Express routes
│   │   ├── middleware/       # Auth, error handler
│   │   └── utils/            # DB, Redis, logger
│   └── Dockerfile
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── pages/            # Login, Register, Dashboard, TaskDetail
│   │   ├── components/       # Layout
│   │   ├── context/          # AuthContext
│   │   └── utils/            # Axios instance
│   ├── nginx.conf
│   └── Dockerfile
├── worker/                   # Python background worker
│   ├── worker.py
│   ├── requirements.txt
│   └── Dockerfile
├── k8s/
│   ├── base/                 # Shared K8s manifests
│   ├── overlays/
│   │   ├── staging/          # Staging kustomization
│   │   └── production/       # Production kustomization
│   └── argocd/               # Argo CD Application manifests
├── .github/workflows/        # GitHub Actions CI/CD
├── docker-compose.yml        # Local development
├── ARCHITECTURE.md           # Architecture document
└── README.md
```

---

## License

MIT
