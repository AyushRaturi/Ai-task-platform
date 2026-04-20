# AI Task Processing Platform — Architecture Document

## 1. System Overview

The AI Task Processing Platform is a cloud-native, asynchronous task processing system built on the MERN stack with a Python worker. It separates user-facing concerns (API, frontend) from computation (workers) using Redis as a message queue and MongoDB as the persistent store. All components are containerized, deployed on Kubernetes, and managed via GitOps with Argo CD.

```
User Browser
     │  HTTPS
     ▼
 [Nginx / Ingress]
     │
     ├─────────────────────┐
     ▼                     ▼
[React Frontend]    [Node.js Backend API]
                          │
                ┌─────────┴──────────┐
                ▼                    ▼
          [MongoDB]            [Redis Queue]
                                     │
                              ┌──────┴──────┐
                              ▼             ▼
                         [Worker 1]   [Worker N]
                              │             │
                              └──────┬──────┘
                                     ▼
                               [MongoDB] (status updates)
```

---

## 2. Worker Scaling Strategy

### Horizontal Scaling
Workers are stateless consumers — each pulls jobs independently from the Redis `BRPOP` queue. This makes them trivially horizontally scalable: adding replicas directly increases throughput with no code changes or coordination overhead.

**Kubernetes HPA** automatically scales workers between 2–10 replicas based on:
- CPU utilization > 70%
- Memory utilization > 80%

### Avoiding Duplicate Processing
Redis `BRPOP` is an atomic pop operation. Only one worker receives each job, preventing duplicate execution. If a worker crashes mid-task, the task remains in `running` state. A reconciliation job (or the rerun API endpoint) handles recovery.

### Graceful Shutdown
Workers have `terminationGracePeriodSeconds: 60` in Kubernetes and handle `SIGTERM` by finishing the current job before exiting, preventing lost tasks during pod eviction or rolling updates.

---

## 3. Handling High Task Volume (100k Tasks/Day)

**100k tasks/day ≈ 70 tasks/second at peak**, assuming 2× average peak.

### Queue Layer (Redis)
Redis easily handles 100k+ ops/second on commodity hardware. The task queue is a Redis List — `LPUSH` (producer) and `BRPOP` (consumer) are O(1) operations. At 100k tasks/day, this is negligible for Redis.

### Worker Throughput
Each worker processes simple string operations in <10ms. With 3 workers each doing ~100 tasks/second, theoretical ceiling is ~300 tasks/second — well above the 70/s peak requirement.

**Scaling math:**
- 100k tasks/day ÷ 86,400s = ~1.16 tasks/second average
- With 2× peak headroom: ~2.3 tasks/second at peak
- 2 workers is sufficient for steady state; HPA scales up during burst

### Database Layer
- **Write path**: Task creation and status updates use `insertOne` and `updateOne` with `_id` — both O(1) with MongoDB's default `_id` index.
- **Read path**: Dashboard queries use compound index `{ userId: 1, createdAt: -1 }` for fast pagination.
- **Archival**: At 100k tasks/day with ~1KB per task ≈ 100MB/day. Add a TTL index or archival cron to purge tasks older than 90 days to cap storage at ~9GB.

---

## 4. Database Indexing Strategy

| Collection | Index | Purpose |
|---|---|---|
| `tasks` | `{ userId: 1, createdAt: -1 }` | Dashboard listing — filter by user, sort by date |
| `tasks` | `{ status: 1, createdAt: 1 }` | Worker reconciliation — find stuck tasks |
| `tasks` | `{ userId: 1, status: 1 }` | Filtered task list by status per user |
| `tasks` | `{ _id: 1 }` | Default — task detail lookup by ID |
| `users` | `{ email: 1 }` (unique) | Login lookup |
| `users` | `{ username: 1 }` (unique) | Registration uniqueness check |

**TTL index** (recommended for production):
```js
db.tasks.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }) // 90 days
```

All indexes are defined on the Mongoose schema and created automatically on application startup.

---

## 5. Handling Redis Failure

Redis is used as a **best-effort queue** — tasks are always persisted to MongoDB first, then pushed to Redis. The system is designed so Redis failure is non-fatal.

### Failure Modes

**Redis temporarily unavailable (< 5 minutes):**
- New task records are created in MongoDB with `status: pending`
- The Redis `LPUSH` fails silently (caught, logged as warning)
- Tasks accumulate in MongoDB in `pending` state
- When Redis recovers, a startup reconciliation job scans for `pending` tasks older than 30 seconds and requeues them

**Redis permanently lost:**
- Operators can trigger a manual requeue via the `POST /api/tasks/:id/rerun` endpoint
- A DB-polling fallback mode in the worker can be enabled by setting `WORKER_DB_POLL=true` — the worker then queries MongoDB for `pending` tasks directly

**Preventing data loss:**
- Redis is configured with `appendonly yes` (AOF persistence) in Docker and Kubernetes
- For production, use Redis Sentinel or a managed Redis service (e.g., Upstash, ElastiCache) for automatic failover

---

## 6. Staging & Production Deployment Environments

### Repository Structure
```
atp-infra/
├── k8s/
│   ├── base/               # Shared manifests (same for all envs)
│   └── overlays/
│       ├── staging/        # Patches: 1 replica, staging hostname
│       └── production/     # Patches: 3 replicas, prod hostname, SSL
├── argocd/
│   ├── application-staging.yaml
│   └── application-prod.yaml
```

### Environment Differences

| Aspect | Staging | Production |
|---|---|---|
| Branch | `develop` | `main` |
| Replicas | 1 per service | 2–3 per service |
| Domain | `staging.example.com` | `example.com` |
| SSL redirect | Off | On |
| Resource limits | Lower | Higher |
| Image tag | `develop-<sha>` | `latest` |
| Argo CD sync | Auto (develop branch) | Auto (main branch) |

### Deployment Flow
1. Developer pushes to `develop` → PR checks run
2. PR merged → CI builds images tagged `develop-<sha>`, pushes to Docker Hub
3. CI updates `k8s/overlays/staging/kustomization.yaml` in infra repo
4. Argo CD detects change, syncs staging cluster automatically
5. After QA approval, `develop` is merged to `main`
6. CI builds `latest` images, updates `k8s/overlays/production/kustomization.yaml`
7. Argo CD syncs production with a rolling update (zero downtime)

### Installing Argo CD
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Apply application manifests
kubectl apply -f k8s/argocd/application-staging.yaml
kubectl apply -f k8s/argocd/application-prod.yaml

# Access dashboard
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

---

## 7. Security Architecture

- **Authentication**: JWT (HS256), 7-day expiry, stored in `localStorage`
- **Passwords**: bcrypt with cost factor 12 (~250ms/hash)
- **Transport**: HTTPS enforced in production via Ingress SSL redirect
- **API hardening**: Helmet.js (CSP, HSTS, X-Frame-Options), CORS restricted to frontend origin
- **Rate limiting**: 100 req/15min globally, 20 req/15min on auth endpoints
- **Secrets**: Never hardcoded — passed via Kubernetes Secrets, referenced as env vars
- **Containers**: Non-root user in all Dockerfiles, read-only filesystem where possible
- **Input validation**: Joi schemas on all API endpoints; 10KB body limit

---

## 8. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Queue | Redis List (BRPOP) | Simple, fast, reliable for this scale; no broker setup overhead |
| DB | MongoDB | Flexible schema for task results (string or JSON); natural fit for MERN |
| Worker language | Python | Rich ecosystem for future AI/NLP operations; easy async processing |
| Frontend | React + Vite | Fast HMR, small bundle, no SSR needed for this SPA |
| Container runtime | Docker + k3s | Lightweight Kubernetes for intern-scale deployments |
| GitOps | Argo CD | Industry standard, excellent UI, auto-sync on git push |
| CI | GitHub Actions | Native to GitHub, free for public repos, Docker cache support |
